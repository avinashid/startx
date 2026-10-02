import { context, diag, DiagLogLevel, propagation, trace } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { registerInstrumentations } from "@opentelemetry/instrumentation";
import { UndiciInstrumentation } from "@opentelemetry/instrumentation-undici";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, NodeTracerProvider, type SpanProcessor } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { logger } from "@repo/logger";

import { ObservabilityEnv } from "./config.js";

export type Tracing = {
	enabled: boolean;
	/** Exports every finished span now. */
	forceFlush: () => Promise<void>;
	/** Flushes, then unregisters the provider. A shutdown step; safe to call more than once. */
	shutdown: () => Promise<void>;
};

type StartTracingOptions = {
	/** Used unless OTEL_SERVICE_NAME is set. */
	serviceName: string;
	/** Replaces the OTLP exporter, e.g. a SimpleSpanProcessor over an InMemorySpanExporter in tests. */
	spanProcessor?: SpanProcessor;
	/** Defaults to ObservabilityEnv.OTEL_EXPORTER_OTLP_ENDPOINT. */
	endpoint?: string;
};

const disabled: Tracing = { enabled: false, forceFlush: async () => {}, shutdown: async () => {} };

let active: Tracing | null = null;

// Export failures are otherwise silent: the SDK reports them only through its diag logger.
const bridgeDiagnostics = () => {
	diag.setLogger(
		{
			error: (message, ...args) => logger.error(`[otel] ${message}`, ...args),
			warn: (message, ...args) => logger.warn(`[otel] ${message}`, ...args),
			info: () => {},
			debug: () => {},
			verbose: () => {},
		},
		DiagLogLevel.WARN,
	);
};

/**
 * Registers a global tracer provider that exports over OTLP/HTTP, plus fetch (undici) client spans.
 * Call once, at the top of the app's entry point.
 *
 * Module-patching auto-instrumentation is deliberately absent: the apps are bundled by tsdown, so
 * there is no `express` or `ioredis` module left at runtime for it to patch. Incoming requests are
 * traced with `startServerSpan` instead; undici reports through diagnostics_channel, which works
 * in a bundle.
 */
export const startTracing = ({ serviceName, spanProcessor, endpoint }: StartTracingOptions): Tracing => {
	if (active) {
		logger.warn("startTracing was called twice; keeping the provider that is already running");
		return active;
	}
	const url = endpoint ?? ObservabilityEnv.OTEL_EXPORTER_OTLP_ENDPOINT;
	if (!spanProcessor && !url) {
		logger.info("Tracing is off: OTEL_EXPORTER_OTLP_ENDPOINT is not set");
		return disabled;
	}

	bridgeDiagnostics();
	const processor =
		spanProcessor ?? new BatchSpanProcessor(new OTLPTraceExporter({ url: `${url?.replace(/\/+$/, "")}/v1/traces` }));
	const provider = new NodeTracerProvider({
		resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: ObservabilityEnv.OTEL_SERVICE_NAME ?? serviceName }),
		spanProcessors: [processor],
	});
	// AsyncLocalStorage context and W3C trace-context + baggage propagation.
	provider.register();
	const unregisterInstrumentations = registerInstrumentations({
		tracerProvider: provider,
		instrumentations: [new UndiciInstrumentation()],
	});

	const tracing: Tracing = {
		enabled: true,
		forceFlush: () => provider.forceFlush(),
		shutdown: async () => {
			if (active !== tracing) return;
			active = null;
			unregisterInstrumentations();
			await provider.shutdown();
			trace.disable();
			context.disable();
			propagation.disable();
			diag.disable();
		},
	};
	active = tracing;
	if (url && !spanProcessor) logger.info(`Tracing on: exporting to ${url}`);
	return tracing;
};
