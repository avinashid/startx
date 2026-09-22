import type { Request, Response } from "express";
import rateLimit from "express-rate-limit";

import { ServerConfig } from "@/config/server-config.js";

const tooManyRequests = (_req: Request, res: Response) => {
	res.status(429).json({
		success: false,
		message: "Too many requests. Please try again later.",
	});
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
