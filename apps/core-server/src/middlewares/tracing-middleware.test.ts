import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import express, { Router } from "express";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@repo/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const { startTracing, withSpan } = await import("@repo/observability");
const { tracingMiddleware } = await import("./tracing-middleware.js");

const exporter = new InMemorySpanExporter();
const tracing = startTracing({ serviceName: "core-server-test", spanProcessor: new SimpleSpanProcessor(exporter) });

let slowStarted = false;
let releaseSlow: () => void = () => {};
const users = Router();
users.get("/:id", async (req, res) => {
	await withSpan("load user", () => undefined);
	res.json({ id: req.params.id });
});
users.get("/:id/fail", () => {
	throw new Error("boom");
});

const app = express();
app.use(tracingMiddleware);
app.use("/users", users);
app.get("/slow", async (_req, res) => {
	slowStarted = true;
	await new Promise<void>((resolve) => (releaseSlow = resolve));
	res.json("late");
});
app.use((_req: express.Request, res: express.Response) => {
	res.status(404).json("not found");
});
app.use((_error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
	res.status(500).json("error");
});
const server = app.listen(0, "127.0.0.1");
const base = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

// node:http, not fetch: the test's own fetch is instrumented too, and with no active span it would
// replace the traceparent below with one of its own.
const rawGet = (path: string, headers: Record<string, string> = {}) =>
	new Promise<number | undefined>((resolve, reject) => {
		http.get(`${base()}${path}`, { headers }, (res) => resolve(res.resume().statusCode)).on("error", reject);
	});

const spanNamed = async (name: string) => {
	await vi.waitFor(() => expect(exporter.getFinishedSpans().map((span) => span.name)).toContain(name));
	return exporter.getFinishedSpans().find((span) => span.name === name);
};

beforeAll(async () => {
	if (!server.listening) await new Promise((r) => server.once("listening", r));
});
beforeEach(() => {
	exporter.reset();
});
afterAll(async () => {
	server.close();
	await tracing.shutdown();
});

describe("tracingMiddleware", () => {
	it("names the span by the full route template across a nested router, with handler spans as children", async () => {
		const status = await rawGet("/users/42?token=secret", {
			traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01",
		});
		expect(status).toBe(200);

		const root = await spanNamed("GET /users/:id");
		expect(root?.spanContext().traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
		expect(root?.attributes).toMatchObject({
			"http.route": "/users/:id",
			"url.path": "/users/42",
			"http.response.status_code": 200,
		});
		expect(JSON.stringify(root?.attributes)).not.toContain("secret");
		const child = await spanNamed("load user");
		expect(child?.parentSpanContext?.spanId).toBe(root?.spanContext().spanId);
	});

	it("marks a thrown handler's 500 failed", async () => {
		expect(await rawGet("/users/7/fail")).toBe(500);
		const span = await spanNamed("GET /users/:id/fail");
		expect(span?.attributes["http.response.status_code"]).toBe(500);
		expect(span?.status.code).toBe(2);
	});

	it("keeps an unmatched path out of the span name", async () => {
		expect(await rawGet("/no/such/path")).toBe(404);
		const span = await spanNamed("GET");
		expect(span?.attributes["http.route"]).toBeUndefined();
		expect(span?.attributes["http.response.status_code"]).toBe(404);
	});

	it("records a client that went away before the response", async () => {
		const request = http.get(`${base()}/slow`);
		request.on("error", () => {});
		await vi.waitFor(() => expect(slowStarted).toBe(true));
		request.destroy();
		const span = await spanNamed("GET /slow");
		expect(span?.status).toMatchObject({ code: 2, message: "client closed the connection" });
		releaseSlow();
	});
});
