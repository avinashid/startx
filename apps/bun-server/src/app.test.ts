import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/logger", () => ({ logger: { log: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { ENV } = await import("@repo/env");
const { logger } = await import("@repo/logger");
const { createHealth, startTracing, withSpan } = await import("@repo/observability");
const { createApp } = await import("./app.js");
const { BunServerEnv } = await import("./config/env.js");

const exporter = new InMemorySpanExporter();
const tracing = startTracing({ serviceName: "bun-server-test", spanProcessor: new SimpleSpanProcessor(exporter) });

let dependencyUp = true;
const health = createHealth([
	{ name: "db", run: () => (dependencyUp ? Promise.resolve() : Promise.reject(new Error("db at 10.0.0.9 refused"))) },
]);
const app = createApp({ health });
app.get("/items/:id", async (c) => {
	await withSpan("load item", () => undefined);
	return c.json({ id: c.req.param("id") });
});
app.get("/boom", () => {
	throw new Error("secret internal detail");
});

const json = (body: unknown) => ({
	method: "POST",
	headers: { "content-type": "application/json" },
	body: JSON.stringify(body),
});

beforeEach(() => {
	exporter.reset();
	dependencyUp = true;
});
afterAll(async () => {
	await tracing.shutdown();
});

describe("probes", () => {
	it("answers /health and /ready uncached, without a span", async () => {
		const live = await app.request("/health");
		expect(live.status).toBe(200);
		expect(await live.json()).toEqual({ status: "ok" });
		expect(live.headers.get("cache-control")).toBe("no-store");
		const ready = await app.request("/ready");
		expect(ready.status).toBe(200);
		expect(ready.headers.get("cache-control")).toBe("no-store");
		// Registered ahead of the middleware: no security headers, no span.
		expect(ready.headers.get("x-content-type-options")).toBeNull();
		expect(exporter.getFinishedSpans()).toHaveLength(0);
	});

	it("is 503 while a dependency is down, without its error text", async () => {
		dependencyUp = false;
		const ready = await app.request("/ready");
		expect(ready.status).toBe(503);
		const body = await ready.text();
		expect(body).toContain('"db":{"ok":false');
		expect(body).not.toContain("10.0.0.9");
		expect((await app.request("/health")).status).toBe(200);
	});
});

describe("routes", () => {
	it("serves / with security headers and a request id", async () => {
		const response = await app.request("/");
		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({ name: "bun-server" });
		expect(response.headers.get("x-content-type-options")).toBe("nosniff");
		expect(response.headers.get("x-request-id")).toMatch(/^[\w-]+$/);
	});

	it("echoes a valid body and rejects an invalid one with 422 and its issues", async () => {
		const ok = await app.request("/echo", json({ message: "hi" }));
		expect(ok.status).toBe(200);
		expect(await ok.json()).toEqual({ message: "hi" });

		const invalid = await app.request("/echo", json({ message: "" }));
		expect(invalid.status).toBe(422);
		expect(await invalid.json()).toMatchObject({ message: "Invalid request body", issues: [{ path: ["message"] }] });
	});

	it("answers malformed JSON with 400, not 500", async () => {
		const response = await app.request("/echo", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: "{nope",
		});
		expect(response.status).toBe(400);
	});

	it("refuses a body over the limit with 413", async () => {
		const response = await app.request("/echo", json({ message: "x".repeat(BunServerEnv.MAX_BODY_BYTES) }));
		expect(response.status).toBe(413);
	});

	it("answers an unknown route with a JSON 404", async () => {
		const response = await app.request("/nope");
		expect(response.status).toBe(404);
		expect(await response.json()).toEqual({ message: "Route doesn't exist for GET: /nope" });
	});

	it("hides an unhandled error's message and logs it", async () => {
		const response = await app.request("/boom");
		expect(response.status).toBe(500);
		expect(await response.text()).not.toContain("secret internal detail");
		expect(logger.error).toHaveBeenCalledWith("Unhandled error on GET /boom", expect.anything());
	});

	it("allows the configured client origin only", async () => {
		const allowed = await app.request("/", { headers: { origin: ENV.CLIENT_URL } });
		expect(allowed.headers.get("access-control-allow-origin")).toBe(ENV.CLIENT_URL);
		const other = await app.request("/", { headers: { origin: "https://evil.example" } });
		expect(other.headers.get("access-control-allow-origin")).toBeNull();
	});
});

describe("tracing", () => {
	it("names the span by the route template, continues traceparent and parents handler spans", async () => {
		const response = await app.request("/items/42?token=secret", {
			headers: { traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01" },
		});
		expect(response.status).toBe(200);
		const spans = exporter.getFinishedSpans();
		const root = spans.find((span) => span.name === "GET /items/:id");
		const child = spans.find((span) => span.name === "load item");
		expect(root?.spanContext().traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
		expect(root?.attributes).toMatchObject({ "http.route": "/items/:id", "http.response.status_code": 200 });
		expect(JSON.stringify(root?.attributes)).not.toContain("secret");
		expect(child?.parentSpanContext?.spanId).toBe(root?.spanContext().spanId);
	});

	it("keeps a 404 method-only and marks a 500 failed", async () => {
		await app.request("/nope");
		await app.request("/boom");
		const names = exporter.getFinishedSpans().map((span) => [span.name, span.status.code]);
		expect(names).toEqual([
			["GET", 0],
			["GET /boom", 2],
		]);
	});
});
