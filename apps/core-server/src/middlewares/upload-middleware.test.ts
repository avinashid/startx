import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/server-config.js", () => ({
	ServerConfig: { MAX_UPLOAD_SIZE_MB: 1, MAX_MULTIPART_SIZE_MB: 2, MAX_UPLOAD_FILES: 1, MAX_UPLOAD_FIELDS: 1 },
	UPLOAD_TEMP_ROOT: "/tmp/startx-upload-test",
}));

// Stand-in for express-fileupload: each test decides what state the response is in when busboy's
// callback finally fires, and with what error.
const fileUploadBehaviour: { sent: boolean; error?: Error } = { sent: false };
vi.mock("express-fileupload", () => ({
	default: () => (_req: Request, res: Response, done: (error?: unknown) => void) => {
		(res as { headersSent: boolean }).headersSent = fileUploadBehaviour.sent;
		done(fileUploadBehaviour.error);
	},
}));

const { uploadMiddleware } = await import("./upload-middleware.js");

const run = () => {
	const req = {
		headers: { "content-type": "multipart/form-data; boundary=x" },
		prependListener: vi.fn(),
		removeListener: vi.fn(),
	} as unknown as Request;
	const res = { headersSent: false, once: vi.fn() } as unknown as Response;
	const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
	uploadMiddleware(req, res, next);
	return next;
};

describe("uploadMiddleware (B66)", () => {
	it("does not forward an error once a limit has already answered the request", () => {
		Object.assign(fileUploadBehaviour, { sent: true, error: new Error("Request aborted") });
		expect(run()).not.toHaveBeenCalled();
	});

	it("still forwards an error when nothing has been sent", () => {
		const error = new Error("Unexpected end of form");
		Object.assign(fileUploadBehaviour, { sent: false, error });
		expect(run()).toHaveBeenCalledWith(error);
	});
});
