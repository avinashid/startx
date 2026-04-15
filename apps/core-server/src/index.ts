import { ENV } from "@repo/env";
import { logger } from "@repo/logger";
import { ServerEvents } from "./events/index.js";
import { app } from "./routes/server.js";

app.listen(ENV.PORT, () => {
	ServerEvents.emitServerReady();
	logger.info(`Server started on port ${ENV.PORT}`);
});
