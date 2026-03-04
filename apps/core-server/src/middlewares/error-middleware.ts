import { ENV } from "@repo/env";
import { ErrorResponse } from "@repo/lib/error-handlers-module";
import { logger } from "@repo/lib/logger-module";
import type { Request, Response } from "express";

interface Error {
	message?: string;
	statusCode?: number;
}

export const errorMiddleware = (error: Error, _req: Request, res: Response) => {
	error.message = error?.message ? error.message : "Internal Server Error";
	error.statusCode = error instanceof ErrorResponse ? error.statusCode : 500;

	if (ENV.NODE_ENV === "development" || error.statusCode === 500) {
		if (error.statusCode === 404) {
			logger.warn(error);
		} else logger.error(error);
	}

	res.status(error.statusCode).json({
		success: false,
		message: error.message,
	});
	return;
};
