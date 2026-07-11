import type { z } from "zod";
import { ApiHelper } from "./api-helpers";
import { QueryKey, type RawSchema, type SchemaQueryKeys, type ZParams, type ZQuery } from "./api-types";

export type QueryKeyFactory<ZQ extends ZQuery, ZP extends ZParams> = {
	(input?: { params?: z.input<ZP>; query?: z.input<ZQ> }): QueryKey<string>;
};

export function makeQueryKeyFactory<ZQ extends ZQuery, ZP extends ZParams>(
	schemaKey: string,
	extraStaticKeys: string[] = [],
	_zParams?: ZP,
	_zQuery?: ZQ
): QueryKeyFactory<ZQ, ZP> {
	return input => ApiHelper.getQueryKey(schemaKey, extraStaticKeys, { params: input?.params, query: input?.query });
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
