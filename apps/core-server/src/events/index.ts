import { IEvent } from "@repo/lib/events";
import { logger } from "@repo/logger";
type ServerEventMap = {
	server: string;
	db: string;
	redis: string;
};

const serverBus = new IEvent<ServerEventMap>();

export class ServerEvents {
	static onServerReady(fn: () => void) {
		serverBus.on("server", fn);
	}

	static emitServerReady(message?: string) {
		serverBus.emit("server", message ?? "Server ready");
	}

	static onDBReady(fn: () => void) {
		serverBus.on("db", fn);
	}

	static emitDBReady(message?: string) {
		serverBus.emit("db", message ?? "Database ready");
	}

	static onRedisReady(fn: () => void) {
		serverBus.on("redis", fn);
	}

	static emitRedisReady(message?: string) {
		serverBus.emit("redis", message ?? "Redis ready");
	}
}

serverBus.onEvery(e => logger.info(`${e.event}: ${e.payload}`));
