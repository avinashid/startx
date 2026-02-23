import {ping} from "@repo/constants"
import {AdminEmailTemplate} from "@repo/email"
import { logger } from "@repo/lib";
import * as sharp from "sharp"

import { ServerEvents } from "./events/index.js";
import { app } from "./routes/server.js";
// PushNotificationManager.initialize({
//   type: "env",
// });
console.log(sharp)


console.log(ping)
console.log(await AdminEmailTemplate.getOtpEmail({otp:"1234"}))
app.listen(process.env.PORT ?? 3000, () => {
	logger.info(`Server started on port ${process.env.PORT ?? 3000}`);
	ServerEvents.emitServerReady();
});
