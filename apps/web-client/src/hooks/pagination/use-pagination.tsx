import { useUrlParams } from "../utils/use-url-params";

const usePagination = (options?: {
	limit?: number;
	pageKey?: string;
	limitKey?: string;
	query?: string;
	queryKey?: string;
}) => {
	const pageKey = options?.pageKey ?? "page";
	const limitKey = options?.limitKey ?? "limit";
	const queryKey = options?.queryKey ?? "query";
	const { params, setParams } = useUrlParams({
		[pageKey]: 1,
		[limitKey]: options?.limit ?? 10,
		[queryKey]: options?.query ?? "",
	});

	return {
		limit: params[limitKey] as number,
		page: params[pageKey] as number,
		query: params[queryKey] as string,
		setQuery: (query: string) => setParams({ [queryKey]: query }),
		setPage: (page: number) => setParams({ [pageKey]: page }),
		setLimit: (limit: number) => setParams({ [limitKey]: limit }),
		next: () => setParams({ [pageKey]: Number(params[pageKey]) + 1 }),
		prev: () => setParams({ [pageKey]: Number(params[pageKey]) - 1 }),
	};
};

export default usePagination;
