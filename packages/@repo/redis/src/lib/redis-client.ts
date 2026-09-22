import { defineEnv } from "@repo/env";
import { logger } from "@repo/logger";
import { Cluster, Redis } from "ioredis";
import z from "zod";

const connection = defineEnv({
	REDIS_HOST: z.string().min(1),
	REDIS_PORT: z.coerce.number(),
	// Unauthenticated Redis is the norm in local dev, so these must tolerate being unset.
	REDIS_USERNAME: z.string().default(""),
	REDIS_PASSWORD: z.string().default(""),
	REDIS_DB: z.coerce.number().optional(),
	// NOT z.coerce.boolean(): that is Boolean(value), so the string "false" would coerce to true.
	REDIS_CLUSTER_MODE: z
		.enum(["true", "false", "1", "0"])
		.default("false")
		.transform(v => v === "true" || v === "1"),
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
				}
			);

			clusterClient.on("connect", () => {
				logger.info("[Redis Cluster] connected");
			});

			clusterClient.on("error", err => {
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

		client.on("error", err => {
			logger.error(`[Redis] error (db ${db}):`, err);
		});

		clients.set(db, client);
	}

	return client;
}
