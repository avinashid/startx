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

const clients = new Map<number, Redis>();

export function getRedis(props?: { db?: number }) {
	const db = props?.db ?? connection.REDIS_DB ?? 0;

	let client = clients.get(db);

	if (!client) {
		client = new Redis({
			host: connection.REDIS_HOST,
			port: connection.REDIS_PORT,
			username: connection.REDIS_USERNAME,
			password: connection.REDIS_PASSWORD,
			lazyConnect: true,
			maxRetriesPerRequest: null,
			db,
		});

		client.on("connect", () => {
			logger.info(`[Redis] connected (db ${db})`);
		});

		client.on("error", err => {
			logger.error(`[Redis] error (db ${db}):`, err);
		});

		clients.set(db, client);
	}

	return client;
}
