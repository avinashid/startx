import { defineEnv, ENV, envBool } from "@repo/env";
import { logger } from "@repo/logger";
import { Cluster, Redis } from "ioredis";
import z from "zod";

import { assertRedisAuth } from "./redis-auth.js";

const connection = defineEnv({
	REDIS_HOST: z.string().min(1),
	REDIS_PORT: z.coerce.number(),
	// Unauthenticated Redis is the norm in local dev, so these must tolerate being unset.
	// assertRedisAuth below refuses a blank password anywhere else.
	REDIS_USERNAME: z.string().default(""),
	REDIS_PASSWORD: z.string().default(""),
	REDIS_ALLOW_NO_AUTH: envBool(),
	REDIS_DB: z.coerce.number().optional(),
	REDIS_CLUSTER_MODE: envBool(),
});

assertRedisAuth({
	password: connection.REDIS_PASSWORD,
	allowNoAuth: connection.REDIS_ALLOW_NO_AUTH,
	nodeEnv: ENV.NODE_ENV,
});

const clients = new Map<number, Redis>();
let clusterClient: Cluster | null = null;

export function getRedis(props?: { db?: number }): Redis | Cluster {
	if (connection.REDIS_CLUSTER_MODE) {
		if (!clusterClient) {
			clusterClient = new Cluster(
				[
					{
						host: connection.REDIS_HOST,
						port: connection.REDIS_PORT,
					},
				],
				{
					redisOptions: {
						username: connection.REDIS_USERNAME,
						password: connection.REDIS_PASSWORD,
						lazyConnect: true,
						maxRetriesPerRequest: null,
					},
				},
			);

			clusterClient.on("connect", () => {
				logger.info("[Redis Cluster] connected");
			});

			clusterClient.on("error", (err) => {
				logger.error("[Redis Cluster] error:", err);
			});
		}

		return clusterClient;
	}

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

		client.on("error", (err) => {
			logger.error(`[Redis] error (db ${db}):`, err);
		});

		clients.set(db, client);
	}

	return client;
}

/**
 * Close every client getRedis has handed out, for graceful shutdown. Only a `ready` client gets
 * QUIT. Any other is just disconnected: on a lazy client QUIT would first open the connection it
 * never needed, and on a reconnecting one it waits for a server that may not come back, past the
 * shutdown deadline.
 */
export async function closeRedis(): Promise<void> {
	const all: Array<Redis | Cluster> = [...clients.values(), ...(clusterClient ? [clusterClient] : [])];
	await Promise.all(
		all.map(async (client) => {
			if (client.status === "ready") await client.quit();
			else client.disconnect();
		}),
	);
	clients.clear();
	clusterClient = null;
}
