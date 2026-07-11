import { useQueryClient, type Updater, type InfiniteData } from "@tanstack/react-query";
import type { AxiosInstance } from "axios";
import { useMemo } from "react";
import { ApiHelper } from "../api-helpers";
import type { IFetchMutationOptions, IPaginatedData, QueryKey, RawSchema } from "../api-types";
import { createQueryKeysProxy } from "../query-factory";
import type {
	ControlOptions,
	ExtractData,
	ExtractOther,
	MutationEntryKeys,
	MutationVariables,
	QueryEntryKeys,
} from "./types";
import { executeMutation } from "./use-api";

export type ResolvedData<E> = E extends { apiType: "paginated-fetch" }
	? IPaginatedData<ExtractData<E>, ExtractOther<E>>
	: E extends { apiType: "infinite-paginated" }
		? InfiniteData<IPaginatedData<ExtractData<E>, ExtractOther<E>>>
		: ExtractData<E>;

export type ApiControl<Schema extends RawSchema> = {
	invalidate: <K extends QueryEntryKeys<Schema>>(key: K, input?: ControlOptions<Schema[K]>) => Promise<void>;
	refetch: <K extends QueryEntryKeys<Schema>>(key: K, input?: ControlOptions<Schema[K]>) => Promise<void>;
	getData: <K extends QueryEntryKeys<Schema>>(
		key: K,
		input?: ControlOptions<Schema[K]>
	) => ResolvedData<Schema[K]> | undefined;
	setData: <K extends QueryEntryKeys<Schema>>(
		key: K,
		dataOrUpdater: Updater<ResolvedData<Schema[K]> | undefined, ResolvedData<Schema[K]> | undefined>,
		input?: ControlOptions<Schema[K]>
	) => ResolvedData<Schema[K]> | undefined;
	remove: <K extends QueryEntryKeys<Schema>>(key: K, input?: ControlOptions<Schema[K]>) => void;
	reset: <K extends QueryEntryKeys<Schema>>(key: K, input?: ControlOptions<Schema[K]>) => Promise<void>;
	cancel: <K extends QueryEntryKeys<Schema>>(key?: K, input?: ControlOptions<Schema[K]>) => Promise<void>;
	mutate: <K extends MutationEntryKeys<Schema>>(
		key: K,
		variables?: MutationVariables<Schema[K]>
	) => Promise<ExtractData<Schema[K]>>;
	getQueryKey: <K extends QueryEntryKeys<Schema>>(key: K, input?: ControlOptions<Schema[K]>) => QueryKey<string>;
	queryKeys: ReturnType<typeof createQueryKeysProxy<Schema>>;
};

export function useApiControl<Schema extends RawSchema>(schema: Schema, axiosClient?: AxiosInstance) {
	return (): ApiControl<Schema> => {
		const queryClient = useQueryClient();
		const proxy = useMemo(() => createQueryKeysProxy(schema), [schema]);
		const resolveQuery = <K extends QueryEntryKeys<Schema>>(key: K, input?: ControlOptions<Schema[K]>) => {
			const apiType = (schema[key] as { apiType: string }).apiType;
			const { query, ...rest } = (input ?? {}) as { query?: Record<string, unknown>; page?: number; limit?: number };

			if (apiType === "paginated-fetch") return ApiHelper.merge(query, { page: rest.page, limit: rest.limit });
			if (apiType === "infinite-paginated") return ApiHelper.merge(query, { limit: rest.limit });
			return query;
		};

		const getQueryKey = <K extends QueryEntryKeys<Schema>>(
			key: K,
			input?: ControlOptions<Schema[K]>
		): QueryKey<string> => {
			const factory = proxy[key] as unknown as (input?: { params?: unknown; query?: unknown }) => QueryKey<string>;
			return factory({ params: (input as { params?: unknown } | undefined)?.params, query: resolveQuery(key, input) });
		};

		return {
			invalidate: (key, input) => queryClient.invalidateQueries({ queryKey: getQueryKey(key, input) }),

			refetch: (key, input) => queryClient.refetchQueries({ queryKey: getQueryKey(key, input) }),

			getData: (key, input) => queryClient.getQueryData(getQueryKey(key, input)),

			setData: (key, dataOrUpdater, input) => queryClient.setQueryData(getQueryKey(key, input), dataOrUpdater),

			remove: (key, input) => queryClient.removeQueries({ queryKey: getQueryKey(key, input) }),

			reset: (key, input) => queryClient.resetQueries({ queryKey: getQueryKey(key, input) }),

			cancel: (key, input) =>
				key ? queryClient.cancelQueries({ queryKey: getQueryKey(key, input) }) : queryClient.cancelQueries(),

			mutate: (key, variables) => {
				if (!axiosClient) {
					throw new Error(`useApiControl: pass an axios instance as the 2nd argument to call mutate("${key}", ...).`);
				}
				return executeMutation(
					schema[key] as IFetchMutationOptions<typeof key>,
					axiosClient,
					proxy,
					queryClient,
					variables
				);
			},

			getQueryKey,
			queryKeys: proxy,
		} as ApiControl<Schema>;
	};
}
