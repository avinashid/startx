import { ENV } from "@repo/env";
import { CookieModule } from "@repo/lib/cookie-module";
import { onShutdown } from "@repo/lib/shutdown-module";
import { closeRedis } from "@repo/redis";
import { ServerEvents } from "./events/index.js";
import { app } from "./routes/server.js";

// Fail at boot, not on the first login: the cookie config is only read when a cookie is written.
CookieModule.validateConfig();

const server = app.listen(ENV.PORT, () => {
	ServerEvents.emitServerReady(`Server listening on port ${ENV.PORT}`);
});

// Stop accepting connections and let in-flight requests finish before Redis goes away.
onShutdown([
	{
		name: "http server",
		run: () => new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve()))),
	},
	{ name: "redis", run: closeRedis },
]);
