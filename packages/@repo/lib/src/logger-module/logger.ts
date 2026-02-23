import { createLogger, format, transports } from "winston";

import { type LogConfig, logConfig } from "./log-config.js";

const { combine, timestamp, printf, errors, colorize } = format;

// Custom format to include error stack traces
const customFormat = printf(({ level, message, timestamp, stack }: any) => {
	return `${timestamp} [${level}]: ${stack ?? message}`;
});

const logConfigFilter = format((info) => {
	if (!info.logType || logConfig[info.logType as keyof LogConfig]) {
		return info;
	}
	return false;
});

// Create level-specific filters
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const levelFilter = (level: string) =>
	format((info) => {
		if (info.level === level) {
			return info;
		}
		return false;
	})();

// Configure the logger
export const logger = createLogger({
	format: combine(
		timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
		errors({ stack: true }), // Capture stack traces
		customFormat,
	),
	transports: [
		// Console transport - shows all levels
		new transports.Console({
			format: combine(logConfigFilter(), colorize(), customFormat),
		}),

		// Standard log file for all levels
		// new DailyRotateFile({
		//   filename: path.join(__dirname(), "logs", "combined-%DATE%.log"),
		//   datePattern: "DD-MM-YYYY",
		//   maxFiles: "30d",
		//   format: combine(logConfigFilter(), customFormat),
		//   json: true,
		// }),

		// // File transport for 'info' logs only
		// new DailyRotateFile({
		//   filename: path.join(__dirname(), "logs", "info-%DATE%.log"),
		//   datePattern: "DD-MM-YYYY",
		//   maxFiles: "30d",
		//   format: combine(logConfigFilter(), levelFilter("info"), customFormat),
		//   json: true,
		// }),

		// // File transport for 'error' logs only
		// new DailyRotateFile({
		//   filename: path.join(__dirname(), "logs", "error-%DATE%.log"),
		//   datePattern: "DD-MM-YYYY",
		//   maxFiles: "30d",
		//   format: combine(logConfigFilter(), levelFilter("error"), customFormat),
		//   json: true,
		// }),

		// // File transport for 'warn' logs only
		// new DailyRotateFile({
		//   filename: path.join(__dirname(), "logs", "warn-%DATE%.log"),
		//   datePattern: "DD-MM-YYYY",
		//   maxFiles: "30d",
		//   format: combine(logConfigFilter(), levelFilter("warn"), customFormat),
		//   json: true,
		// }),
	],
});
