import { logger } from "@repo/lib";
import morgan from "morgan";
morgan.token("user", (req) => {
	if (req.user) {
		return `(USER: ${req.user.email} ID: ${req.user.id})`; // Convert to string if it's an object
	}
	return "(guest)"; // Return 'null' if `req.user` is not defined
});

const morganFormat = ":method~:url~:status~:response-time~:user";
const loggerMiddleware = morgan(morganFormat, {
	stream: {
		write: (message) => {
			const [method, url, status, responseTime, user] = message.split("~");
			const log = `${method} ${url} ${status} ${responseTime}ms ${user}`;
			logger.info(log, { logType: "routeInfo" });
		},
	},
});

export { loggerMiddleware };
