import {
	useQuery,
	useMutation,
	useQueryClient,
	type UseQueryOptions,
	type UseQueryResult,
	type UseMutationResult,
} from "@tanstack/react-query";
import { type AxiosError, type AxiosInstance, type AxiosRequestConfig } from "axios";
import { useMemo, useRef } from "react";
import { z } from "zod";
import { FormUtils } from "@repo/ui/lib/utils";
import { ApiHelper } from "../api-helpers";
import type {
	IFetchOptions,
	IPaginatedFetchOptions,
	IFetchMutationOptions,
	IPaginatedData,
	QueryEvent,
	CbAction,
	RawSchema,
	QueryKey,
	ZQuery,
	ZParams,
} from "../api-types";
import { createQueryKeysProxy } from "../query-factory";

import type {
	UseApiOptions,
	UseApiReturn,
	MutationVariables,
	ExtractData,
	FetchOptions,
	PaginatedFetchOptions,
	MutationOptions,
} from "./types";

async function processEvents<
	Schema extends RawSchema,
	IK extends string,
	IQ extends z.output<ZQuery>,
	IP extends z.output<ZParams>,
	IB,
	ID,
>(
	events: QueryEvent<IK, IQ, IP, IB, ID, Schema> | undefined,
	data: ID,
	variables: { query?: IQ; params?: IP; body?: IB } | undefined,
	schemaProxy: ReturnType<typeof createQueryKeysProxy<Schema>>,
	queryClient: ReturnType<typeof useQueryClient>,
	override?: boolean
) {
	if (!events) return;
	const payload = { data, ...variables };
	const runAction = async (
		action: CbAction<Schema, IP, IQ, IB, ID, IK, Array<QueryKey<IK>>> | undefined,
		exec: (key: QueryKey<IK>) => Promise<void>
	) => {
		if (!action) return;
		const keys: Array<QueryKey<IK>> = typeof action === "function" ? action(payload, schemaProxy) : action;
		for (const key of keys) {
			await exec(key);
		}
	};

	await runAction(events.invalidateQuery, key => queryClient.invalidateQueries({ queryKey: key }));
	await runAction(events.refetchQuery, key => queryClient.refetchQueries({ queryKey: key }));
	await runAction(events.clearQuery, key => queryClient.resetQueries({ queryKey: key }));

	if (!override) {
		if (typeof events.fn === "function") await events.fn?.(payload, schemaProxy);
	}
}

function useFetchApi<ID, ZQ extends ZQuery, ZP extends ZParams>(
	key: keyof RawSchema,
	endpoint: IFetchOptions<ID, ZQ, ZP>,
	axiosClient: AxiosInstance,
	options: {
		query?: z.output<ZQ>;
		params?: z.output<ZP>;
		staleTime?: number;
		enabled?: boolean;
	}
): UseQueryResult<ID> & { abort: () => void } {
	const queryClient = useQueryClient();
	const queryKey = useMemo(
		() =>
			ApiHelper.getQueryKey(key, endpoint.key, {
				params: options.params,
				query: options.query,
			}),
		[options.query, options.params]
	);
	const staleTime = ApiHelper.parseTime(ApiHelper.merge(options.staleTime, endpoint.staleTime));

	const query = useQuery<ID>({
		queryKey,
		queryFn: async ({ signal }) => {
			const config: AxiosRequestConfig = {
				method: endpoint.method || "GET",
				url: ApiHelper.buildUrl({
					route: endpoint.route,
					params: options.params,
					searchParams: options.query,
				}),
				params: options.query,
				signal,
			};
			const resp = await axiosClient.request<ID>(config);

			return resp.data;
		},
		staleTime,
		enabled: options.enabled ?? endpoint.enable?.isEnable ?? true,
		retry: endpoint.retry?.count,
		retryDelay: endpoint.retry?.interval,
		refetchInterval: endpoint.refetch?.interval?.ms,
		refetchIntervalInBackground: endpoint.refetch?.interval?.inBackground,
		refetchOnMount: endpoint.refetch?.onMount ? "always" : false,
		refetchOnWindowFocus: endpoint.refetch?.onFocus ? "always" : false,
	} as UseQueryOptions<ID>);

	return {
		...query,
		abort: () => queryClient.cancelQueries({ queryKey }),
	};
}

function usePaginatedFetchApi<ID, IO, ZQ extends ZQuery, ZP extends ZParams>(
	key: keyof RawSchema,
	endpoint: IPaginatedFetchOptions<ID, IO, ZQ, ZP>,
	axiosClient: AxiosInstance,
	options: {
		query?: z.output<ZQ>;
		params?: z.output<ZP>;
		page?: number;
		limit?: number;
		staleTime?: number;
		enabled?: boolean;
	}
): UseQueryResult<{ data: IPaginatedData<ID, IO> }> & { abort: () => void } {
	const queryClient = useQueryClient();
	const mergedQuery = useMemo(
		() =>
			ApiHelper.merge(options.query, {
				page: options.page,
				limit: options.limit,
			}),
		[options.query, options.page, options.limit]
	);

	const queryKey = useMemo(
		() =>
			ApiHelper.getQueryKey(key, endpoint.key, {
				params: options.params,
				query: mergedQuery,
			}),
		[key, endpoint.key, options.params, mergedQuery]
	);

	const staleTime = ApiHelper.parseTime(ApiHelper.merge(options.staleTime, endpoint.staleTime));

	const query = useQuery<{ data: IPaginatedData<ID, IO> }>({
		queryKey,
		queryFn: async ({ signal }) => {
			const config: AxiosRequestConfig = {
				method: endpoint.method || "GET",
				url: ApiHelper.buildUrl({
					route: endpoint.route,
					params: options.params,
					searchParams: mergedQuery,
				}),
				signal,
			};

			const resp = await axiosClient.request<{
				data: IPaginatedData<ID, IO>;
			}>(config);

			return resp.data;
		},
		staleTime,
		enabled: options.enabled ?? endpoint.enable?.isEnable ?? true,
		retry: endpoint.retry?.count,
		retryDelay: endpoint.retry?.interval,
		refetchInterval: endpoint.refetch?.interval?.ms,
		refetchIntervalInBackground: endpoint.refetch?.interval?.inBackground,
		refetchOnMount: endpoint.refetch?.onMount ? "always" : false,
		refetchOnWindowFocus: endpoint.refetch?.onFocus ? "always" : false,
	} as UseQueryOptions<{ data: IPaginatedData<ID, IO> }>);

	return {
		...query,
		abort: () => queryClient.cancelQueries({ queryKey }),
	};
}
function useMutationApi<Schema extends RawSchema, K extends keyof Schema & string>(
	endpoint: IFetchMutationOptions<K>,
	axiosClient: AxiosInstance,
	proxy: ReturnType<typeof createQueryKeysProxy<Schema>>,
	options?: MutationOptions<Schema[K]>
): UseMutationResult<ExtractData<Schema[K]>, Error, MutationVariables<Schema[K]>> & { abort: () => void } {
	const queryClient = useQueryClient();
	const abortControllerRef = useRef<AbortController | null>(null);
	const isFormData = ApiHelper.merge(options?.isFormData, endpoint.isFormData);

	const mutation = useMutation<ExtractData<Schema[K]>, Error, MutationVariables<Schema[K]>>({
		mutationFn: async (variables: MutationVariables<Schema[K]>) => {
			abortControllerRef.current = new AbortController();

			if (endpoint.zBody && endpoint.validateBody !== false && options?.overwriteEvents !== true) {
				const valid = ApiHelper.validateSchema(endpoint.zBody, variables.body);
				if (!valid.success) {
					throw new Error(valid.errors.join(", "));
				}
			}

			const body = ApiHelper.merge(variables.body, options?.body)!;
			const config: AxiosRequestConfig = {
				method: endpoint.method || "POST",
				url: ApiHelper.buildUrl(
					ApiHelper.merge(
						{ route: endpoint.route, params: variables.params, searchParams: variables.query },
						{ route: endpoint.route, params: options?.params, searchParams: options?.query }
					)
				),
				params: ApiHelper.merge(variables.query, options?.query),
				data: isFormData ? FormUtils.getFormData(body!) : body,
				...(isFormData && { headers: { "Content-Type": "multipart/form-data" } }),
				signal: abortControllerRef.current.signal,
			};

			const response = await axiosClient.request<ExtractData<Schema[K]>>(config);

			await processEvents(endpoint.onFetch, response.data, variables, proxy, queryClient, options?.overwriteEvents);

			return response.data;
		},
		onSuccess: async (data, variables) => {
			options?.onSuccess?.(data, variables);
			await processEvents(endpoint.onSuccess, data, variables, proxy, queryClient, options?.overwriteEvents);
		},
		onError: async (error: Error, variables) => {
			options?.onError?.(error, variables);
			await processEvents(
				endpoint.onError,
				error as AxiosError<any>,
				variables,
				proxy,
				queryClient,
				options?.overwriteEvents
			);
		},
		onMutate: options?.onMutate,
	});

	return {
		...mutation,
		abort: () => abortControllerRef.current?.abort(),
	};
}
export function useApi<Schema extends RawSchema>(schema: Schema, axiosClient: AxiosInstance) {
	return <K extends keyof Schema & string>(key: K, options?: UseApiOptions<Schema, K>): UseApiReturn<Schema, K> => {
		const endpoint = schema[key];
		const proxy = useMemo(() => createQueryKeysProxy(schema), [schema]);

		if (endpoint.apiType === "fetch") {
			const ep = endpoint as IFetchOptions<unknown, ZQuery, ZParams>;
			const opts = options as FetchOptions<Schema[K]> | undefined;
			return useFetchApi(key, ep, axiosClient, {
				query: opts?.query,
				params: opts?.params,
				staleTime: ApiHelper.parseTime(ApiHelper.merge(opts?.staleTime, ep.staleTime)),
				enabled: opts?.enabled,
			}) as UseApiReturn<Schema, K>;
		}

		if (endpoint.apiType === "paginated-fetch") {
			const ep = endpoint as IPaginatedFetchOptions<unknown, unknown, ZQuery, ZParams>;
			const opts = options as PaginatedFetchOptions<Schema[K]> | undefined;
			return usePaginatedFetchApi(key, ep, axiosClient, {
				query: opts?.query,
				params: opts?.params,
				staleTime: ApiHelper.parseTime(ApiHelper.merge(opts?.staleTime, ep.staleTime)),
				enabled: opts?.enabled,
			}) as UseApiReturn<Schema, K>;
		}

		if (endpoint.apiType === "mutation") {
			const ep = endpoint as IFetchMutationOptions<K>;
			const opts = options as MutationOptions<Schema[K]> | undefined;
			return useMutationApi(ep, axiosClient, proxy, opts) as UseApiReturn<Schema, K>;
		}
		throw new Error(`Unknown API type: ${endpoint.apiType}`);
	};
}
