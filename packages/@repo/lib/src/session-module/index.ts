import { RedisUserSession } from "./redis-session.js";

export const userSession = (type: "redis" | "pg") => {
	switch (type) {
		case "redis":
			return new RedisUserSession();
		default:
			throw new Error("Unknown session type");
	}
};
