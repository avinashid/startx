import { Time } from "@repo/common/time";
import { defineEnv } from "@repo/env";
import { z } from "zod";
import { type SessionType } from "./i-session.js";
import { RedisUserSession } from "./redis-session.js";

const env = defineEnv({
	SESSION_DURATION: z.number().default(Time.days(30).milliseconds),
	MAX_CONCURRENT_SESSIONS: z.number().default(1),
	SESSION_TYPE: z.enum(["single", "multi"]).default("single"),
});

export const userSession = (type: "redis" | "pg", options: SessionType) => {
	switch (type) {
		case "redis":
			return new RedisUserSession(options);
		case "pg":
			throw new Error("PG session not implemented yet.");
		default:
			throw new Error("Unknown session type");
	}
};

export const defaultUserSession = userSession("redis", {
	sessionDuration: env.SESSION_DURATION,
	maxConcurrentSessions: env.MAX_CONCURRENT_SESSIONS,
	type: env.SESSION_TYPE,
});
