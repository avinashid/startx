import { startServerSpan } from "@repo/observability";
import type { NextFunction, Request, Response } from "express";

/**
 * Records the route template (`/users/:id`) when Express assigns `req.route`, which is the one moment
 * `req.baseUrl` holds the nested router's prefix: by the time the response finishes after an error,
 * Express has restored `baseUrl`, and the prefix is gone. A parameterised mount path
 * (`app.use("/orgs/:id", …)`) is recorded with its concrete value, so mount routers on static prefixes.
 */
const captureRoute = (req: Request) => {
	let route: unknown;
	let template: string | undefined;
	Object.defineProperty(req, "route", {
		configurable: true,
		enumerable: true,
		get: () => route,
		set: (value: unknown) => {
			route = value;
			if (typeof value === "object" && value !== null && "path" in value && typeof value.path === "string") {
				template = `${req.baseUrl}${value.path}`;
			}
		},
	});
	return () => template;
};

/**
 * One SERVER span per request, continuing an incoming `traceparent`. The rest of the request runs
 * inside it, so a fetch or `withSpan` in a handler is its child. A no-op until `startTracing` has
 * registered a provider (the OTLP endpoint is set).
 */
export const tracingMiddleware = (req: Request, res: Response, next: NextFunction) => {
	const span = startServerSpan({ method: req.method, path: req.path, headers: req.headers });
	const route = captureRoute(req);

	res.once("finish", () => {
		span.end({ statusCode: res.statusCode, route: route() });
	});
	// Fires after finish too; only a connection that went away mid-response is an error here.
	res.once("close", () => {
		if (!res.writableFinished) {
			span.end({ statusCode: res.statusCode, route: route(), error: new Error("client closed the connection") });
		}
	});

	span.run(next);
};
