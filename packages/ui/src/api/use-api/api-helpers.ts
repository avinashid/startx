import { ZodTypeAny, z } from "zod";
import type { QueryKey, TimeString, TimeUnit, ZParams, ZQuery } from "./api-types";

type AnyObject = Record<PropertyKey, unknown>;

type DeepMerge<A, B> = A extends AnyObject
	? B extends AnyObject
		? {
				[K in keyof A | keyof B]: K extends keyof A
					? K extends keyof B
						? DeepMerge<A[K], B[K]>
						: A[K]
					: K extends keyof B
						? B[K]
						: never;
			}
		: A | B
	: A | B;

export class ApiHelper {
	static parseTime(input?: TimeString | number): number | undefined {
		if (input === undefined || input === null) return undefined;
		if (typeof input === "number") return input;

		const [numStr, unit] = input.split(":") as [string, TimeUnit];
		const value = Number(numStr);
		if (isNaN(value)) return undefined;

		switch (unit) {
			case "ms":
				return value;
			case "sec":
				return value * 1000;
			case "min":
				return value * 1000 * 60;
			case "hour":
				return value * 1000 * 60 * 60;
			default:
				return 0;
		}
	}

	static validateSchema(schema: ZodTypeAny, value: unknown) {
		const result = schema.safeParse(value);
		if (result.success) return { success: true as const, data: result.data };

		return {
			success: false as const,
			errors: result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`),
		};
	}

	static buildUrl<ZP extends ZParams = ZParams, ZQ extends ZQuery = ZQuery>({
		route,
		params,
		searchParams,
	}: {
		route: string;
		params?: z.output<ZP>;
		searchParams?: z.output<ZQ>;
	}): string {
		let url = route;

		if (params) {
			for (const [key, value] of Object.entries(params)) {
				if (value === undefined || value === null) continue;

				url = url.replace(`:${key}`, encodeURIComponent(String(value)));
			}
		}

		if (searchParams) {
			const search = new URLSearchParams();

			const sortedKeys = Object.keys(searchParams).sort();

			for (const key of sortedKeys) {
				const value = searchParams[key];

				if (value === undefined || value === null) continue;

				if (Array.isArray(value)) {
					for (const item of value) {
						search.append(key, String(item));
					}
				} else {
					search.set(key, String(value));
				}
			}

			const qs = search.toString();
			if (qs) {
				url += `?${qs}`;
			}
		}

		return url;
	}
	static getQueryKey<IK extends string>(
		key: IK,
		extraKey?: string[],
		input?: {
			query?: Record<string, unknown>;
			params?: Record<string, unknown>;
		}
	): QueryKey<IK> {
		const keys: string[] = [key];

		const append = (prefix: "query" | "params", obj?: Record<string, unknown>) => {
			if (!obj) return;
			const sortedKeys = Object.keys(obj).sort();
			for (const k of sortedKeys) {
				const v = obj[k];
				if (v === undefined) continue;
				if (Array.isArray(v)) {
					for (const item of v) {
						keys.push(`${prefix}:${k}:${item}`);
					}
				} else {
					keys.push(`${prefix}:${k}:${v as string}`);
				}
			}
		};

		append("params", input?.params);
		append("query", input?.query);

		if (extraKey?.length) {
			keys.push(...extraKey.filter(Boolean));
		}

		return keys as QueryKey<IK>;
	}

	private static isPlainObject(value: unknown): value is AnyObject {
		return typeof value === "object" && value !== null && !Array.isArray(value);
	}

	private static isEmpty(value: unknown): boolean {
		if (value == null) return true;
		if (typeof value === "string") return value.length === 0;
		if (Array.isArray(value)) return value.length === 0;
		if (ApiHelper.isPlainObject(value)) return Object.keys(value).length === 0;
		return false;
	}

	static merge<A, B>(first: A, second: B): DeepMerge<A, B> {
		if (ApiHelper.isEmpty(first)) return second as DeepMerge<A, B>;
		if (ApiHelper.isEmpty(second)) return first as DeepMerge<A, B>;

		if (ApiHelper.isPlainObject(first) && ApiHelper.isPlainObject(second)) {
			const out: AnyObject = { ...second, ...first };

			for (const key of Object.keys(second)) {
				if (key in first) {
					out[key] = ApiHelper.merge((first as AnyObject)[key], (second as AnyObject)[key]);
				}
			}

			return out as DeepMerge<A, B>;
		}

		return first as DeepMerge<A, B>;
	}
}
