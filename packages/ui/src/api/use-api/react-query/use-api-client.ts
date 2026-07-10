import { useQueryClient, type Updater, type InfiniteData } from "@tanstack/react-query";
import { useMemo } from "react";
import type { z } from "zod";
import type { RawSchema, IPaginatedData, QueryKey } from "../api-types";
import { createQueryKeysProxy } from "../query-factory";
import type { ExtractZQuery, ExtractZParams, ExtractData, ExtractOther } from "./types";

export type SafeZodInput<T> = T extends z.ZodTypeAny ? z.input<T> : never;

export type InputArgs<E> = {
	query?: SafeZodInput<ExtractZQuery<E>>;
	params?: SafeZodInput<ExtractZParams<E>>;
};

export type ResolvedData<E> = E extends { apiType: "paginated-fetch" }
	? IPaginatedData<ExtractData<E>, ExtractOther<E>>
	: E extends { apiType: "infinite-paginated" }
		? InfiniteData<IPaginatedData<ExtractData<E>, ExtractOther<E>>>
		: ExtractData<E>;

export function useApiClient<Schema extends RawSchema>(schema: Schema) {
	const queryClient = useQueryClient();
	const proxy = useMemo(() => createQueryKeysProxy(schema), [schema]);

	const getQueryKey = <K extends keyof Schema & string>(key: K, input?: InputArgs<Schema[K]>): QueryKey<string> => {
		const factory = proxy[key] as unknown as (input?: InputArgs<Schema[K]>) => QueryKey<string>;
		return factory(input);
	};

	return {
		invalidate: <K extends keyof Schema & string>(key: K, input?: InputArgs<Schema[K]>) =>
			queryClient.invalidateQueries({ queryKey: getQueryKey(key, input) }),

		refetch: <K extends keyof Schema & string>(key: K, input?: InputArgs<Schema[K]>) =>
			queryClient.refetchQueries({ queryKey: getQueryKey(key, input) }),

		getData: <K extends keyof Schema & string>(key: K, input?: InputArgs<Schema[K]>) =>
			queryClient.getQueryData<ResolvedData<Schema[K]>>(getQueryKey(key, input)),

		setData: <K extends keyof Schema & string>(
			key: K,
			dataOrUpdater: Updater<ResolvedData<Schema[K]> | undefined, ResolvedData<Schema[K]> | undefined>,
			input?: InputArgs<Schema[K]>
		) => queryClient.setQueryData<ResolvedData<Schema[K]>>(getQueryKey(key, input), dataOrUpdater),

		remove: <K extends keyof Schema & string>(key: K, input?: InputArgs<Schema[K]>) =>
			queryClient.removeQueries({ queryKey: getQueryKey(key, input) }),

		reset: <K extends keyof Schema & string>(key: K, input?: InputArgs<Schema[K]>) =>
			queryClient.resetQueries({ queryKey: getQueryKey(key, input) }),

		cancel: <K extends keyof Schema & string>(key?: K, input?: InputArgs<Schema[K]>) =>
			key ? queryClient.cancelQueries({ queryKey: getQueryKey(key, input) }) : queryClient.cancelQueries(),

		getQueryKey,
		queryKeys: proxy,
	};
}
