import { zValidator } from "@hono/zod-validator";
import { ENV } from "@repo/env";
import { logger } from "@repo/logger";
import { type Health, startServerSpan } from "@repo/observability";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { bodyLimit } from "hono/body-limit";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { requestId } from "hono/request-id";
import { matchedRoutes } from "hono/route";
import { secureHeaders } from "hono/secure-headers";
import z from "zod";

import { BunServerEnv } from "./config/env.js";

/** The template of the route that answered (`/items/:id`); undefined for a 404, where only middleware matched. */
const answeredRoute = (c: Context) =>
	matchedRoutes(c)
		.filter((route) => route.method !== "ALL")
		.at(-1)?.path;

/** One SERVER span per request; a fetch or `withSpan` in a handler becomes its child. */
const tracing: MiddlewareHandler = async (c, next) => {
	const span = startServerSpan({ method: c.req.method, path: c.req.path, headers: c.req.header() });
	await span.run(next);
	span.end({ statusCode: c.res.status, route: answeredRoute(c), error: c.error });
};

const levelForStatus = (status: number) => (status >= 500 ? "error" : status >= 400 ? "warn" : "http");

const requestLog: MiddlewareHandler = async (c, next) => {
	const started = performance.now();
	await next();
	const ms = (performance.now() - started).toFixed(1);
	logger.log(levelForStatus(c.res.status), `${c.req.method} ${c.req.path} ${c.res.status} - ${ms}ms`);
};

const EchoBody = z.object({ message: z.string().min(1).max(1_000) });

/**
 * The HTTP app, separate from `Bun.serve` in index.ts so tests drive it with `app.request()` and no
 * socket. Order matters: probes, then tracing and logging, then headers, CORS and the body limit,
 * then routes. A route registered before a middleware answers without running it, which is how
 * `/health` and `/ready` skip everything after them.
 */
export const createApp = ({ health }: { health: Health }) => {
	const app = new Hono();

	app.get("/health", (c) => {
		c.header("Cache-Control", "no-store");
		return c.json(health.liveness());
	});
	app.get("/ready", async (c) => {
		const readiness = await health.readiness();
		c.header("Cache-Control", "no-store");
		return c.json(readiness, readiness.ok ? 200 : 503);
	});

	app.use(
		tracing,
		requestLog,
		requestId(),
		secureHeaders(),
		cors({ origin: [ENV.CLIENT_URL, ENV.CORS_URL], credentials: true }),
		bodyLimit({
			maxSize: BunServerEnv.MAX_BODY_BYTES,
			onError: (c) => c.json({ message: "Request body too large" }, 413),
		}),
	);

	app.get("/", (c) => c.json({ name: "bun-server", bun: process.versions.bun ?? null }));

	// An example of a validated route: 422 with the issues, like core-server's RouterValidation.
	app.post(
		"/echo",
		zValidator("json", EchoBody, (result, c) =>
			result.success ? undefined : c.json({ message: "Invalid request body", issues: result.error.issues }, 422),
		),
		(c) => c.json(c.req.valid("json")),
	);

	app.notFound((c) => c.json({ message: `Route doesn't exist for ${c.req.method}: ${c.req.path}` }, 404));

	// An HTTPException carries a response meant for the client; anything else is a bug, logged in
	// full and answered without its message.
	app.onError((error, c) => {
		if (error instanceof HTTPException) return error.getResponse();
		logger.error(`Unhandled error on ${c.req.method} ${c.req.path}`, { error });
		return c.json({ message: "Internal server error" }, 500);
	});

	return app;
};
