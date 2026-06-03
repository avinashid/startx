import { getRedis } from "@repo/redis";
import { BullMQProvider } from "./adapter/bullmq-adapter.js";
import { JobSchemas } from "./registry.js";

const redisConnection = getRedis({ db: 10 });
export const queueList = Object.keys(JobSchemas) as Array<keyof typeof JobSchemas>;

export const BullQueue = new BullMQProvider(redisConnection);
