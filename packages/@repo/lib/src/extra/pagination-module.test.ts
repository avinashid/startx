import { describe, expect, it } from "vitest";

import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT, type PageOptions, Paginator } from "./pagination-module.js";

/** The invariants that must hold for EVERY combination of query input and caller options. */
function expectSafe({ page, limit, offset }: ReturnType<typeof Paginator.getPage>) {
	expect(Number.isSafeInteger(page)).toBe(true);
	expect(Number.isSafeInteger(limit)).toBe(true);
	expect(Number.isSafeInteger(offset)).toBe(true);
	expect(page).toBeGreaterThanOrEqual(1);
	expect(limit).toBeGreaterThanOrEqual(1);
	expect(offset).toBeGreaterThanOrEqual(0);
	expect(offset).toBeLessThanOrEqual(Number.MAX_SAFE_INTEGER);
}

type Case = {
	name: string;
	query: Parameters<typeof Paginator.getPage>[0];
	expected: { page: number; limit: number; offset: number };
};

const cases: Case[] = [
	{ name: "no query at all", query: undefined, expected: { page: 1, limit: 10, offset: 0 } },
	{ name: "empty object", query: {}, expected: { page: 1, limit: 10, offset: 0 } },
	{
		name: "normal values",
		query: { page: "3", limit: "25" },
		expected: { page: 3, limit: 25, offset: 50 },
	},
	{
		name: "empty strings",
		query: { page: "", limit: "" },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{
		name: "whitespace only",
		query: { page: "   ", limit: "\t" },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{
		name: "non-numeric",
		query: { page: "abc", limit: "xyz" },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{ name: "zero page", query: { page: "0" }, expected: { page: 1, limit: 10, offset: 0 } },
	{ name: "zero limit", query: { limit: "0" }, expected: { page: 1, limit: 1, offset: 0 } },
	{
		name: "negative page",
		query: { page: "-1", limit: "10" },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{
		name: "negative page and limit",
		query: { page: "-5", limit: "-12" },
		expected: { page: 1, limit: 1, offset: 0 },
	},
	{
		name: "fractional",
		query: { page: "1.5", limit: "10.9" },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{
		name: "fractional page above one",
		query: { page: "2.99", limit: "5" },
		expected: { page: 2, limit: 5, offset: 5 },
	},
	{
		name: "exponential notation limit",
		query: { limit: "1e9" },
		expected: { page: 1, limit: MAX_PAGE_LIMIT, offset: 0 },
	},
	{
		name: "Infinity",
		query: { page: "Infinity", limit: "Infinity" },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{
		name: "-Infinity",
		query: { page: "-Infinity", limit: "-Infinity" },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{
		name: "NaN",
		query: { page: "NaN", limit: "NaN" },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{
		name: "huge integer limit",
		query: { limit: "999999999999999999999" },
		expected: { page: 1, limit: MAX_PAGE_LIMIT, offset: 0 },
	},
	{
		name: "huge integer page is capped to a safe offset",
		query: { page: "999999999999999999999", limit: "10" },
		expected: {
			page: Math.floor(Number.MAX_SAFE_INTEGER / 10),
			limit: 10,
			offset: (Math.floor(Number.MAX_SAFE_INTEGER / 10) - 1) * 10,
		},
	},
	{
		name: "repeated query params arrive as an array",
		query: { page: ["2", "9"], limit: ["5", "50"] },
		expected: { page: 2, limit: 5, offset: 5 },
	},
	{
		name: "empty array",
		query: { page: [], limit: [] },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{
		name: "null values",
		query: { page: null, limit: null },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{
		name: "numbers instead of strings",
		query: { page: 4, limit: 20 },
		expected: { page: 4, limit: 20, offset: 60 },
	},
	{
		name: "hex literal is not a query-string number",
		query: { page: "0x10" },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{
		name: "binary literal is not a query-string number",
		query: { page: "0b111" },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{
		name: "octal literal is not a query-string number",
		query: { page: "0o17" },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{
		name: "numeric separators are not accepted",
		query: { limit: "1_000" },
		expected: { page: 1, limit: 10, offset: 0 },
	},
	{
		name: "leading plus and decimal point are accepted",
		query: { page: "+3", limit: ".5" },
		expected: { page: 3, limit: 1, offset: 2 },
	},
	{
		name: "sql injection attempt",
		query: { page: "1; DROP TABLE users", limit: "10 OR 1=1" },
		expected: { page: 1, limit: 10, offset: 0 },
	},
];

/** Hostile / accidental values for the CALLER-supplied options object, not the query string. */
const optionCases: Array<{ name: string; options: PageOptions }> = [
	{ name: "no options", options: {} },
	{ name: "NaN maxLimit (unset env var)", options: { maxLimit: Number(undefined) } },
	{ name: "NaN defaultLimit", options: { defaultLimit: NaN } },
	{ name: "both NaN", options: { maxLimit: NaN, defaultLimit: NaN } },
	{ name: "Infinity maxLimit", options: { maxLimit: Infinity } },
	{ name: "-Infinity maxLimit", options: { maxLimit: -Infinity } },
	{ name: "Infinity defaultLimit", options: { defaultLimit: Infinity } },
	{ name: "maxLimit above the safe-integer range", options: { maxLimit: 1e17 } },
	{ name: "defaultLimit above the safe-integer range", options: { defaultLimit: 1e17 } },
	{ name: "maxLimit at MAX_SAFE_INTEGER", options: { maxLimit: Number.MAX_SAFE_INTEGER } },
	{ name: "zero maxLimit", options: { maxLimit: 0 } },
	{ name: "negative maxLimit", options: { maxLimit: -5 } },
	{ name: "negative defaultLimit", options: { defaultLimit: -5 } },
	{ name: "fractional options", options: { maxLimit: 10.9, defaultLimit: 2.9 } },
	{ name: "raised ceiling", options: { maxLimit: 1000, defaultLimit: 250 } },
];

describe("Paginator.getPage", () => {
	it.each(cases)("$name", ({ query, expected }) => {
		expect(Paginator.getPage(query)).toEqual(expected);
	});

	it.each(cases)("$name — holds the safety invariants", ({ query }) => {
		expectSafe(Paginator.getPage(query));
		expect(Paginator.getPage(query).limit).toBeLessThanOrEqual(MAX_PAGE_LIMIT);
	});

	it("uses the documented defaults", () => {
		expect(Paginator.getPage()).toEqual({ page: 1, limit: DEFAULT_PAGE_LIMIT, offset: 0 });
	});

	it("lets a caller raise the ceiling deliberately", () => {
		expect(Paginator.getPage({ limit: "500" }, { maxLimit: 1000 }).limit).toBe(500);
		expect(Paginator.getPage({ limit: "5000" }, { maxLimit: 1000 }).limit).toBe(1000);
	});

	it("lets a caller change the default page size", () => {
		expect(Paginator.getPage({}, { defaultLimit: 50 }).limit).toBe(50);
	});

	it("never lets defaultLimit escape maxLimit", () => {
		expect(Paginator.getPage({}, { defaultLimit: 500, maxLimit: 20 }).limit).toBe(20);
	});

	it("survives a nonsense maxLimit", () => {
		expect(Paginator.getPage({ limit: "50" }, { maxLimit: 0 }).limit).toBe(1);
		expect(Paginator.getPage({ limit: "50" }, { maxLimit: -5 }).limit).toBe(1);
	});
});

describe("Paginator.getPage — caller-supplied options are hostile input too", () => {
	it.each(optionCases)("$name — holds the safety invariants for every query", ({ options }) => {
		for (const { query } of cases) {
			expectSafe(Paginator.getPage(query, options));
		}
	});

	it("does not let a NaN option collapse the guards", () => {
		// `Math.max(1, Math.trunc(NaN))` is NaN, so an unset env var used as a ceiling used to put
		// NaN straight into SQL LIMIT/OFFSET.
		expect(Paginator.getPage({ page: "2" }, { maxLimit: Number(process.env.UNSET_ON_PURPOSE) })).toEqual({
			page: 2,
			limit: DEFAULT_PAGE_LIMIT,
			offset: 10,
		});
		expect(Paginator.getPage({ page: "2" }, { defaultLimit: NaN })).toEqual({
			page: 2,
			limit: DEFAULT_PAGE_LIMIT,
			offset: 10,
		});
	});

	it("does not let a huge ceiling produce a negative offset", () => {
		const result = Paginator.getPage({ limit: "1e17" }, { maxLimit: 1e17 });

		expect(result.page).toBeGreaterThanOrEqual(1);
		expect(result.offset).toBeGreaterThanOrEqual(0);
		expect(result.limit).toBe(Number.MAX_SAFE_INTEGER);
	});

	it("does not let Infinity silently remove the ceiling", () => {
		expect(Paginator.getPage({ limit: "1e9" }, { maxLimit: Infinity }).limit).toBe(MAX_PAGE_LIMIT);
	});
});

describe("Paginator.paginate", () => {
	it("never reports Infinity total pages", () => {
		const result = Paginator.paginate({ limit: "0" }, [], 100);
		expect(Number.isFinite(result.pagination.totalPages)).toBe(true);
		expect(result.pagination.totalPages).toBe(100);
	});

	it("clamps the page size it reports", () => {
		expect(Paginator.paginate({ limit: "1e9" }, [], 1000).pagination.pageSize).toBe(MAX_PAGE_LIMIT);
	});

	it("reports zero pages for an empty result set", () => {
		expect(Paginator.paginate({}, [], 0).pagination).toEqual({
			total: 0,
			totalPages: 0,
			currentPage: 1,
			pageSize: DEFAULT_PAGE_LIMIT,
		});
	});

	it("clamps an absurd total instead of reporting 1e20 pages", () => {
		const { total, totalPages } = Paginator.paginate({}, [], 1e21).pagination;

		expect(total).toBe(Number.MAX_SAFE_INTEGER);
		expect(Number.isSafeInteger(totalPages)).toBe(true);
	});

	it("ignores a NaN or negative total", () => {
		expect(Paginator.paginate({}, [], NaN).pagination.total).toBe(0);
		expect(Paginator.paginate({}, [], -5).pagination.total).toBe(0);
	});

	it("forwards options to getPage", () => {
		expect(Paginator.paginate({ limit: "400" }, [], 800, { maxLimit: 500 }).pagination).toEqual({
			total: 800,
			totalPages: 2,
			currentPage: 1,
			pageSize: 400,
		});
	});
});

describe("Paginator.getTotalCount", () => {
	it("reads the first row's count", async () => {
		await expect(Paginator.getTotalCount(Promise.resolve([{ count: 42 }]))).resolves.toBe(42);
	});

	it("falls back to zero for an empty result", async () => {
		await expect(Paginator.getTotalCount(Promise.resolve([]))).resolves.toBe(0);
	});
});
