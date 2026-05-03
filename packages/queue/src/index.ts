import { getRedis } from "@repo/redis";
import { BullMQProvider } from "./adapter/bullmq-adapter.js";

const redisConnection = getRedis({ db: 10 });
export const BullQueue = new BullMQProvider(redisConnection);
