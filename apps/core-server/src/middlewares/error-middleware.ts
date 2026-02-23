import { ErrorResponse, logger } from "@repo/lib";
import type { NextFunction, Request, Response } from "express";

interface Error {
	message?: string;
	statusCode?: number;
}

export const errorMiddleware = (error: Error, req: Request, res: Response, next: NextFunction) => {
	error.message = error?.message ? error.message : "Internal Server Error";
	error.statusCode = error instanceof ErrorResponse ? error.statusCode : 500;

	if (process.env.NODE_ENV === "development" || error.statusCode === 500) {
		if (error.statusCode === 404) {
		} else logger.error(error);
	}

	res.status(error.statusCode).json({
		success: false,
		message: error.message,
	});
	return;
};
