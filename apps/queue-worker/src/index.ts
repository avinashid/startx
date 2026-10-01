import { onShutdown } from "@repo/lib/shutdown-module";
import { BullQueue } from "@repo/queue";
import { closeRedis } from "@repo/redis";
import { startBullBoard } from "./bullmq/board.js";
import { bullWorker } from "./bullmq/worker.js";

bullWorker();
const board = startBullBoard();

// BullQueue.close() waits for active jobs to finish, so a deploy does not leave them stalled.
onShutdown([
	{ name: "bull board", run: () => new Promise<void>((resolve) => (board ? board.close(() => resolve()) : resolve())) },
	{ name: "queue", run: () => BullQueue.close() },
	{ name: "redis", run: closeRedis },
]);
