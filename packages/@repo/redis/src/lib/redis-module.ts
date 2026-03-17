import { logger } from "@repo/logger";
import type { Redis } from "ioredis";

import { getRedis } from "./redis-client.js";

export const redis = {
	async get<T>(key: string): Promise<T | null> {
		const data = await getRedis().get(key);
		if (!data) return null;
		try {
			return JSON.parse(data) as T;
		} catch (error) {
			logger.error(error);
			return null;
		}
	},

	async set(key: string, value: unknown, ttl?: number) {
		const val = JSON.stringify(value);
		if (ttl) {
			return await getRedis().set(key, val, "EX", ttl);
		}
		return await getRedis().set(key, val);
	},
};

interface RedisStoreOptions {
	namespace?: string;
}

export class RedisStore<T> {
	private client: Redis;
	private namespace?: string;

	constructor(options?: RedisStoreOptions) {
		this.client = getRedis();
		this.namespace = options?.namespace;
	}

	private formatKey(key: string): string {
		return this.namespace ? `${this.namespace}:${key}` : key;
	}

	async get(key: string): Promise<T | null> {
		const data = await this.client.get(this.formatKey(key));
		if (!data) return null;
		try {
			return JSON.parse(data) as T;
		} catch {
			return data as T;
		}
	}

	async set(key: string, value: T, ttlSeconds?: number): Promise<void> {
		const stringValue = typeof value === "string" ? value : JSON.stringify(value);

		const finalKey = this.formatKey(key);

		if (ttlSeconds) {
			await this.client.set(finalKey, stringValue, "EX", ttlSeconds);
		} else {
			await this.client.set(finalKey, stringValue);
		}
	}

	async del(key: string): Promise<void> {
		await this.client.del(this.formatKey(key));
	}
}
