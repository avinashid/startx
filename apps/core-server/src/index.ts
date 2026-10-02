import { ENV } from "@repo/env";
import { CookieModule } from "@repo/lib/cookie-module";
import { onShutdown, trackHttpServer } from "@repo/lib/shutdown-module";
import { startTracing } from "@repo/observability";
import { closeRedis } from "@repo/redis";
import { health } from "./config/health.js";
import { ServerEvents } from "./events/index.js";
import { app } from "./routes/server.js";

// Off unless OTEL_EXPORTER_OTLP_ENDPOINT is set.
const tracing = startTracing({ serviceName: "core-server" });

// Fail at boot, not on the first login: the cookie config is only read when a cookie is written.
CookieModule.validateConfig();

const server = trackHttpServer(
	app.listen(ENV.PORT, () => {
		ServerEvents.emitServerReady(`Server listening on port ${ENV.PORT}`);
	}),
);

// Fail readiness first so the load balancer stops routing here, then stop accepting connections and
// let in-flight requests finish before Redis goes away. Spans are flushed last, the drain's included.
onShutdown([
	{ name: "readiness", run: () => health.markShuttingDown() },
	{ name: "http server", run: () => server.close() },
	{ name: "redis", run: closeRedis },
	{ name: "tracing", run: () => tracing.shutdown() },
]);
