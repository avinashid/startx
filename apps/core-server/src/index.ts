import { ENV } from "@repo/env";
import { ServerEvents } from "./events/index.js";
import { app } from "./routes/server.js";

app.listen(ENV.PORT, () => {
	ServerEvents.emitServerReady(`Server listening on port ${ENV.PORT}`);
});
