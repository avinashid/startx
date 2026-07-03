import { QueryProvider, queryClient } from "./query-provider";
import { ApiSchema } from "./use-api/api-builder";
import { useApi } from "./use-api/react-query/use-api";
import { useApiClient } from "./use-api/react-query/use-api-client";
export * from "@tanstack/react-query";
export { QueryProvider, ApiSchema, useApi, useApiClient, queryClient };
