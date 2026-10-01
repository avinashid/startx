import { ENV } from "@repo/env";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import { logger } from "@repo/logger";
import type { NextFunction, Request, Response } from "express";

interface Error {
	message?: string;
	statusCode?: number;
}

/**
 * Express identifies error-handling middleware by arity: the function MUST declare four
 * parameters. Dropping the unused `_next` turns this back into ordinary middleware and errors
 * fall through to Express's default HTML handler.
 */
export const errorMiddleware = (error: Error, _req: Request, res: Response, _next: NextFunction) => {
	const statusCode = error instanceof ErrorResponse ? error.statusCode : (error?.statusCode ?? 500);
	// An unexpected 5xx carries whatever the throwing library put in it — SQL, hostnames, file
	// paths. Only a deliberate ErrorResponse, or development, gets its message through.
	const expose = error instanceof ErrorResponse || statusCode < 500 || ENV.NODE_ENV === "development";
	const message = expose && error?.message ? error.message : "Internal Server Error";

	if (ENV.NODE_ENV === "development" || statusCode >= 500) {
		if (statusCode < 500) {
			logger.warn(error);
		} else logger.error(error);
	}

	res.status(statusCode).json({
		success: false,
		message,
	});
	return;
};
