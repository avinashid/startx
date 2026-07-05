import { ENV } from "@repo/env";
import { logger } from "@repo/logger";
import type { NextFunction, Request, Response } from "express";

const SKIPPED_PREFIXES = ["/static", "/_next"];

const shouldSkip = (path: string) => path === "/health" || SKIPPED_PREFIXES.some(prefix => path.startsWith(prefix));

const resolveIp = (req: Request) =>
	req.ip || (req.headers["x-forwarded-for"] as string | undefined) || req.socket?.remoteAddress || "-";

const levelForStatus = (status: number) => (status >= 500 ? "error" : status >= 400 ? "warn" : "http");

const loggerMiddleware = (req: Request, res: Response, next: NextFunction) => {
	if (shouldSkip(req.path) || ENV.LOG_LEVEL !== "debug") {
		next();
		return;
	}

	const startedAt = process.hrtime.bigint();

	res.on("finish", () => {
		const { method, originalUrl: url } = req;
		const { statusCode: status } = res;
		const responseTimeMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
		const user = req.user ? { id: req.user.id, email: req.user.email } : null;

		logger.log(levelForStatus(status), `${method} ${url} ${status} - ${responseTimeMs.toFixed(1)}ms`, {
			logType: "routeInfo",
			method,
			url,
			status,
			responseTimeMs: Number(responseTimeMs.toFixed(1)),
			ip: resolveIp(req),
			user,
		});
	});

	next();
};

export { loggerMiddleware };
