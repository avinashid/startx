/** Express hands `req.query` values over as `string | string[]`, never as a parsed number. */
type QueryValue = string | string[] | number | null | undefined;

type PageQuery = { page?: QueryValue; limit?: QueryValue };

export type PageOptions = {
	/** Page size used when `limit` is absent or unusable. Default 10. */
	defaultLimit?: number;
	/** Hard ceiling on `limit`, whatever the client asks for. Default 100. */
	maxLimit?: number;
};

export const DEFAULT_PAGE_LIMIT = 10;
export const MAX_PAGE_LIMIT = 100;

/**
 * Plain decimal or exponent notation only. `Number()` alone would also accept `0x10`, `0b111` and
 * `0o17`, so `?page=0x10` would silently mean page 16 — query strings are not JS literals.
 */
const NUMERIC = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;

/**
 * Parse one user-supplied query value into a positive integer, falling back rather than throwing.
 * Handles every shape a query string can produce: absent, empty, repeated (`?page=1&page=2`),
 * non-numeric, fractional, exponential, `Infinity` and `NaN`.
 */
function toPositiveInt(value: QueryValue, fallback: number): number {
	const raw = Array.isArray(value) ? value[0] : value;

	if (raw === undefined || raw === null) {
		return fallback;
	}

	// `Number("")` and `Number(" ")` are 0, not NaN, so blanks must be rejected before coercion.
	const text = String(raw).trim();
	if (!NUMERIC.test(text)) {
		return fallback;
	}

	const parsed = Number(text);
	if (!Number.isFinite(parsed)) {
		return fallback;
	}

	return clampPositive(Math.trunc(parsed));
}

/** Confine an already-numeric value to `[1, Number.MAX_SAFE_INTEGER]`. */
function clampPositive(value: number): number {
	if (value < 1) {
		return 1;
	}

	return value > Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : value;
}

/**
 * Caller-supplied options get the same treatment as query input. `{ maxLimit: Number(process.env.X) }`
 * with `X` unset is `NaN`, and `Math.max(1, Math.trunc(NaN))` is `NaN` — the guard collapses and
 * `NaN` reaches SQL. Non-finite means "no usable value", so fall back to the module default rather
 * than to no ceiling at all.
 */
function toOptionInt(value: number | undefined, fallback: number): number {
	if (value === undefined || !Number.isFinite(value)) {
		return fallback;
	}

	return clampPositive(Math.trunc(value));
}

export class Paginator {
	static getPage(query: PageQuery = {}, options: PageOptions = {}) {
		const maxLimit = toOptionInt(options.maxLimit, MAX_PAGE_LIMIT);
		const defaultLimit = Math.min(maxLimit, toOptionInt(options.defaultLimit, DEFAULT_PAGE_LIMIT));

		const limit = Math.min(maxLimit, toPositiveInt(query.limit, defaultLimit));

		// Cap the page so `(page - 1) * limit` can never leave the safe-integer range and turn
		// into an offset the database driver silently rounds. `Math.max(1, …)` matters: without it
		// a limit at the top of the safe range floors the cap to 0 and yields a NEGATIVE offset.
		const maxPage = Math.max(1, Math.floor(Number.MAX_SAFE_INTEGER / limit));
		const page = Math.min(maxPage, toPositiveInt(query.page, 1));
		const offset = (page - 1) * limit;

		return { page, limit, offset };
	}

	static async getTotalCount(
		promise: Promise<
			Array<{
				count: number;
			}>
		>,
	) {
		const result = await promise;
		return result[0]?.count || 0;
	}

	static paginate<T>(query: PageQuery = {}, rows: T[], total: number, options: PageOptions = {}) {
		const { page, limit } = Paginator.getPage(query, options);
		const safeTotal = Number.isFinite(total) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.trunc(total))) : 0;
		const totalPages = Math.ceil(safeTotal / limit);

		return {
			data: rows,
			pagination: {
				total: safeTotal,
				totalPages,
				currentPage: page,
				pageSize: limit,
			},
		};
	}
}
