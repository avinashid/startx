import { ENV } from "@repo/env";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import { logger } from "@repo/logger";
import cors from "cors";
import type { RequestHandler } from "express";

/**
 * `SERVER_URL` is in the list because a browser sends `Origin` on same-origin POST/PUT/PATCH/DELETE
 * as well: without it the API rejects its own frontend the moment the request is not a GET.
 *
 * `Origin: null` — sandboxed iframes, `file://`, some native webviews — is deliberately NOT
 * allowed. It is unattributable by definition, so it cannot be told apart from an attacker's page,
 * and `credentials: true` would make allowing it a credentialed hole.
 */
const allowedOrigins = [ENV.CLIENT_URL, ENV.CORS_URL, ENV.SERVER_URL].filter(Boolean);

if (ENV.NODE_ENV !== "development" && allowedOrigins.some(origin => origin.includes("localhost"))) {
	logger.warn(
		`CORS allowlist still holds a localhost default (${allowedOrigins.join(", ")}) while NODE_ENV=${ENV.NODE_ENV}. Set CLIENT_URL, CORS_URL and SERVER_URL for this deployment.`
	);
}

const corsHandler = cors({
	origin(origin, callback) {
		// No Origin header at all means a non-browser client (curl, server-to-server), which CORS
		// does not govern. A present-but-unlisted origin is rejected outright rather than answered
		// without the header, so the request never reaches the body parsers.
		if (!origin || allowedOrigins.includes(origin)) {
			callback(null, true);
			return;
		}

		// The origin is not echoed back: it is attacker-controlled and would be reflected into a
		// response body that a client may log or render.
		callback(new ErrorResponse("Origin not allowed", 403));
	},
	credentials: true,
	maxAge: 600,
});

export const corsMiddleware: RequestHandler = (req, res, next) => {
	corsHandler(req, res, (error?: unknown) => {
		if (!error) {
			next();
			return;
		}

		// `cors` sets `Vary: Origin` only on responses it writes itself, so this rejection would
		// otherwise be cacheable under the bare URL and servable to a legitimate origin.
		res.vary("Origin");
		res.setHeader("Cache-Control", "no-store");

		next(error);
	});
};
