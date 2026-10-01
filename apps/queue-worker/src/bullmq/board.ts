import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { defineEnv, ENV, envBool } from "@repo/env";
import { logger } from "@repo/logger";
import { BullQueue, queueList } from "@repo/queue";
import express from "express";
import { z } from "zod";

// Bull Board has no authentication: anyone who reaches it can read job payloads and retry,
// promote or delete jobs. It is therefore off unless asked for (on by default only in
// development) and bound to loopback. To expose it, set BULL_BOARD_HOST and put it behind an
// authenticating proxy.
const env = defineEnv({
	BULL_BOARD_ENABLED: envBool(ENV.NODE_ENV === "development"),
	BULL_BOARD_HOST: z.string().default("127.0.0.1"),
	BULL_BOARD_PORT: z.coerce.number().default(2866),
});

export const startBullBoard = () => {
	if (!env.BULL_BOARD_ENABLED) {
		logger.info("Bull Board disabled (set BULL_BOARD_ENABLED=true to enable)");
		return;
	}

	const serverAdapter = new ExpressAdapter();
	serverAdapter.setBasePath("/");
	createBullBoard({
		serverAdapter,
		queues: queueList.map((queue) => new BullMQAdapter(BullQueue.getQueue(queue))),
	});

	const app = express();
	app.use("/", serverAdapter.getRouter() as express.Router);

	return app.listen(env.BULL_BOARD_PORT, env.BULL_BOARD_HOST, () => {
		logger.info(`Bull Board listening on http://${env.BULL_BOARD_HOST}:${env.BULL_BOARD_PORT}`);
	});
};
