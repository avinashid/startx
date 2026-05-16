import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { type ReactNode } from "react";
import { ApiHelper } from "./use-api/api-helpers";

const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			refetchOnMount: false,
			refetchOnWindowFocus: false,
			staleTime: ApiHelper.parseTime("5:min"),
		},
		mutations: {
			onError(error: any) {
				console.error(error?.response?.data);
				// toast.error(error.response?.data?.message ?? error.message);
			},
		},
	},
});
export const QueryProvider = ({
	children,
	mode,
}: {
	children: ReactNode;
	mode?: "development" | "production" | "staging";
}) => {
	return (
		<QueryClientProvider client={queryClient}>
			{mode === "development" && <ReactQueryDevtools initialIsOpen={false} />}
			{children}
		</QueryClientProvider>
	);
};
