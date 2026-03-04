import { ENV } from "@repo/env";
import fs from "fs";
import path from "path";
import { createLogger, format, type Logger, transports } from "winston";
import DailyRotateFile from "winston-daily-rotate-file";
import type TransportStream from "winston-transport";

export type LogLevel = "error" | "warn" | "info" | "http" | "debug";

export interface LogMetadata extends Record<string, unknown> {
	userId?: string;
	requestId?: string;
	error?: Error;
}

export interface HttpLogMetadata extends LogMetadata {
	method: string;
	route: string;
	status: number;
	durationMs: number;
}

export interface LoggerConfig {
	serviceName: string;
	level?: LogLevel;
	logDir?: string;
}

const isProd = ENV.NODE_ENV === "production";
const defaultLevel: LogLevel = (ENV.LOG_LEVEL as LogLevel) || (isProd ? "info" : "debug");

const SENSITIVE_KEYS = new Set([
	"password",
	"token",
	"authorization",
	"cookie",
	"creditcard",
	"secret",
]);

const redactSensitiveData = (obj: unknown): unknown => {
	if (obj === null || typeof obj !== "object") return obj;
	if (Array.isArray(obj)) return obj.map(redactSensitiveData);
	const sanitized: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
		if (SENSITIVE_KEYS.has(key.toLowerCase())) {
			sanitized[key] = "[REDACTED]";
		} else {
			sanitized[key] = redactSensitiveData(value);
		}
	}
	return sanitized;
};

const redactFormat = format(info => {
	const { level, message, timestamp, stack, service, ...meta } = info;
	const sanitizedMeta = redactSensitiveData(meta) as Record<string, unknown>;
	Object.assign(info, { level, message, timestamp, stack, service, ...sanitizedMeta });
	return info;
});

const { combine, timestamp, printf, errors, json, colorize, splat } = format;

const devConsoleFormat = printf(({ level, message, timestamp, stack, service, ...meta }) => {
	const logMessage = stack || message;
	const metaString = Object.keys(meta).length > 0 ? `\n  ${JSON.stringify(meta, null, 2)}` : "";
	return `${timestamp as string} [${service as string}] ${level}: ${logMessage as string}${metaString}`;
});

const coreFormat = combine(errors({ stack: true }), splat(), timestamp(), redactFormat());

export const createServiceLogger = ({
	serviceName,
	level = defaultLevel,
	logDir = "logs",
}: LoggerConfig): Logger => {
	const logDirPath = path.resolve(process.cwd(), logDir);
	try {
		fs.mkdirSync(logDirPath, { recursive: true });
	} catch {
		// ignore
	}

	const loggerTransports: TransportStream[] = [
		new transports.Console({
			format: isProd ? json() : combine(colorize({ all: true }), devConsoleFormat),
		}) as unknown as TransportStream,
	];

	loggerTransports.push(
		new (DailyRotateFile as any)({
			level: "error",
			filename: path.join(logDirPath, "%DATE%-error.log"),
			datePattern: "YYYY-MM-DD",
			maxSize: "20m",
			maxFiles: "14d",
			format: json(),
		}) as TransportStream,
		new (DailyRotateFile as any)({
			filename: path.join(logDirPath, "%DATE%-combined.log"),
			datePattern: "YYYY-MM-DD",
			maxSize: "20m",
			maxFiles: "14d",
			format: json(),
		}) as TransportStream
	);

	return createLogger({
		level,
		defaultMeta: { service: serviceName },
		format: coreFormat,
		transports: loggerTransports,
		exceptionHandlers: [
			new transports.Console({
				format: combine(colorize(), devConsoleFormat),
			}) as unknown as TransportStream,
			new (DailyRotateFile as any)({
				filename: path.join(logDirPath, "%DATE%-exceptions.log"),
				datePattern: "YYYY-MM-DD",
				maxSize: "20m",
				maxFiles: "14d",
				format: json(),
			}) as TransportStream,
		],
		rejectionHandlers: [
			new transports.Console({
				format: combine(colorize(), devConsoleFormat),
			}) as unknown as TransportStream,
			new (DailyRotateFile as any)({
				filename: path.join(logDirPath, "%DATE%-rejections.log"),
				datePattern: "YYYY-MM-DD",
				maxSize: "20m",
				maxFiles: "14d",
				format: json(),
			}) as TransportStream,
		],
	});
};

export const logger = createServiceLogger({ serviceName: "app-core" });
