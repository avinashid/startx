import { ENV } from "@repo/env";
import { logger } from "@repo/lib/logger-module";

import { ServerEvents } from "./events/index.js";
import { app } from "./routes/server.js";

console.log(ENV);
app.listen(ENV.PORT, () => {
	logger.info(`Server started on port ${ENV.PORT}`);
	ServerEvents.emitServerReady();
});
