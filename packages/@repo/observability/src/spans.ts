import { context, propagation, type Span, SpanKind, SpanStatusCode, trace } from "@opentelemetry/api";
import {
	ATTR_HTTP_REQUEST_METHOD,
	ATTR_HTTP_RESPONSE_STATUS_CODE,
	ATTR_HTTP_ROUTE,
	ATTR_URL_PATH,
} from "@opentelemetry/semantic-conventions";

const TRACER = "@repo/observability";

const tracer = () => trace.getTracer(TRACER);

const recordError = (span: Span, error: unknown) => {
	span.recordException(error instanceof Error ? error : String(error));
	span.setStatus({ code: SpanStatusCode.ERROR, message: error instanceof Error ? error.message : undefined });
};

export type ServerSpan = {
	span: Span;
	/** Runs `fn` with this span active, so spans started inside it (fetch, withSpan) become its children. */
	run: <T>(fn: () => T) => T;
	/** Ends the span once; later calls are ignored. A 5xx or an error marks it failed. */
	end: (result: { statusCode?: number; route?: string; error?: unknown }) => void;
};

/**
 * Starts the SERVER span for one incoming HTTP request, continuing the caller's trace when the
 * request carries a W3C `traceparent` header. Framework-agnostic: an Express or Hono middleware
 * calls it, runs the rest of the request inside `run`, and calls `end` when the response is done.
 *
 * The span is named by method alone until `end` supplies the matched route (`GET /users/:id`):
 * a raw path in the name gives every user id its own span name.
 */
export const startServerSpan = (request: {
	method: string;
	/** Path without the query string, which can carry tokens. */
	path: string;
	headers: Record<string, string | string[] | undefined>;
}): ServerSpan => {
	const parent = propagation.extract(context.active(), request.headers);
	const span = tracer().startSpan(
		request.method,
		{
			kind: SpanKind.SERVER,
			attributes: { [ATTR_HTTP_REQUEST_METHOD]: request.method, [ATTR_URL_PATH]: request.path },
		},
		parent,
	);
	const active = trace.setSpan(parent, span);
	let ended = false;

	return {
		span,
		run: (fn) => context.with(active, fn),
		end: ({ statusCode, route, error }) => {
			if (ended) return;
			ended = true;
			if (route) {
				span.setAttribute(ATTR_HTTP_ROUTE, route);
				span.updateName(`${request.method} ${route}`);
			}
			if (statusCode !== undefined) span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, statusCode);
			if (error !== undefined) recordError(span, error);
			else if (statusCode !== undefined && statusCode >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
			span.end();
		},
	};
};

/** Runs `fn` inside a child span of whatever is active; a throw marks the span failed and is rethrown. */
export const withSpan = <T>(name: string, fn: (span: Span) => T | Promise<T>): Promise<T> =>
	tracer().startActiveSpan(name, async (span) => {
		try {
			return await fn(span);
		} catch (error) {
			recordError(span, error);
			throw error;
		} finally {
			span.end();
		}
	});

/** The active trace id, for log correlation; undefined outside a sampled span. */
export const currentTraceId = (): string | undefined => {
	const spanContext = trace.getActiveSpan()?.spanContext();
	return spanContext && trace.isSpanContextValid(spanContext) ? spanContext.traceId : undefined;
};
