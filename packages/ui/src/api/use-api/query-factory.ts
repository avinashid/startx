import type { z } from "zod";
import { QueryKey, type RawSchema, type SchemaQueryKeys, type ZParams, type ZQuery } from "./api-types";

export type QueryKeyFactory<ZQ extends ZQuery, ZP extends ZParams> = {
	(input?: { params?: z.input<ZP>; query?: z.input<ZQ> }): QueryKey<string>;
};

function stringifyKeyValue(value: unknown): string {
	if (value === null) return "::null::";
	if (value === undefined) return "";
	return String(value as string);
}
export function makeQueryKeyFactory<StaticKeys extends readonly string[], ZQ extends ZQuery, ZP extends ZParams>(
	staticKey: StaticKeys,
	zParams?: ZP,
	zQuery?: ZQ
): QueryKeyFactory<ZQ, ZP> {
	return input => {
		const key: string[] = [...staticKey.filter(Boolean)];

		if (input?.params && zParams) {
			const shapeKeys = Object.keys(zParams?.shape);

			for (const k of shapeKeys) {
				const v = input.params[k];

				if (v !== undefined) {
					key.push(`params:${k}:${stringifyKeyValue(v)}`);
				}
			}
		}

		if (input?.query && zQuery) {
			const shapeKeys = Object.keys(zQuery?.shape);

			for (const k of shapeKeys) {
				const v = input.query[k];

				if (v !== undefined) {
					if (Array.isArray(v)) {
						for (const item of v) {
							key.push(`query:${k}:${stringifyKeyValue(item)}`);
						}
					} else {
						key.push(`query:${k}:${stringifyKeyValue(v)}`);
					}
				}
			}
		}

		return key as QueryKey<string>;
	};
}

export function createQueryKeysProxy<Schema extends RawSchema>(schema: Schema): SchemaQueryKeys<Schema> {
	return new Proxy(schema, {
		get(target, prop) {
			if (typeof prop === "symbol" || prop === "then") {
				return Reflect.get(target, prop);
			}

			const entry = target[prop as keyof Schema];
			return entry?.queryKey ?? (() => [String(prop)]);
		},
	}) as SchemaQueryKeys<Schema>;
}
