import { logger } from "@repo/logger";

export type HealthCheck = {
	name: string;
	/** Resolves when the dependency is usable; a throw or a rejection fails the check. */
	run: () => unknown;
	/** Overrides the default per-check timeout. */
	timeoutMs?: number;
};

export type CheckResult = { ok: boolean; durationMs: number };

export type Readiness = {
	ok: boolean;
	status: "ok" | "unavailable" | "shutting_down";
	checks: Record<string, CheckResult>;
};

export type Health = {
	/** Liveness: the process is up and its event loop answers. Checks no dependency. */
	liveness: () => { status: "ok" };
	/** Readiness: every check passed within its timeout, and no shutdown has started. */
	readiness: () => Promise<Readiness>;
	/** Readiness reports `shutting_down` from now on, so the load balancer stops routing here. */
	markShuttingDown: () => void;
};

const withTimeout = async (run: () => unknown, timeoutMs: number) => {
	let timer: NodeJS.Timeout | undefined;
	try {
		await Promise.race([
			// Inside then(), so a check that throws synchronously is a rejection too.
			Promise.resolve().then(run),
			new Promise((_, reject) => {
				timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
			}),
		]);
	} finally {
		clearTimeout(timer);
	}
};

/**
 * Liveness and readiness for `/health` and `/ready`. Keep them apart: a liveness probe that checks
 * Redis restarts every replica when Redis blips, which fixes nothing.
 *
 * A failed check is logged with its error, but the response only says which check failed: the
 * endpoint is unauthenticated, and an error message carries hostnames and ports.
 */
export const createHealth = (checks: HealthCheck[], { timeoutMs = 2_000 }: { timeoutMs?: number } = {}): Health => {
	let shuttingDown = false;

	const runCheck = async (check: HealthCheck): Promise<CheckResult> => {
		const started = performance.now();
		const durationMs = () => Math.round(performance.now() - started);
		try {
			await withTimeout(check.run, check.timeoutMs ?? timeoutMs);
			return { ok: true, durationMs: durationMs() };
		} catch (error) {
			logger.warn(`Readiness check "${check.name}" failed`, { error });
			return { ok: false, durationMs: durationMs() };
		}
	};

	return {
		liveness: () => ({ status: "ok" }),
		readiness: async () => {
			if (shuttingDown) return { ok: false, status: "shutting_down", checks: {} };
			const results = await Promise.all(checks.map(async (check) => [check.name, await runCheck(check)] as const));
			const ok = results.every(([, result]) => result.ok);
			return { ok, status: ok ? "ok" : "unavailable", checks: Object.fromEntries(results) };
		},
		markShuttingDown: () => {
			shuttingDown = true;
		},
	};
};
