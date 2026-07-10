import type { AxiosError } from "axios";
import { z, ZodTypeAny, type ZodObject, type ZodType } from "zod";

export type ApiType = "fetch" | "mutation" | "paginated-fetch" | "infinite-paginated";
export type ApiMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

export type TimeUnit = "ms" | "sec" | "min" | "hour";
export type TimeString = `${number}:${TimeUnit}`;

export type AutoSuggest<T extends string> = T | (string & {});
export type QueryKey<K extends string> = [AutoSuggest<K>, ...string[]];

export type RawSchema = Record<string, any>;
export type RawSchemaKeys<Schema extends RawSchema> = Extract<keyof Schema, string>;

export type SchemaQueryKeys<Schema extends RawSchema> = {
	[K in keyof Schema & string]: Schema[K] extends { queryKey: (...args: any[]) => any } ? Schema[K]["queryKey"] : never;
};

export type ValidParamValue = string | number | boolean | null | undefined;
export type ValidQueryValue = ValidParamValue | ValidParamValue[];
export type ZParams = ZodObject<Record<string, ZodType<ValidParamValue>>>;
export type ZQuery = ZodObject<Record<string, ZodType<ValidQueryValue>>>;

export interface IBaseApi<ID, ZQ extends ZQuery, ZP extends ZParams> {
	apiType: ApiType;
	route: string;
	method?: ApiMethod;
	zQuery?: ZQ;
	zParams?: ZP;
	data?: ID;
	retry?: { count: number; interval: number };
}

export type CbAction<
	Schema extends RawSchema,
	IP extends z.output<ZParams>,
	IQ extends z.output<ZQuery>,
	IB,
	ID,
	IK extends string,
	CB,
> = NoInfer<
	| Array<QueryKey<IK>>
	| ((props: { query?: IQ; params?: IP; body?: IB; data?: ID }, queryKeys?: SchemaQueryKeys<Schema>) => CB)
>;

export type QueryEvent<
	IK extends string,
	IQ extends z.output<ZQuery>,
	IP extends z.output<ZParams>,
	IB,
	ID,
	Schema extends RawSchema = RawSchema,
> = {
	fn?: CbAction<Schema, IP, IQ, IB, ID, IK, Promise<void>>;
	invalidateQuery?: CbAction<Schema, IP, IQ, IB, ID, IK, Array<QueryKey<IK>>>;
	refetchQuery?: CbAction<Schema, IP, IQ, IB, ID, IK, Array<QueryKey<IK>>>;
	clearQuery?: CbAction<Schema, IP, IQ, IB, ID, IK, Array<QueryKey<IK>>>;
};

export type QueryEventWithKeys<
	IK extends string,
	IQ extends z.output<ZQuery>,
	IP extends z.output<ZParams>,
	IB,
	ID,
	Schema extends RawSchema,
> = {
	fn?: (props: { query?: IQ; params?: IP; body?: IB; data?: ID }) => Promise<void>;
	invalidateQuery?: CbAction<Schema, IP, IQ, IB, ID, IK, Array<QueryKey<IK>>>;
	refetchQuery?: CbAction<Schema, IP, IQ, IB, ID, IK, Array<QueryKey<IK>>>;
	clearQuery?: CbAction<Schema, IP, IQ, IB, ID, IK, Array<QueryKey<IK>>>;
};

export type IRefetch<
	IK extends string,
	IQ extends z.output<ZQuery>,
	IP extends z.output<ZParams>,
	IB,
	ID,
	Schema extends RawSchema = RawSchema,
> = {
	count?: number;
	delay?: number;
	onMount?: boolean;
	onFocus?: boolean;
	interval?: { ms: number; inBackground?: boolean };
	cb: CbAction<Schema, IP, IQ, IB, ID, IK, Array<QueryKey<IK>>>;
};

export interface IFetchOptions<ID, ZQ extends ZQuery = ZQuery, ZP extends ZParams = ZParams, IK extends string = string>
	extends IBaseApi<ID, ZQ, ZP> {
	apiType: "fetch";
	staleTime?: TimeString | number;
	enable?: { isEnable?: boolean; autoEnable?: boolean };
	key?: string[];
	refetch?: IRefetch<IK, z.output<ZQ>, z.output<ZP>, undefined, ID>;
}

export type IPaginatedData<IData, IOther = unknown> = {
	data: IData[];
	other?: IOther;
	pagination: { total: number; totalPages: number; currentPage: number; pageSize: number };
};

export interface IPaginatedFetchOptions<
	ID,
	IO,
	ZQ extends ZQuery = ZQuery,
	ZP extends ZParams = ZParams,
	IK extends string = string,
> extends IBaseApi<ID, ZQ, ZP> {
	apiType: "paginated-fetch";
	staleTime?: TimeString | number;
	enable?: { isEnable?: boolean; autoEnable?: boolean };
	other?: IO;
	key?: string[];
	refetch?: IRefetch<IK, z.output<ZQ>, z.output<ZP>, undefined, IPaginatedData<ID, IO>>;
}

export interface IInfinitePaginatedFetchOptions<
	ID,
	IO,
	ZQ extends ZQuery = ZQuery,
	ZP extends ZParams = ZParams,
	IK extends string = string,
> extends IBaseApi<ID, ZQ, ZP> {
	apiType: "infinite-paginated";
	staleTime?: TimeString | number;
	enable?: { isEnable?: boolean; autoEnable?: boolean };
	other?: IO;
	key?: string[];
	initialPage?: number;
	refetch?: IRefetch<IK, z.output<ZQ>, z.output<ZP>, undefined, IPaginatedData<ID, IO>>;
}

export interface IFetchMutationOptions<
	IK extends string,
	ZQ extends ZQuery = ZQuery,
	ZB extends ZodTypeAny = ZodTypeAny,
	ZP extends ZParams = ZParams,
	ID = unknown,
> extends IBaseApi<ID, ZQ, ZP> {
	apiType: "mutation";
	isFormData?: boolean;
	validateBody?: boolean;
	staleTime?: TimeString | number;
	zBody?: ZB;
	onSuccess?: QueryEvent<IK, z.output<ZQ>, z.output<ZP>, z.output<ZB>, ID>;
	onFetch?: QueryEvent<IK, z.output<ZQ>, z.output<ZP>, z.output<ZB>, ID>;
	onError?: QueryEvent<IK, z.output<ZQ>, z.output<ZP>, z.output<ZB>, AxiosError<{ message?: string }>>;
	refetch?: IRefetch<IK, z.output<ZQ>, z.output<ZP>, z.output<ZB>, ID>;
}
