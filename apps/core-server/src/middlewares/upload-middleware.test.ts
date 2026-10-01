import type { NextFunction, Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/config/server-config.js", () => ({
	ServerConfig: { MAX_UPLOAD_SIZE_MB: 1, MAX_MULTIPART_SIZE_MB: 2, MAX_UPLOAD_FILES: 1, MAX_UPLOAD_FIELDS: 1 },
	UPLOAD_TEMP_ROOT: "/tmp/startx-upload-test",
}));

// Stand-in for express-fileupload: each test decides what state the response is in when busboy's
// callback finally fires, and with what error.
const fileUploadBehaviour: { sent: boolean; error?: Error } = { sent: false };
const fileUploadCalls = vi.fn();
vi.mock("express-fileupload", () => ({
	default: () => (_req: Request, res: Response, done: (error?: unknown) => void) => {
		fileUploadCalls();
		(res as { headersSent: boolean }).headersSent = fileUploadBehaviour.sent;
		done(fileUploadBehaviour.error);
	},
}));

// Each test decides whether the request carries a valid session.
const authResult: { ok: boolean } = { ok: true };
vi.mock("@/middlewares/auth-middleware.js", () => ({
	authenticateRequest: () =>
		Promise.resolve(
			authResult.ok
				? { ok: true, user: { id: "u1" }, session: {} }
				: { ok: false, status: 401, message: "Access token missing" },
		),
}));

const { uploadMiddleware } = await import("./upload-middleware.js");

const run = async () => {
	const req = {
		headers: { "content-type": "multipart/form-data; boundary=x" },
		prependListener: vi.fn(),
		removeListener: vi.fn(),
	} as unknown as Request;
	const res = {
		headersSent: false,
		once: vi.fn(),
		status: vi.fn().mockReturnThis(),
		set: vi.fn().mockReturnThis(),
		json: vi.fn().mockReturnThis(),
	} as unknown as Response & Record<"status" | "json", ReturnType<typeof vi.fn>>;
	const next = vi.fn() as unknown as NextFunction & ReturnType<typeof vi.fn>;
	uploadMiddleware(req, res, next);
	// The session lookup is async; let it settle before asserting.
	await new Promise((resolve) => setImmediate(resolve));
	return { req, res, next };
};

describe("uploadMiddleware (B66)", () => {
	it("does not forward an error once a limit has already answered the request", async () => {
		Object.assign(fileUploadBehaviour, { sent: true, error: new Error("Request aborted") });
		expect((await run()).next).not.toHaveBeenCalled();
	});

	it("still forwards an error when nothing has been sent", async () => {
		const error = new Error("Unexpected end of form");
		Object.assign(fileUploadBehaviour, { sent: false, error });
		expect((await run()).next).toHaveBeenCalledWith(error);
	});
});

describe("uploadMiddleware (B55)", () => {
	it("answers an anonymous multipart request 401 without parsing it", async () => {
		authResult.ok = false;
		fileUploadCalls.mockClear();
		const { res, next } = await run();
		expect(res.status).toHaveBeenCalledWith(401);
		expect(fileUploadCalls).not.toHaveBeenCalled();
		expect(next).not.toHaveBeenCalled();
		authResult.ok = true;
	});

	it("parses multipart for an authenticated request and sets req.user", async () => {
		Object.assign(fileUploadBehaviour, { sent: false, error: undefined });
		fileUploadCalls.mockClear();
		const { req, next } = await run();
		expect(fileUploadCalls).toHaveBeenCalledOnce();
		expect(req.user).toEqual({ id: "u1" });
		expect(next).toHaveBeenCalledWith();
	});
});
