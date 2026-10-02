import { onShutdown } from "@repo/lib/shutdown-module";
import { logger } from "@repo/logger";
import { createHealth, startTracing } from "@repo/observability";

import { createApp } from "./app.js";
import { BunServerEnv } from "./config/env.js";

// Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
const tracing = startTracing({ serviceName: "bun-server" });

// What /ready waits on: add a check per hard dependency, as core-server does for Redis.
const health = createHealth([]);

const server = Bun.serve({ port: BunServerEnv.PORT, fetch: createApp({ health }).fetch });
logger.info(`bun-server listening on port ${server.port}`);

// Fail readiness first, then stop accepting connections and wait for in-flight requests, then flush spans.
onShutdown([
	{ name: "readiness", run: () => health.markShuttingDown() },
	{ name: "http server", run: () => server.stop() },
	{ name: "tracing", run: () => tracing.shutdown() },
]);
