import { SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { logger } from "@repo/logger";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

import { currentTraceId, startServerSpan, withSpan } from "./spans.js";
import { startTracing, type Tracing } from "./tracing.js";

const PARENT_TRACE = "4bf92f3577b34da6a3ce929d0e0e4736";
const PARENT_SPAN = "00f067aa0ba902b7";

let tracing: Tracing | undefined;
const servers: http.Server[] = [];

afterEach(async () => {
	await tracing?.shutdown();
	tracing = undefined;
	await Promise.all(servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))));
	vi.restoreAllMocks();
});

const listen = async (handler: http.RequestListener) => {
	const server = http.createServer(handler);
	servers.push(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
};

const inMemory = () => {
	const exporter = new InMemorySpanExporter();
	tracing = startTracing({ serviceName: "test-service", spanProcessor: new SimpleSpanProcessor(exporter) });
	return exporter;
};

describe("startTracing", () => {
	it("stays off without an endpoint or a span processor", async () => {
		tracing = startTracing({ serviceName: "test-service" });
		expect(tracing.enabled).toBe(false);
		await expect(withSpan("noop", () => currentTraceId())).resolves.toBeUndefined();
	});

	it("keeps the first provider when called twice", () => {
		inMemory();
		const warn = vi.spyOn(logger, "warn");
		expect(startTracing({ serviceName: "other" })).toBe(tracing);
		expect(warn).toHaveBeenCalledWith(expect.stringContaining("called twice"));
	});

	it("exports to <endpoint>/v1/traces over OTLP/HTTP", async () => {
		const received: Array<{ url?: string; bytes: number }> = [];
		const endpoint = await listen((req, res) => {
			let bytes = 0;
			req.on("data", (chunk: Buffer) => (bytes += chunk.length));
			req.on("end", () => {
				received.push({ url: req.url, bytes });
				res.writeHead(200).end();
			});
		});
		tracing = startTracing({ serviceName: "test-service", endpoint: `${endpoint}/` });
		await withSpan("exported", () => undefined);
		await tracing.forceFlush();
		expect(received).toHaveLength(1);
		expect(received[0]?.url).toBe("/v1/traces");
		expect(received[0]?.bytes).toBeGreaterThan(0);
	});
});

describe("startServerSpan", () => {
	it("continues the caller's trace and is named by the matched route", () => {
		const exporter = inMemory();
		const server = startServerSpan({
			method: "GET",
			path: "/users/42",
			headers: { traceparent: `00-${PARENT_TRACE}-${PARENT_SPAN}-01` },
		});
		server.end({ statusCode: 200, route: "/users/:id" });
		server.end({ statusCode: 500 });

		const [span, ...rest] = exporter.getFinishedSpans();
		expect(rest).toHaveLength(0);
		expect(span?.name).toBe("GET /users/:id");
		expect(span?.kind).toBe(SpanKind.SERVER);
		expect(span?.spanContext().traceId).toBe(PARENT_TRACE);
		expect(span?.parentSpanContext?.spanId).toBe(PARENT_SPAN);
		expect(span?.attributes).toMatchObject({
			"http.request.method": "GET",
			"url.path": "/users/42",
			"http.route": "/users/:id",
			"http.response.status_code": 200,
		});
		expect(span?.status.code).toBe(SpanStatusCode.UNSET);
		expect(span?.resource.attributes["service.name"]).toBe("test-service");
	});

	it("keeps the method-only name without a route, and marks a 5xx failed", () => {
		const exporter = inMemory();
		startServerSpan({ method: "POST", path: "/nowhere", headers: {} }).end({ statusCode: 503 });
		const [span] = exporter.getFinishedSpans();
		expect(span?.name).toBe("POST");
		expect(span?.status.code).toBe(SpanStatusCode.ERROR);
	});

	it("records an error passed to end", () => {
		const exporter = inMemory();
		startServerSpan({ method: "GET", path: "/", headers: {} }).end({
			statusCode: 200,
			error: new Error("socket hang up"),
		});
		const [span] = exporter.getFinishedSpans();
		expect(span?.status).toMatchObject({ code: SpanStatusCode.ERROR, message: "socket hang up" });
		expect(span?.events.map((event) => event.name)).toEqual(["exception"]);
	});

	it("parents withSpan and fetch spans under the request, and propagates traceparent downstream", async () => {
		const exporter = inMemory();
		let downstreamTraceparent: string | undefined;
		const downstream = await listen((req, res) => {
			const header = req.headers.traceparent;
			downstreamTraceparent = typeof header === "string" ? header : undefined;
			res.writeHead(204).end();
		});

		const server = startServerSpan({ method: "GET", path: "/orders", headers: {} });
		const traceId = server.span.spanContext().traceId;
		await server.run(async () => {
			expect(currentTraceId()).toBe(traceId);
			await withSpan("load orders", async () => {
				const response = await fetch(`${downstream}/inventory`);
				expect(response.status).toBe(204);
			});
		});
		server.end({ statusCode: 200, route: "/orders" });
		expect(currentTraceId()).toBeUndefined();

		const spans = exporter.getFinishedSpans();
		const byName = (name: string) => spans.find((span) => span.name === name);
		const root = byName("GET /orders");
		const child = byName("load orders");
		const client = spans.find((span) => span.kind === SpanKind.CLIENT);
		expect(child?.parentSpanContext?.spanId).toBe(root?.spanContext().spanId);
		expect(client?.parentSpanContext?.spanId).toBe(child?.spanContext().spanId);
		expect(client?.spanContext().traceId).toBe(traceId);
		expect(downstreamTraceparent).toMatch(new RegExp(`^00-${traceId}-${client?.spanContext().spanId}-01$`));
	});

	it("withSpan marks a throw failed and rethrows it", async () => {
		const exporter = inMemory();
		await expect(
			withSpan("fails", () => {
				throw new Error("boom");
			}),
		).rejects.toThrow("boom");
		expect(exporter.getFinishedSpans()[0]?.status.code).toBe(SpanStatusCode.ERROR);
	});
});
