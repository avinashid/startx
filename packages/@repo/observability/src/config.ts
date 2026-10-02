import { defineEnv } from "@repo/env";
import z from "zod";

/**
 * Tracing is off until an OTLP endpoint is configured, so a scaffold boots without a collector.
 * Sampling follows the standard OTEL_TRACES_SAMPLER / OTEL_TRACES_SAMPLER_ARG variables, which the
 * SDK reads itself (default: parentbased_always_on).
 */
export const ObservabilityEnv = defineEnv({
	// Base URL of an OTLP/HTTP collector, e.g. http://localhost:4318. Traces go to <endpoint>/v1/traces.
	OTEL_EXPORTER_OTLP_ENDPOINT: z.url().optional(),
	// Overrides the serviceName an app passes to startTracing.
	OTEL_SERVICE_NAME: z.string().min(1).optional(),
});
