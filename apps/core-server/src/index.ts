import { ENV } from "@repo/lib/env-module";
import { logger } from "@repo/lib/logger-module";
import { ServerEvents } from "./events/index.js";
import { app } from "./routes/server.js";

app.listen(ENV.PORT, () => {
	logger.info(`Server started on port ${ENV.PORT}`);
	ServerEvents.emitServerReady();
});
