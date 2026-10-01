import { onShutdown } from "@repo/lib/shutdown-module";
import { BullQueue } from "@repo/queue";
import { closeRedis } from "@repo/redis";
import { startBullBoard } from "./bullmq/board.js";
import { bullWorker } from "./bullmq/worker.js";

bullWorker();
const board = startBullBoard();

// BullQueue.close() waits for active jobs to finish, so a deploy does not leave them stalled. The
// board is an admin UI with nothing to drain: its connections are cut at once so the queue's drain
// starts without waiting on the UI's polling keep-alive sockets.
onShutdown([
	{ name: "bull board", run: () => board?.close({ graceMs: 0 }) },
	{ name: "queue", run: () => BullQueue.close() },
	{ name: "redis", run: closeRedis },
]);
