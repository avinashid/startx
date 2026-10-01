import { logger } from "@repo/logger";
import type { IncomingMessage, Server, ServerResponse } from "node:http";

export type ShutdownStep = { name: string; run: () => unknown };

type ShutdownOptions = {
	/** Hard deadline for all steps together; past it the process exits 1 regardless. */
	timeoutMs?: number;
	exit?: (code: number) => void;
};

/**
 * Builds the handler `onShutdown` installs. Steps run in order, because order matters: stop
 * accepting work (HTTP server, queue workers) before closing what that work uses (Redis, DB).
 * A failing step is logged and the rest still run. A second call while one is in progress exits 1
 * at once, so a second Ctrl+C always gets you out.
 */
export const createShutdown = (
	steps: ShutdownStep[],
	{ timeoutMs = 8_000, exit = (code: number) => process.exit(code) }: ShutdownOptions,
) => {
	let inProgress = false;

	return async (reason: string) => {
		if (inProgress) {
			logger.warn(`${reason} received during shutdown; exiting now`);
			exit(1);
			return;
		}
		inProgress = true;
		logger.info(`${reason} received; shutting down`);

		const timer = setTimeout(() => {
			logger.error(`Shutdown did not finish within ${timeoutMs}ms; exiting`);
			exit(1);
		}, timeoutMs);
		timer.unref();

		let failed = false;
		for (const step of steps) {
			try {
				await step.run();
			} catch (error) {
				failed = true;
				logger.error(`Shutdown step "${step.name}" failed`, { error });
			}
		}

		clearTimeout(timer);
		logger.info("Shutdown complete");
		exit(failed ? 1 : 0);
	};
};

/**
 * Drain on SIGTERM (container stop, rolling deploy) and SIGINT (Ctrl+C) instead of dying mid-request
 * or mid-job. The 8s default stays under the shortest common grace period (Docker: 10s, Kubernetes: 30s).
 */
export const onShutdown = (steps: ShutdownStep[], options: ShutdownOptions = {}) => {
	const shutdown = createShutdown(steps, options);
	for (const signal of ["SIGTERM", "SIGINT"] as const) {
		process.on(signal, () => {
			void shutdown(signal);
		});
	}
};

type CloseHttpServerOptions = {
	/** How long in-flight requests get before their connections are cut. 0 cuts them at once. */
	graceMs?: number;
	pollMs?: number;
};

/**
 * Call right after `listen()`; `close()` is then the shutdown step. `server.close()` alone stops
 * accepting connections but closes idle keep-alive sockets only once, when it is called: a socket
 * whose request was in flight then sits idle for `keepAliveTimeout` after its response, so the
 * drain can outlast the shutdown deadline. Here every response not yet started when the drain
 * begins, or arriving during it, carries `Connection: close`, so its socket closes as soon as it is
 * answered. Idle sockets are swept every `pollMs`, and whatever is left is cut after `graceMs`.
 */
export const trackHttpServer = (server: Server) => {
	const pending = new Set<ServerResponse>();
	let draining = false;

	server.prependListener("request", (_req: IncomingMessage, res: ServerResponse) => {
		if (draining) {
			res.setHeader("Connection", "close");
			return;
		}
		pending.add(res);
		res.once("close", () => pending.delete(res));
	});

	const close = ({ graceMs = 6_000, pollMs = 100 }: CloseHttpServerOptions = {}) =>
		new Promise<void>((resolve, reject) => {
			draining = true;
			for (const res of pending) if (!res.headersSent) res.setHeader("Connection", "close");
			const poll = setInterval(() => server.closeIdleConnections(), pollMs);
			const force = setTimeout(() => {
				logger.warn(`HTTP connections still open after ${graceMs}ms; closing them`);
				server.closeAllConnections();
			}, graceMs);
			server.close((error) => {
				clearInterval(poll);
				clearTimeout(force);
				if (error) reject(error);
				else resolve();
			});
		});

	return { close };
};
