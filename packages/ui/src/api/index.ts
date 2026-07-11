import { QueryProvider, queryClient } from "./query-provider";
import { ApiSchema } from "./use-api/api-builder";
import { useApi } from "./use-api/react-query/use-api";
import { useApiControl } from "./use-api/react-query/use-api-control";
export * from "@tanstack/react-query";
export { QueryProvider, ApiSchema, useApi, useApiControl, queryClient };
