import { useUrlParams } from "../utils/use-url-params";

const usePagination = (options?: { limit?: number; pageKey?: string; limitKey?: string }) => {
	const pageKey = options?.pageKey ?? "page";
	const limitKey = options?.limitKey ?? "limit";

	const { params, setParams } = useUrlParams({
		[pageKey]: 1,
		[limitKey]: 10,
	});

	return {
		limit: params[limitKey],
		page: params[pageKey],
		setPage: (page: number) => setParams({ [pageKey]: page }),
		setLimit: (limit: number) => setParams({ [limitKey]: limit }),
		next: () => setParams({ [pageKey]: Number(params[pageKey]) + 1 }),
		prev: () => setParams({ [pageKey]: Number(params[pageKey]) - 1 }),
	};
};

export default usePagination;
