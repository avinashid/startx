import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@repo/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { createHealth } = await import("@repo/observability");
const { createHealthRouter } = await import("./router.js");

let redisUp = true;
const health = createHealth([
	{ name: "redis", run: () => (redisUp ? Promise.resolve("PONG") : Promise.reject(new Error("ECONNREFUSED"))) },
]);

const app = express();
app.use(createHealthRouter(health));
app.get("/other", (_req, res) => {
	res.json("OK");
});
const server = app.listen(0, "127.0.0.1");
const get = (path: string) => fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`);

beforeAll(async () => {
	if (!server.listening) await new Promise((r) => server.once("listening", r));
});
afterAll(() => {
	server.close();
});

describe("health router", () => {
	it("answers /health and /ready, uncached", async () => {
		const live = await get("/health");
		expect(live.status).toBe(200);
		expect(await live.json()).toEqual({ status: "ok" });
		expect(live.headers.get("cache-control")).toBe("no-store");

		const ready = await get("/ready");
		expect(ready.status).toBe(200);
		expect(await ready.json()).toMatchObject({ ok: true, status: "ok", checks: { redis: { ok: true } } });
		expect(ready.headers.get("cache-control")).toBe("no-store");
	});

	it("leaves every other route alone", async () => {
		const other = await get("/other");
		expect(other.status).toBe(200);
		expect(other.headers.get("cache-control")).toBeNull();
	});

	it("is 503 while a dependency is down, and stays live", async () => {
		redisUp = false;
		const ready = await get("/ready");
		expect(ready.status).toBe(503);
		expect(await ready.json()).toMatchObject({ ok: false, status: "unavailable", checks: { redis: { ok: false } } });
		expect((await get("/health")).status).toBe(200);
		redisUp = true;
	});

	it("is 503 once shutdown has started", async () => {
		health.markShuttingDown();
		const ready = await get("/ready");
		expect(ready.status).toBe(503);
		expect(await ready.json()).toMatchObject({ status: "shutting_down" });
	});
});
