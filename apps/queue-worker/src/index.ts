import { startBullBoard } from "./bullmq/board.js";
import { bullWorker } from "./bullmq/worker.js";

bullWorker();
startBullBoard();
