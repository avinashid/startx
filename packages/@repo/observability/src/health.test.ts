import { logger } from "@repo/logger";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createHealth } from "./health.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("createHealth", () => {
	it("is live without running any check", () => {
		const run = vi.fn();
		expect(createHealth([{ name: "redis", run }]).liveness()).toEqual({ status: "ok" });
		expect(run).not.toHaveBeenCalled();
	});

	it("is ready when every check passes", async () => {
		const readiness = await createHealth([
			{ name: "redis", run: () => Promise.resolve("PONG") },
			{ name: "db", run: () => undefined },
		]).readiness();
		expect(readiness.ok).toBe(true);
		expect(readiness.status).toBe("ok");
		expect(Object.keys(readiness.checks)).toEqual(["redis", "db"]);
		expect(readiness.checks.redis?.ok).toBe(true);
	});

	it("is unavailable when a check rejects or throws, and keeps the error out of the response", async () => {
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => logger);
		const readiness = await createHealth([
			{ name: "redis", run: () => Promise.reject(new Error("connect ECONNREFUSED 10.0.0.5:6379")) },
			{
				name: "db",
				run: () => {
					throw new Error("sync failure");
				},
			},
			{ name: "cache", run: () => true },
		]).readiness();
		expect(readiness).toMatchObject({
			ok: false,
			status: "unavailable",
			checks: { redis: { ok: false }, db: { ok: false }, cache: { ok: true } },
		});
		expect(JSON.stringify(readiness)).not.toContain("10.0.0.5");
		expect(warn).toHaveBeenCalledWith('Readiness check "redis" failed', expect.anything());
	});

	it("fails a check that outlives its timeout", async () => {
		vi.spyOn(logger, "warn").mockImplementation(() => logger);
		const health = createHealth(
			[
				{ name: "hangs", run: () => new Promise(() => {}) },
				{ name: "slow-but-allowed", run: () => new Promise((resolve) => setTimeout(resolve, 30)), timeoutMs: 1_000 },
			],
			{ timeoutMs: 20 },
		);
		const readiness = await health.readiness();
		expect(readiness.checks.hangs?.ok).toBe(false);
		expect(readiness.checks["slow-but-allowed"]?.ok).toBe(true);
	});

	it("reports shutting_down once a shutdown starts, without running checks", async () => {
		const run = vi.fn();
		const health = createHealth([{ name: "redis", run }]);
		health.markShuttingDown();
		expect(await health.readiness()).toEqual({ ok: false, status: "shutting_down", checks: {} });
		expect(run).not.toHaveBeenCalled();
		expect(health.liveness()).toEqual({ status: "ok" });
	});
});
