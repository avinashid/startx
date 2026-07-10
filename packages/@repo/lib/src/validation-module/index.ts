/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from "@repo/logger";
import vine from "@vinejs/vine";
import type { Infer, SchemaTypes } from "@vinejs/vine/types";
import type { NextFunction, Request, Response } from "express";

import { ErrorResponse } from "../error-handlers-module/index.js";

export async function validateBody<T extends SchemaTypes>(
	schema: T,
	payload: unknown
): Promise<{ data?: Infer<T>; error: string[] }> {
	try {
		const validator = vine.compile(schema);
		const data = await validator.validate(payload);

		return { data, error: [] };
	} catch (err: unknown) {
		if (err && typeof err === "object" && "messages" in err) {
			const messages = (err as { messages: Array<{ message: string }> }).messages;
			return {
				error: messages.map(e => e.message),
			};
		}

		return { error: ["Validation failed"] };
	}
}

export function bodyValidator<T extends SchemaTypes>(schema: T) {
	return function <
		F extends (
			req: Request<any, any, Infer<T>, any, Record<string, any>>,
			res: Response<any, Record<string, any>>,
			next: NextFunction
		) => Promise<any> | void,
	>(_target: unknown, _propertyKey: string, descriptor: TypedPropertyDescriptor<F>) {
		const originalMethod = descriptor.value!;

		descriptor.value = async function (
			this: unknown,
			req: Request<any, any, Infer<T>, any, Record<string, any>>,
			res: Response,
			next: NextFunction
		) {
			const { error, data } = await validateBody(schema, req.body);

			logger.info(`Body: ${JSON.stringify(req.body, null, 2)}`, {
				logType: "requestBody",
			});

			if (!data || error.length) {
				logger.error(error.join("\n"), { logType: "validationErrors" });
				return res.status(422).json({ message: error.join("\n") });
			}

			req.body = data;

			return await originalMethod.call(this, req, res, next);
		} as unknown as F;

		return descriptor;
	};
}

export function paramsValidator<T extends SchemaTypes>(schema: T) {
	return function <
		F extends (
			req: Request<any, any, Infer<T>, any, Record<string, any>>,
			res: Response<any, Record<string, any>>,
			next: NextFunction
		) => Promise<any> | void,
	>(_target: unknown, _propertyKey: string, descriptor: TypedPropertyDescriptor<F>) {
		const originalMethod = descriptor.value!;

		descriptor.value = async function (
			this: unknown,
			req: Request<Infer<T>, any, any, any, Record<string, any>>,
			res: Response,
			next: NextFunction
		) {
			const { error, data } = await validateBody(schema, req.params);

			if (!data || error.length) {
				logger.error(error.join("\n"), { logType: "validationErrors" });
				return res.status(422).json({ message: error.join("\n") });
			}

			Object.assign(req.params, data);

			return await originalMethod.call(this, req, res, next);
		} as unknown as F;

		return descriptor;
	};
}

export function queryValidator<T extends SchemaTypes>(schema: T) {
	return function <
		F extends (
			req: Request<any, any, Infer<T>, any, Record<string, any>>,
			res: Response<any, Record<string, any>>,
			next: NextFunction
		) => Promise<any> | void,
	>(_target: unknown, _propertyKey: string, descriptor: TypedPropertyDescriptor<F>) {
		const originalMethod = descriptor.value!;

		descriptor.value = async function (
			this: unknown,
			req: Request<any, any, any, Infer<T>, Record<string, any>>,
			res: Response,
			next: NextFunction
		) {
			const { error, data } = await validateBody(schema, req.query);

			if (!data || error.length) {
				logger.error(error.join("\n"), { logType: "validationErrors" });
				return res.status(422).json({ message: error.join("\n") });
			}

			Object.assign(req.query, data);
			return await originalMethod.call(this, req, res, next);
		} as unknown as F;

		return descriptor;
	};
}

export function mediaBodyValidator<T extends SchemaTypes>(schema: T, optional = false) {
	return function <
		F extends (
			req: Request<any, any, Infer<T>, any, Record<string, any>> & { files?: any },
			res: Response<any, Record<string, any>>,
			next: NextFunction
		) => Promise<any> | void,
	>(_target: unknown, _propertyKey: string, descriptor: TypedPropertyDescriptor<F>) {
		const originalMethod = descriptor.value!;

		descriptor.value = async function (
			this: unknown,
			req: Request<any, any, Infer<T>, any, Record<string, any>> & { files?: any },
			res: Response,
			next: NextFunction
		) {
			const files = req.files;

			if (!files && !optional) {
				logger.error("Add at least one file", { logType: "validationErrors" });
				return res.status(422).json({ message: "Add at least one file" });
			}

			const isJSON = (str: unknown): unknown => {
				if (typeof str !== "string") return str;

				try {
					return JSON.parse(str);
				} catch {
					return str;
				}
			};

			const parsedData = Object.fromEntries(Object.entries(req.body).map(([k, v]) => [k, isJSON(v)]));

			const { error, data } = await validateBody(schema, parsedData);

			if (!data || error.length) {
				logger.error(error.join("\n"), { logType: "validationErrors" });
				return res.status(422).json({ message: error.join("\n") });
			}

			req.body = data;
			req.files = files;

			return await originalMethod.call(this, req, res, next);
		} as unknown as F;

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
		.parse(e => (!e ? 1 : e))
		.optional(),
	limit: vine
		.number()
		.positive()
		.parse(e => (!e ? 10 : e))
		.optional(),
	query: vine
		.string()
		.parse(e => (!e ? "" : e))
		.optional(),
});

export async function validate<T extends SchemaTypes>(schema: T, payload: Infer<T>): Promise<Infer<T>> {
	const result = await validateBody(schema, payload);

	if (result.error.length) {
		throw new ErrorResponse(result.error.join("\n"), 422);
	}

	if (result.data === undefined) {
		throw new ErrorResponse("Validation failed", 422);
	}

	return result.data;
}
