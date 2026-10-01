import { ENV } from "@repo/env";
import path from "path";
import util from "util";
import { createLogger, format, transports, addColors, type Logform } from "winston";
const customColors = {
	error: "red",
	warn: "yellow",
	info: "green",
	http: "magenta",
	debug: "blue",
};
const upperCaseLevel = format((info) => {
	info.level = info.level.toUpperCase();
	return info;
});

addColors(customColors);

const LOG_DIR = path.join(process.cwd(), "logs");

const customPrintFormat = format.printf((info: Logform.TransformableInfo) => {
	const { level, message, timestamp, stack, ...rest } = info;
	// Object.entries, not the rest object itself: winston keeps its internals (level, splat, message)
	// under Symbol keys, and util.inspect would print them as "Symbol(level)" in every entry (B75).
	const metadata = Object.fromEntries(Object.entries(rest));

	const levelStr = String(level);
	let messageStr = String(stack || message);

	if (Object.keys(metadata).length > 0) {
		const metaString = util.inspect(metadata, { depth: null, colors: false });
		messageStr += `\nExtra Details:\n${metaString}`;
	}

	const dateStr = timestamp
		? new Date(String(timestamp as Date)).toLocaleString("tr-TR", {
				year: "numeric",
				month: "2-digit",
				day: "2-digit",
				hour: "2-digit",
				minute: "2-digit",
			})
		: new Date().toISOString();

	return `${dateStr} :${levelStr}: ${messageStr}`;
});

interface LoggerInput {
	logName: string;
	enableFileLogging?: boolean;
}

/**
 * Colour only for a terminal: piped into a file, `docker logs` or a log shipper, ANSI codes are
 * noise that breaks grep and every log viewer that does not render them (B75).
 */
export const consoleFormat = (colors = Boolean(process.stdout.isTTY)) =>
	colors
		? format.combine(upperCaseLevel(), format.colorize({ all: true }), customPrintFormat)
		: format.combine(upperCaseLevel(), customPrintFormat);

const createWLogger = ({ logName, enableFileLogging = true }: LoggerInput) => {
	const baseTransports = [new transports.Console({ format: consoleFormat() })];
	const fileTransports = enableFileLogging
		? [
				new transports.File({
					level: "error",
					filename: path.join(LOG_DIR, logName, `${logName}-Error.log`),
					format: customPrintFormat,
				}),
				new transports.File({
					filename: path.join(LOG_DIR, logName, `${logName}-Combined.log`),
					format: customPrintFormat,
				}),
			]
		: [];
	return createLogger({
		level: ENV.LOG_LEVEL,
		format: format.combine(format.timestamp(), format.errors({ stack: true })),
		transports: [...baseTransports, ...fileTransports],
	});
};

export const logger = createWLogger({
	logName: "globalLog",
	enableFileLogging: false,
});
