import { logger } from "@repo/logger";
import type { NextFunction, Request, Response } from "express";
import rateLimit from "express-rate-limit";

import { ServerConfig } from "@/config/server-config.js";

const tooManyRequests = (_req: Request, res: Response) => {
	res.status(429).json({
		success: false,
		message: "Too many requests. Please try again later.",
	});
};

let warnedUntrustedProxy = false;

/**
 * The limiter keys on `req.ip`. With the default `TRUST_PROXY=loopback`, a proxy in another
 * container or an ALB is not trusted, so `req.ip` is the proxy and every client shares one bucket —
 * with no error anywhere. A forwarded header that was not honoured is the one visible symptom, so
 * say so once.
 */
export const untrustedProxyWarning = (req: Request, _res: Response, next: NextFunction) => {
	if (!warnedUntrustedProxy && req.headers["x-forwarded-for"] && req.ip === req.socket.remoteAddress) {
		warnedUntrustedProxy = true;
		logger.warn(
			`Ignored X-Forwarded-For from ${req.ip} (TRUST_PROXY=${String(ServerConfig.TRUST_PROXY)}). If a proxy sits in front of this server, set TRUST_PROXY to its hop count or address, or every client shares one rate-limit bucket.`,
		);
	}
	next();
};

/**
 * The default store is in-memory, so each replica counts independently. With more than one
 * replica, back it with `rate-limit-redis` on top of `@repo/redis`.
 */
export const apiRateLimiter = rateLimit({
	windowMs: ServerConfig.RATE_LIMIT_WINDOW_MS,
	limit: ServerConfig.RATE_LIMIT_MAX,
	standardHeaders: "draft-7",
	legacyHeaders: false,
	handler: tooManyRequests,
});

/** Mount on credential endpoints — login, refresh, password reset, OTP verification. */
export const authRateLimiter = rateLimit({
	windowMs: ServerConfig.AUTH_RATE_LIMIT_WINDOW_MS,
	limit: ServerConfig.AUTH_RATE_LIMIT_MAX,
	standardHeaders: "draft-7",
	legacyHeaders: false,
	skipSuccessfulRequests: true,
	handler: tooManyRequests,
});
