import { logger } from "@repo/lib/logger-module";

import { ServerEvents } from "./events/index.js";
import { app } from "./routes/server.js";

app.listen(process.env.PORT ?? 3000, () => {
	logger.info(`Server started on port ${process.env.PORT ?? 3000}`);
	ServerEvents.emitServerReady();
});
