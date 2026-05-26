import type { SessionType } from "./i-session.js";
import { RedisUserSession } from "./redis-session.js";

export const userSession = (type: "redis" | "pg", options: SessionType) => {
	switch (type) {
		case "redis":
			return new RedisUserSession(options);
		default:
			throw new Error("Unknown session type");
	}
};

export const defaultUserSession = userSession("redis", {
	type: "multi",
	maxConcurrentSessions: 2,
});
