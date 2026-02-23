import vine from "@vinejs/vine";
import type { Infer, SchemaTypes } from "@vinejs/vine/types";
import type { NextFunction, Request, Response } from "express";

import { logger } from "./logger-module/logger";

export async function validateBody<T extends SchemaTypes>(
	schema: T,
	validate: any,
): Promise<{
	data?: Infer<T>;
	error: string[];
}> {
	try {
		const validator = vine.compile(schema as any);
		const payload = (await validator.validate(validate)) as Infer<T>;
		return { data: payload, error: [] };
	} catch (error: any) {
		return {
			error: error.messages.map((e: any) => {
				return e.message;
			}) as string[],
		};
	}
}

export function bodyValidator<T extends SchemaTypes>(schema: T) {
	return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
		const originalMethod = descriptor.value;

		descriptor.value = async function (
			req: Request<unknown, unknown, Infer<T>>,
			res: Response,
			next: NextFunction,
		) {
			const { error, data } = await validateBody(schema, req.body);
			logger.info(`Body: ${JSON.stringify(req.body, null, 2)} `, {
				logType: "requestBody",
			});
			if (!data || error.length > 0) {
				logger.error(error.join("\n"), { logType: "validationErrors" });
				return res.status(422).json({ message: error.join("\n") });
			}

			req.body = data; // Make req.body type-safe
			return originalMethod.apply(this, [req, res, next]);
		};

		return descriptor;
	};
}
export function paramsValidator(schema: SchemaTypes) {
	return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
		const originalMethod = descriptor.value;

		descriptor.value = async function (req: Request, res: Response, next: NextFunction) {
			const { error, data } = await validateBody(schema, req.params);
			if (!data || error.length > 0) {
				logger.error(error.join("\n"), { logType: "validationErrors" });
				return res.status(422).json({ message: error.join("\n") });
			}
			req.params = data; // Make req.body type-safe
			return originalMethod.apply(this, [req, res, next]);
		};

		return descriptor;
	};
}

export function queryValidator(schema: SchemaTypes) {
	return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
		const originalMethod = descriptor.value;

		descriptor.value = async function (req: Request, res: Response, next: NextFunction) {
			const { error, data } = await validateBody(schema, req.query);
			if (!data || error.length > 0) {
				logger.error(error.join("\n"), { logType: "validationErrors" });
				return res.status(422).json({ message: error.join("\n") });
			}
			req.query = data; // Make req.body type-safe
			return originalMethod.apply(this, [req, res, next]);
		};

		return descriptor;
	};
}

// export function authValidator({ optional = false }: { optional?: boolean } | undefined = {}) {
// 	return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
// 		const originalMethod = descriptor.value;
// 		descriptor.value = async function (req: Request, res: Response, next: NextFunction) {
// 			try {
// 				const accessToken = req.headers["authorization"]?.split(" ")[1];
// 				if (optional && (!accessToken || !TokenModule.verifyAccessToken(accessToken))) {
// 					return originalMethod.apply(this, [req, res, next]);
// 				}
// 				if (!accessToken) {
// 					res.status(401).json({ message: "access token missing" });
// 					return;
// 				}
// 				const payload = TokenModule.verifyAccessToken(accessToken);

// 				if (!payload) {
// 					res.status(401).json({ message: "invalid access token" });
// 					return;
// 				}
// 				req.user = {
// 					id: payload.userID,
// 					email: payload.email
// 				};
// 				return originalMethod.apply(this, [req, res, next]);
// 			} catch (error) {
// 				next(error);
// 			}
// 		};
// 	};
// }

export function mediaBodyValidator(schema: SchemaTypes, optional = false) {
	return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
		const originalMethod = descriptor.value;

		descriptor.value = async function (req: Request, res: Response, next: NextFunction) {
			const files = req.files;
			if (!files && !optional) {
				// throw new ErrorResponse("Add at least one file", 422);
				logger.error("Add at least one file", { logType: "validationErrors" });
				return res.status(422).json({ message: "Add at least one file" });
			}

			const isJSON = (str: any) => {
				try {
					const value = JSON.parse(str as string);

					if (typeof value === "object" || value === null || typeof value === "boolean") {
						return value;
					}
					return str;
				} catch (e) {
					console.log(e)
					return str;
				}
			};

			const parseData = Object.entries(req.body as object).map(([key, value]) => {
				return [key, isJSON(value)];
			});

			const parsedData = Object.fromEntries(parseData);
			logger.info(`Body: ${JSON.stringify(parsedData, null, 2)} `, {
				logType: "requestBody",
			});
			const { error, data } = await validateBody(schema, parsedData);

			if (!data || error.length > 0) {
				logger.error(error.join("\n"), { logType: "validationErrors" });
				return res.status(422).json({ message: error.join("\n") });
			}
			req.body = data;
			req.files = files;
			return originalMethod.apply(this, [req, res, next]);
		};

		return descriptor;
	};
}

export const validateId = vine.object({
	id: vine.string().uuid(),
});

export const paginationValidator = vine.object({
	page: vine
		.number()
		.positive()
		.parse((e: any) => (!e ? 1 : e))
		.optional(),
	limit: vine
		.number()
		.positive()
		.parse((e: any) => (!e ? 10 : e))
		.optional(),
	query: vine
		.string()
		.parse((e: any) => (!e ? "" : e))
		.optional(),
});
