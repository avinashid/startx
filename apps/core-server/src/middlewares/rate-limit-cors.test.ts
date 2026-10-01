import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@repo/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/config/server-config.js", () => ({
	ServerConfig: {
		TRUST_PROXY: "loopback",
		RATE_LIMIT_WINDOW_MS: 60_000,
		RATE_LIMIT_MAX: 2,
		AUTH_RATE_LIMIT_WINDOW_MS: 60_000,
		AUTH_RATE_LIMIT_MAX: 2,
	},
}));

const { ENV } = await import("@repo/env");
const { apiRateLimiter } = await import("./rate-limit-middleware.js");
const { corsMiddleware } = await import("./cors-middleware.js");

// The same order as routes/server.ts: limiter, then cors.
const app = express();
app.use(apiRateLimiter);
app.use(corsMiddleware);
app.get("/", (_req, res) => {
	res.json("OK");
});
app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	res.status(403).end();
});
const server = app.listen(0, "127.0.0.1");
const url = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

const allowed = ENV.CLIENT_URL;
const evil = "https://evil.example";
const get = (origin: string) => fetch(url(), { headers: { origin } });
const preflight = (origin: string) =>
	fetch(url(), { method: "OPTIONS", headers: { origin, "access-control-request-method": "POST" } });

beforeAll(async () => {
	if (!server.listening) await new Promise((r) => server.once("listening", r));
});
afterAll(() => {
	server.close();
});

describe("rate limiter and cors (B74)", () => {
	it("answers an allowed origin's 429 with CORS headers and does not count its preflights", async () => {
		expect((await get(allowed)).status).toBe(200);
		expect((await get(allowed)).status).toBe(200);

		// Budget is spent, but preflights from an allowed origin are not counted against it.
		for (let i = 0; i < 3; i++) expect((await preflight(allowed)).status).toBe(204);

		const limited = await get(allowed);
		expect(limited.status).toBe(429);
		expect(limited.headers.get("access-control-allow-origin")).toBe(allowed);
		expect(limited.headers.get("access-control-allow-credentials")).toBe("true");
		expect(limited.headers.get("access-control-expose-headers")).toMatch(/Retry-After/);
		expect(limited.headers.get("vary")).toMatch(/Origin/);
	});

	it("still throttles a disallowed origin, preflights included, without CORS headers", async () => {
		const limited = await get(evil);
		expect(limited.status).toBe(429);
		expect(limited.headers.get("access-control-allow-origin")).toBeNull();

		expect((await preflight(evil)).status).toBe(429);
	});
});
