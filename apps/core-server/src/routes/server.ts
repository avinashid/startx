import cookieParser from "cookie-parser";
import express, { json, urlencoded } from "express";
import helmet from "helmet";

import { ServerConfig } from "@/config/server-config.js";
import { corsMiddleware } from "@/middlewares/cors-middleware.js";
import { errorMiddleware } from "@/middlewares/error-middleware.js";
import { loggerMiddleware } from "@/middlewares/logger-middleware.js";
import { notFoundMiddleware } from "@/middlewares/notfound-middleware.js";
import { apiRateLimiter, authRateLimiter } from "@/middlewares/rate-limit-middleware.js";
import { uploadMiddleware } from "@/middlewares/upload-middleware.js";

import { createFilesRouter } from "./files/router.js";
const app = express();

app.set("trust proxy", ServerConfig.TRUST_PROXY);

/**
 * Order matters: security headers, then the rate limiter, then the origin check, and only then the
 * body parsers.
 *
 * The limiter goes BEFORE cors because a disallowed origin is answered with `next(error)`, which
 * jumps to the error handler — anything downstream of cors is skipped for exactly the requests an
 * attacker controls, and an unthrottled 403 is still an unthrottled request. cors still sits ahead
 * of every parser, so a rejected origin never has its body read into the process.
 *
 * `helmet()`'s defaults suit a JSON API; its CSP has to be relaxed deliberately if this process
 * ever serves a frontend.
 */
app.use(loggerMiddleware);
app.use(helmet());
app.use(apiRateLimiter);
app.use(corsMiddleware);
app.use(cookieParser());
app.use(urlencoded({ extended: true, limit: ServerConfig.MAX_BODY_SIZE }));
app.use(json({ limit: ServerConfig.MAX_BODY_SIZE }));
app.use(uploadMiddleware);

// Live before the router exists: credential endpoints scaffolded under /auth are throttled from
// the first one, rather than waiting for someone to remember the limiter.
app.use("/auth", authRateLimiter);
app.use("/files", createFilesRouter());
app.get("/test", (_req, res) => {
	res.statusCode = 200;
	res.json("OK");
	return;
});

app.use(notFoundMiddleware);
app.use(errorMiddleware);

export { app };
