import type { Request, RequestHandler, Response } from "express";
import fileUpload from "express-fileupload";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { ServerConfig, UPLOAD_TEMP_ROOT } from "@/config/server-config.js";

import { authenticateRequest } from "@/middlewares/auth-middleware.js";

const MAX_FILE_BYTES = ServerConfig.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
const MAX_REQUEST_BYTES = ServerConfig.MAX_MULTIPART_SIZE_MB * 1024 * 1024;

/** Busboy defaults these to 1MB / Infinity, which is where the unbounded memory came from. */
const MAX_FIELD_BYTES = 100 * 1024;
const MAX_FIELD_NAME_BYTES = 100;
const MAX_HEADER_PAIRS = 20;

const isMultipart = (req: Request) =>
	(req.headers["content-type"] ?? "").toLowerCase().startsWith("multipart/form-data");

/**
 * `express-fileupload` answers its own 413 through `res.writeHead`, with no `Content-Type`. With
 * `nosniff` set globally that leaves `fetch().json()` with a parse error instead of the envelope,
 * so every rejection is written from here instead.
 */
const rejectTooLarge = (res: Response, message: string) => {
	if (res.headersSent) return;
	res.status(413).set("Connection", "close").json({ success: false, message });
};

const countEntries = (bag: unknown) =>
	Object.values((bag ?? {}) as Record<string, unknown>).reduce<number>(
		(total, value) => total + (Array.isArray(value) ? value.length : 1),
		0,
	);

const parseMultipart: RequestHandler = (req, res, next) => {
	// Per request, so cleanup cannot depend on express-fileupload having registered the file:
	// an aborted, errored or simply unhandled upload leaves nothing behind either way.
	const tempFileDir = path.join(UPLOAD_TEMP_ROOT, randomUUID());
	res.once("close", () => {
		fs.rm(tempFileDir, { recursive: true, force: true }).catch(() => undefined);
	});

	// A chunked request declares no length, so the bytes are counted as they arrive too.
	let received = 0;
	const countBytes = (chunk: Buffer) => {
		received += chunk.length;

		if (received <= MAX_REQUEST_BYTES) return;

		req.removeListener("data", countBytes);
		req.unpipe();
		rejectTooLarge(res, `Request too large. The limit is ${ServerConfig.MAX_MULTIPART_SIZE_MB}MB.`);
		res.once("finish", () => req.destroy());
	};

	req.prependListener("data", countBytes);

	const handler = fileUpload({
		limits: {
			fileSize: MAX_FILE_BYTES,
			fieldSize: MAX_FIELD_BYTES,
			fieldNameSize: MAX_FIELD_NAME_BYTES,
			headerPairs: MAX_HEADER_PAIRS,
			// One over the allowed count, so an overflow is detectable below instead of being
			// silently dropped: busboy answers its own limits by discarding the extra parts.
			files: ServerConfig.MAX_UPLOAD_FILES + 1,
			fields: ServerConfig.MAX_UPLOAD_FIELDS + 1,
			parts: ServerConfig.MAX_UPLOAD_FILES + ServerConfig.MAX_UPLOAD_FIELDS + 2,
		},
		abortOnLimit: true,
		limitHandler: (_req, limitRes) =>
			rejectTooLarge(limitRes, `File too large. The limit is ${ServerConfig.MAX_UPLOAD_SIZE_MB}MB.`),
		useTempFiles: true,
		tempFileDir,
		safeFileNames: true,
		// `true` means three characters, which turns photo.jpeg into photoj.peg.
		preserveExtension: 5,
		uriDecodeFileNames: true,
	});

	handler(req, res, (error?: unknown) => {
		req.removeListener("data", countBytes);

		// A limit already answered the request; anything further — including handing an error on
		// to errorMiddleware — would write to a sent response.
		if (res.headersSent) return;

		if (error) {
			next(error);
			return;
		}

		if (countEntries(req.files) > ServerConfig.MAX_UPLOAD_FILES) {
			rejectTooLarge(res, `Too many files. The limit is ${ServerConfig.MAX_UPLOAD_FILES} per request.`);
			return;
		}

		if (countEntries(req.body) > ServerConfig.MAX_UPLOAD_FIELDS) {
			rejectTooLarge(res, `Too many form fields. The limit is ${ServerConfig.MAX_UPLOAD_FIELDS} per request.`);
			return;
		}

		next();
	});
};

/**
 * Multipart is the one body type no other limit covers: `json()` and `urlencoded()` ignore it, and
 * busboy's own defaults are unbounded for everything except file size. This wrapper adds what is
 * missing — a cap on the whole request, on every field, and on the number of parts — and gives each
 * request a private temp directory that is deleted when the response ends, however it ends.
 *
 * Multipart is only parsed for a request carrying a valid session: an anonymous multipart body is
 * answered 401 before a byte of it is read, so the global mount does not hand every path, 404s
 * included, to busboy. Non-multipart requests fall straight through and cost no session lookup.
 * Mount it per-route (`app.use("/upload", uploadMiddleware, uploadRouter)`) to narrow it further.
 */
export const uploadMiddleware: RequestHandler = (req, res, next) => {
	if (!isMultipart(req)) {
		next();
		return;
	}

	const declared = Number(req.headers["content-length"]);

	if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
		rejectTooLarge(res, `Request too large. The limit is ${ServerConfig.MAX_MULTIPART_SIZE_MB}MB.`);
		res.once("finish", () => req.destroy());
		return;
	}

	authenticateRequest(req).then((auth) => {
		if (!auth.ok) {
			// The body is never read, so the connection cannot be reused for the next request.
			res.status(auth.status).set("Connection", "close").json({ success: false, message: auth.message });
			res.once("finish", () => req.destroy());
			return;
		}

		req.user = auth.user;
		parseMultipart(req, res, next);
	}, next);
};
