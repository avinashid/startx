import { QueryClient, QueryClientProvider, type QueryClientConfig } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { useState } from "react";
import { ApiHelper } from "./use-api/api-helpers";
type QueryProviderProps = Omit<QueryClientConfig, "client"> & {
	mode?: "development" | "production" | "staging";
	children?: React.ReactNode;
};
export const createQueryClient = (config?: QueryClientConfig) =>
	new QueryClient(
		ApiHelper.merge(
			{
				defaultOptions: {
					queries: {
						refetchOnMount: false,
						refetchOnWindowFocus: false,
						staleTime: ApiHelper.parseTime("5:min"),
					},
					mutations: {
						onError(error: any) {
							console.error(error?.response?.data);
						},
					},
				},
			},
			config
		)
	);

export const queryClient = createQueryClient();

export const QueryProvider = ({ children, mode, ...config }: QueryProviderProps) => {
	const [client] = useState(() => createQueryClient(config));

	return (
		<QueryClientProvider client={client}>
			{mode === "development" && <ReactQueryDevtools initialIsOpen={false} />}
			{children}
		</QueryClientProvider>
	);
};
