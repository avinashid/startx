import type { UseQueryResult, UseMutationResult, UseInfiniteQueryResult, InfiniteData } from "@tanstack/react-query";
import type { z } from "zod";
import type { IPaginatedData, TimeString } from "../api-types";

export type ExtractData<E> = "data" extends keyof E ? Exclude<E["data"], undefined> : unknown;
export type ExtractOther<E> = E extends { other: infer O } ? O : unknown;
export type ExtractZQuery<E> = "zQuery" extends keyof E ? NonNullable<E["zQuery"]> : never;
export type ExtractZParams<E> = "zParams" extends keyof E ? NonNullable<E["zParams"]> : never;
export type ExtractZBody<E> = "zBody" extends keyof E ? NonNullable<E["zBody"]> : never;

export type WithAbort<T> = T & { abort: () => void };

type CommonQueryOptions = {
	staleTime?: number | TimeString;
	enabled?: boolean;
};

export type FetchOptions<E> = CommonQueryOptions & {
	query?: z.output<ExtractZQuery<E>>;
	params?: z.output<ExtractZParams<E>>;
};

export type PaginatedFetchOptions<E> = CommonQueryOptions & {
	query?: z.output<ExtractZQuery<E>>;
	params?: z.output<ExtractZParams<E>>;
	page?: number;
	limit?: number;
};

export type InfinitePaginatedFetchOptions<E> = CommonQueryOptions & {
	query?: z.output<ExtractZQuery<E>>;
	params?: z.output<ExtractZParams<E>>;
	initialPage?: number;
	limit?: number;
};

export type UseInfinitePaginatedApiReturn<E> = WithAbort<
	Omit<UseInfiniteQueryResult<InfiniteData<IPaginatedData<ExtractData<E>, ExtractOther<E>>>>, "data"> & {
		data: Array<ExtractData<E>>;
		pages: Array<IPaginatedData<ExtractData<E>, ExtractOther<E>>>;
		pagination: IPaginatedData<ExtractData<E>, ExtractOther<E>>["pagination"] | undefined;
		other: ExtractOther<E> | undefined;
	}
>;

export type MutationVariables<E> = {
	body?: z.output<ExtractZBody<E>>;
	query?: z.output<ExtractZQuery<E>>;
	params?: z.output<ExtractZParams<E>>;
};

export type MutationOptions<E> = {
	query?: z.output<ExtractZQuery<E>>;
	params?: z.output<ExtractZParams<E>>;
	body?: z.output<ExtractZBody<E>>;
	isFormData?: boolean;
	onSuccess?: (data: ExtractData<E>, variables: MutationVariables<E>) => void;
	onError?: (error: Error, variables: MutationVariables<E>) => void;
	onMutate?: (variables: MutationVariables<E>) => void;
	overwriteEvents?: boolean;
};

export type UseApiOptions<Schema, K extends keyof Schema> = Schema[K] extends infer E
	? E extends { apiType: "fetch" }
		? FetchOptions<E>
		: E extends { apiType: "paginated-fetch" }
			? PaginatedFetchOptions<E>
			: E extends { apiType: "infinite-paginated" }
				? InfinitePaginatedFetchOptions<E>
				: E extends { apiType: "mutation" }
					? MutationOptions<E>
					: never
	: never;

export type UseApiReturn<Schema, K extends keyof Schema> = Schema[K] extends { apiType: "fetch" }
	? WithAbort<UseQueryResult<ExtractData<Schema[K]>>>
	: Schema[K] extends { apiType: "paginated-fetch" }
		? WithAbort<
				UseQueryResult<IPaginatedData<ExtractData<Schema[K]>, Schema[K] extends { other: infer O } ? O : unknown>>
			>
		: Schema[K] extends { apiType: "infinite-paginated" }
			? UseInfinitePaginatedApiReturn<Schema[K]>
			: Schema[K] extends { apiType: "mutation" }
				? WithAbort<UseMutationResult<ExtractData<Schema[K]>, Error, MutationVariables<Schema[K]>>>
				: never;

export type QueryEntryKeys<Schema> = {
	[K in keyof Schema & string]: Schema[K] extends { apiType: "fetch" | "paginated-fetch" | "infinite-paginated" }
		? K
		: never;
}[keyof Schema & string];

export type MutationEntryKeys<Schema> = {
	[K in keyof Schema & string]: Schema[K] extends { apiType: "mutation" } ? K : never;
}[keyof Schema & string];

export type ControlOptions<E> = E extends { apiType: "fetch" }
	? { query?: z.output<ExtractZQuery<E>>; params?: z.output<ExtractZParams<E>> }
	: E extends { apiType: "paginated-fetch" }
		? { query?: z.output<ExtractZQuery<E>>; params?: z.output<ExtractZParams<E>>; page?: number; limit?: number }
		: E extends { apiType: "infinite-paginated" }
			? { query?: z.output<ExtractZQuery<E>>; params?: z.output<ExtractZParams<E>>; limit?: number }
			: never;
