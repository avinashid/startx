/* eslint-disable @typescript-eslint/no-explicit-any */
import { logger } from "@repo/logger";
import vine from "@vinejs/vine";
import type { Infer, SchemaTypes } from "@vinejs/vine/types";
import type { NextFunction, Request, Response } from "express";

import { ErrorResponse } from "../error-handlers-module/index.js";

export class RouterValidation {
	public static schema = {
		validateId: vine.object({
			id: vine.string().uuid(),
		}),

		pagination: vine.object({
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
		}),
	};

	public static fn = {
		validate: async <T extends SchemaTypes>(schema: T, payload: unknown): Promise<Infer<T>> => {
			try {
				const validator = vine.compile(schema);
				return await validator.validate(payload);
			} catch (err: unknown) {
				if (err && typeof err === "object" && "messages" in err) {
					const messages = (err as { messages: Array<{ message: string }> }).messages;
					const errorMessage = messages.map(e => e.message).join("\n");

					logger.error(errorMessage, { logType: "validationErrors" });
					throw new ErrorResponse(errorMessage, 422);
				}

				logger.error("Validation failed", { logType: "validationErrors" });
				throw new ErrorResponse("Validation failed", 422);
			}
		},

		validateBody: async <T extends SchemaTypes>(schema: T, payload: Request): Promise<Infer<T>> => {
			return await RouterValidation.fn.validate(schema, payload.body);
		},
		validateParams: async <T extends SchemaTypes>(schema: T, payload: Request): Promise<Infer<T>> => {
			return await RouterValidation.fn.validate(schema, payload.params);
		},
		validateQuery: async <T extends SchemaTypes>(schema: T, payload: Request): Promise<Infer<T>> => {
			return await RouterValidation.fn.validate(schema, payload.query);
		},
		validateMediaBody: async <T extends SchemaTypes>(
			schema: T,
			req: Request<any, any, any, any, Record<string, any>> & { files?: any; file?: any },
			options: { optional?: boolean; multiple?: boolean } = {}
		): Promise<{ data: Infer<T>; media: any }> => {
			const { optional = false, multiple = false } = options;
			const files = req.files || req.file;

			if (!files && !optional) {
				logger.error("Add at least one file", { logType: "validationErrors" });
				throw new ErrorResponse("Add at least one file", 422);
			}

			const isJSON = (str: unknown): unknown => {
				if (typeof str !== "string") return str;

				try {
					return JSON.parse(str);
				} catch {
					return str;
				}
			};

			const parsedData = Object.fromEntries(Object.entries(req.body || {}).map(([k, v]) => [k, isJSON(v)]));

			const data = await RouterValidation.fn.validate(schema, parsedData);

			let media: any = undefined;

			if (files) {
				const filesArray = Array.isArray(files)
					? files
					: typeof files === "object" && files !== null
						? Object.values(files).flat()
						: [files];

				media = multiple ? filesArray : filesArray[0];
			}

			return { data, media };
		},
	};

	public static decorator = {
		body: <T extends SchemaTypes>(schema: T) => {
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
					try {
						const data = await RouterValidation.fn.validate(schema, req.body);

						logger.info(`Body: ${JSON.stringify(req.body, null, 2)}`, {
							logType: "requestBody",
						});

						req.body = data;
						return await originalMethod.call(this, req, res, next);
					} catch (error) {
						next(error);
					}
				} as unknown as F;

				return descriptor;
			};
		},

		params: <T extends SchemaTypes>(schema: T) => {
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
					try {
						const data = await RouterValidation.fn.validate(schema, req.params);
						Object.assign(req.params, data);
						return await originalMethod.call(this, req, res, next);
					} catch (error) {
						next(error);
					}
				} as unknown as F;

				return descriptor;
			};
		},

		query: <T extends SchemaTypes>(schema: T) => {
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
					try {
						const data = await RouterValidation.fn.validate(schema, req.query);
						Object.assign(req.query, data);
						return await originalMethod.call(this, req, res, next);
					} catch (error) {
						next(error);
					}
				} as unknown as F;

				return descriptor;
			};
		},

		mediaBody: <T extends SchemaTypes>(schema: T, optional = false, multiple = false) => {
			return function <
				F extends (
					req: Request<any, any, Infer<T>, any, Record<string, any>> & { files?: any; file?: any; media?: any },
					res: Response<any, Record<string, any>>,
					next: NextFunction
				) => Promise<any> | void,
			>(_target: unknown, _propertyKey: string, descriptor: TypedPropertyDescriptor<F>) {
				const originalMethod = descriptor.value!;

				descriptor.value = async function (
					this: unknown,
					req: Request<any, any, Infer<T>, any, Record<string, any>> & { files?: any; file?: any; media?: any },
					res: Response,
					next: NextFunction
				) {
					try {
						const { data, media } = await RouterValidation.fn.validateMediaBody(schema, req, {
							optional,
							multiple,
						});

						req.body = data;
						req.media = media;

						return await originalMethod.call(this, req, res, next);
					} catch (error) {
						next(error);
					}
				} as unknown as F;

				return descriptor;
			};
		},
	};
}
