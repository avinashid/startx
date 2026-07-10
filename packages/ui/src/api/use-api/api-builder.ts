import type { AxiosError, AxiosInstance } from "axios";
import { z, ZodTypeAny } from "zod";
import type {
	IFetchOptions,
	IPaginatedFetchOptions,
	IInfinitePaginatedFetchOptions,
	IFetchMutationOptions,
	IRefetch,
	QueryEvent,
	IPaginatedData,
	RawSchema,
	RawSchemaKeys,
	CbAction,
	QueryEventWithKeys,
	QueryKey,
	ZQuery,
	ZParams,
} from "./api-types";
import { makeQueryKeyFactory, createQueryKeysProxy, type QueryKeyFactory } from "./query-factory";
import { useApi } from "./react-query/use-api";

type EnsureUnique<Key extends string, ExistingKeys extends string> = Key extends ExistingKeys
	? `❌ Api key '${Key}' already exists.`
	: Key;

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export class ApiSchema<Schema extends RawSchema = {}> {
	readonly schema: Schema;

	constructor(schema?: Schema) {
		this.schema = schema ?? ({} as Schema);
	}

	private wrapRefetch<IK extends string, IQ extends z.output<ZQuery>, IP extends z.output<ZParams>, IB, ID>(
		refetch: IRefetch<IK, IQ, IP, IB, ID, Schema> | undefined
	): IRefetch<IK, IQ, IP, IB, ID> | undefined {
		if (!refetch) return undefined;
		const { cb, ...rest } = refetch;
		return {
			...rest,
			cb: props => (typeof cb === "function" ? cb(props, createQueryKeysProxy(this.schema)) : cb),
		};
	}

	private wrapQueryEvent<IK extends string, IQ extends z.output<ZQuery>, IP extends z.output<ZParams>, IB, ID>(
		event: QueryEventWithKeys<IK, IQ, IP, IB, ID, Schema> | undefined
	): QueryEvent<IK, IQ, IP, IB, ID> | undefined {
		if (!event) return undefined;
		const wrapped: QueryEvent<IK, IQ, IP, IB, ID> = {};
		const wrapCb = (cb: CbAction<Schema, IP, IQ, IB, ID, IK, Array<QueryKey<string>>>) =>
			typeof cb === "function" ? (props: Parameters<typeof cb>[0]) => cb(props, createQueryKeysProxy(this.schema)) : cb;
		if (event.fn) wrapped.fn = event.fn;
		if (event.invalidateQuery) wrapped.invalidateQuery = wrapCb(event.invalidateQuery);
		if (event.refetchQuery) wrapped.refetchQuery = wrapCb(event.refetchQuery);
		if (event.clearQuery) wrapped.clearQuery = wrapCb(event.clearQuery);
		return wrapped;
	}

	fetch<KEY extends string, ZQ extends ZQuery, ZP extends ZParams, ID = unknown>(
		key: EnsureUnique<KEY, RawSchemaKeys<Schema>>,
		options: Omit<IFetchOptions<ID, ZQ, ZP, string>, "apiType" | "refetch"> & {
			refetch?: IRefetch<KEY | RawSchemaKeys<Schema>, z.output<ZQ>, z.output<ZP>, undefined, ID, Schema>;
		}
	): ApiSchema<Schema & Record<KEY, IFetchOptions<ID, ZQ, ZP, KEY> & { queryKey: QueryKeyFactory<ZQ, ZP> }>> {
		const { refetch, ...rest } = options;
		const entry = {
			...rest,
			apiType: "fetch" as const,
			queryKey: makeQueryKeyFactory(options.key ?? [], options.zParams, options.zQuery),
			refetch: this.wrapRefetch(refetch),
		};
		return new ApiSchema({ ...this.schema, [key]: entry });
	}

	paginatedFetch<KEY extends string, ID, IO, ZQ extends ZQuery, ZP extends ZParams>(
		key: EnsureUnique<KEY, RawSchemaKeys<Schema>>,
		options: Omit<IPaginatedFetchOptions<ID, IO, ZQ, ZP, string>, "apiType" | "refetch"> & {
			refetch?: IRefetch<
				KEY | RawSchemaKeys<Schema>,
				z.output<ZQ>,
				z.output<ZP>,
				undefined,
				IPaginatedData<ID, IO>,
				Schema
			>;
		}
	): ApiSchema<
		Schema & Record<KEY, IPaginatedFetchOptions<ID, IO, ZQ, ZP, KEY> & { queryKey: QueryKeyFactory<ZQ, ZP> }>
	> {
		const { refetch, ...rest } = options;
		const entry = {
			...rest,
			apiType: "paginated-fetch" as const,
			queryKey: makeQueryKeyFactory(options.key ?? [], options.zParams, options.zQuery),
			refetch: this.wrapRefetch(refetch),
		};
		return new ApiSchema({ ...this.schema, [key]: entry });
	}

	infinitePaginatedFetch<KEY extends string, ID, IO, ZQ extends ZQuery, ZP extends ZParams>(
		key: EnsureUnique<KEY, RawSchemaKeys<Schema>>,
		options: Omit<IInfinitePaginatedFetchOptions<ID, IO, ZQ, ZP, string>, "apiType" | "refetch"> & {
			refetch?: IRefetch<
				KEY | RawSchemaKeys<Schema>,
				z.output<ZQ>,
				z.output<ZP>,
				undefined,
				IPaginatedData<ID, IO>,
				Schema
			>;
		}
	): ApiSchema<
		Schema & Record<KEY, IInfinitePaginatedFetchOptions<ID, IO, ZQ, ZP, KEY> & { queryKey: QueryKeyFactory<ZQ, ZP> }>
	> {
		const { refetch, ...rest } = options;
		const entry = {
			...rest,
			apiType: "infinite-paginated" as const,
			queryKey: makeQueryKeyFactory(options.key ?? [], options.zParams, options.zQuery),
			refetch: this.wrapRefetch(refetch),
		};
		return new ApiSchema({ ...this.schema, [key]: entry });
	}

	mutation<KEY extends string, ZQ extends ZQuery, ZB extends ZodTypeAny, ZP extends ZParams, ID = unknown>(
		key: EnsureUnique<KEY, RawSchemaKeys<Schema>>,
		options: Omit<
			IFetchMutationOptions<KEY | RawSchemaKeys<Schema>, ZQ, ZB, ZP, ID>,
			"apiType" | "onSuccess" | "onFetch" | "onError" | "refetch"
		> & {
			onSuccess?: QueryEventWithKeys<KEY | RawSchemaKeys<Schema>, z.output<ZQ>, z.output<ZP>, z.output<ZB>, ID, Schema>;
			onFetch?: QueryEventWithKeys<KEY | RawSchemaKeys<Schema>, z.output<ZQ>, z.output<ZP>, z.output<ZB>, ID, Schema>;
			onError?: QueryEventWithKeys<
				KEY | RawSchemaKeys<Schema>,
				z.output<ZQ>,
				z.output<ZP>,
				z.output<ZB>,
				AxiosError<{ message?: string }>,
				Schema
			>;
			refetch?: IRefetch<KEY | RawSchemaKeys<Schema>, z.output<ZQ>, z.output<ZP>, z.output<ZB>, ID, Schema>;
		}
	): ApiSchema<
		Schema & Record<KEY, IFetchMutationOptions<KEY, ZQ, ZB, ZP, ID> & { queryKey: QueryKeyFactory<ZQ, ZP> }>
	> {
		const { onSuccess, onFetch, onError, refetch, ...rest } = options;
		const entry = {
			...rest,
			apiType: "mutation" as const,
			queryKey: makeQueryKeyFactory([], options.zParams, options.zQuery),
			onSuccess: this.wrapQueryEvent(onSuccess),
			onFetch: this.wrapQueryEvent(onFetch),
			onError: this.wrapQueryEvent(onError),
			refetch: this.wrapRefetch(refetch),
		};
		return new ApiSchema({ ...this.schema, [key]: entry });
	}

	getSchema(): Schema {
		return this.schema;
	}
	getReactQuery(axios: AxiosInstance) {
		return useApi(this.schema, axios);
	}
}
