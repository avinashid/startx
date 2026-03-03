import { createLogger, format, transports } from "winston";
import type { LogConfig } from "./log-config.js";
import { logConfig } from "./log-config.js";

const { combine, timestamp, printf, errors, colorize, json } = format;

const isProd = process.env.NODE_ENV === "production";

const logConfigFilter = format(info => {
	if (!info.logType) return info;
	if (logConfig[info.logType as keyof LogConfig]) return info;
	return false;
});

const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
	const base = stack ?? message;

	const metaString = Object.keys(meta).length > 0 ? `\nmeta: ${JSON.stringify(meta, null, 2)}` : "";

	return `${timestamp} [${level}]: ${base}${metaString}`;
});

export const logger = createLogger({
	level: "info",
	format: combine(
		timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
		errors({ stack: true }),
		logConfigFilter(),
		isProd ? json() : consoleFormat
	),
	transports: [
		new transports.Console({
			format: isProd
				? combine(timestamp(), errors({ stack: true }), logConfigFilter(), json())
				: combine(
						timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
						errors({ stack: true }),
						logConfigFilter(),
						colorize({ all: true }),
						consoleFormat
					),
		}),
	],
});
