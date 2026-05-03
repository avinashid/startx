import { defineEnv } from "@repo/env";
import { logger } from "@repo/logger";
import { Redis } from "ioredis";
import z from "zod";
const connection = defineEnv({
	REDIS_HOST: z.string().min(1),
	REDIS_PORT: z.coerce.number(),
	REDIS_USERNAME: z.string(),
	REDIS_PASSWORD: z.string(),
	REDIS_DB: z.coerce.number().optional(),
});

let client: Redis | null = null;

export function getRedis(props?: { db?: number }) {
	if (!client) {
		client = new Redis({
			host: connection.REDIS_HOST,
			port: connection.REDIS_PORT,
			username: connection.REDIS_USERNAME,
			password: connection.REDIS_PASSWORD,
			lazyConnect: true,
			maxRetriesPerRequest: null,
			db: props?.db ?? connection.REDIS_DB ?? 0,
		});

		client.on("connect", () => {
			logger.info("[Redis] connected");
		});

		client.on("error", err => {
			logger.error("[Redis] error:", err);
		});
	}

	return client;
}
