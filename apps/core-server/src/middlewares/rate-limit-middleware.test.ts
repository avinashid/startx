import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const warn = vi.fn();
vi.mock("@repo/logger", () => ({ logger: { warn, error: vi.fn(), info: vi.fn() } }));
vi.mock("@/config/server-config.js", () => ({
	ServerConfig: {
		TRUST_PROXY: "loopback",
		RATE_LIMIT_WINDOW_MS: 60_000,
		RATE_LIMIT_MAX: 100,
		AUTH_RATE_LIMIT_WINDOW_MS: 60_000,
		AUTH_RATE_LIMIT_MAX: 10,
	},
}));

const { untrustedProxyWarning } = await import("./rate-limit-middleware.js");
// cors-middleware, imported by the limiter, warns about its localhost defaults at load time.
warn.mockClear();

// Loopback is trusted, so a request to 127.0.0.1 has its X-Forwarded-For honoured; "false" makes
// the same request look like it came through a proxy the app does not trust.
const serve = (trustProxy: string | boolean) => {
	const app = express();
	app.set("trust proxy", trustProxy);
	app.use(untrustedProxyWarning);
	app.get("/", (_req, res) => {
		res.end();
	});
	return app.listen(0, "127.0.0.1");
};

const trusted = serve("loopback");
const untrusted = serve(false);
const url = (server: ReturnType<typeof serve>) => `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

beforeAll(async () => {
	await Promise.all(
		[trusted, untrusted].map((s) => new Promise((r) => (s.listening ? r(null) : s.once("listening", r)))),
	);
});
afterAll(() => {
	trusted.close();
	untrusted.close();
});

describe("untrustedProxyWarning (B57)", () => {
	it("stays quiet when the forwarded header is honoured", async () => {
		await fetch(url(trusted), { headers: { "x-forwarded-for": "203.0.113.7" } });
		expect(warn).not.toHaveBeenCalled();
	});

	it("warns once when a forwarded header is ignored", async () => {
		await fetch(url(untrusted), { headers: { "x-forwarded-for": "203.0.113.7" } });
		await fetch(url(untrusted), { headers: { "x-forwarded-for": "203.0.113.8" } });
		expect(warn).toHaveBeenCalledTimes(1);
		expect(warn.mock.calls[0]?.[0]).toMatch(/TRUST_PROXY/);
	});
});
