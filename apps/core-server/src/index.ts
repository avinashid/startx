import { ENV } from "@repo/env";
import { CookieModule } from "@repo/lib/cookie-module";
import { ServerEvents } from "./events/index.js";
import { app } from "./routes/server.js";

// Fail at boot, not on the first login: the cookie config is only read when a cookie is written.
CookieModule.validateConfig();

app.listen(ENV.PORT, () => {
	ServerEvents.emitServerReady(`Server listening on port ${ENV.PORT}`);
});
