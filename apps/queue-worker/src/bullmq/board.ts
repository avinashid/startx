import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { defineEnv } from "@repo/env";
import { logger } from "@repo/logger";
import { BullQueue, queueList } from "@repo/queue";
import express from "express";
import { z } from "zod";

const serverAdapter = new ExpressAdapter();

serverAdapter.setBasePath("/");

createBullBoard({
	serverAdapter,
	queues: queueList.map(queue => new BullMQAdapter(BullQueue.getQueue(queue))),
});
const port = defineEnv({
	BULL_BOARD_PORT: z.coerce.number().default(2866),
});
export const startBullBoard = () => {
	const app = express();
	app.use("/", serverAdapter.getRouter() as express.Router);

	app.listen(port.BULL_BOARD_PORT, () => {
		logger.info(`Bull Board listening on port ${port.BULL_BOARD_PORT}`);
	});
};
