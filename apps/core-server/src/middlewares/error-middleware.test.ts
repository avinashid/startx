import type { NextFunction, Request, Response } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";

const env = { NODE_ENV: "production" };
vi.mock("@repo/env", () => ({ ENV: env }));
vi.mock("@repo/logger", () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));

const { ErrorResponse } = await import("@repo/lib/error-handlers-module");
const { errorMiddleware } = await import("./error-middleware.js");

const run = (error: unknown) => {
	const res = { status: vi.fn().mockReturnThis(), json: vi.fn() };
	errorMiddleware(error as Error, {} as Request, res as unknown as Response, vi.fn() as NextFunction);
	return { status: res.status.mock.calls[0]?.[0] as number, body: res.json.mock.calls[0]?.[0] as { message: string } };
};

afterEach(() => {
	env.NODE_ENV = "production";
});

describe("errorMiddleware (B56)", () => {
	it("hides the message of an unexpected 5xx outside development", () => {
		expect(run(new Error('relation "users" does not exist'))).toEqual({
			status: 500,
			body: { success: false, message: "Internal Server Error" },
		});
	});

	it("keeps the message of a deliberate ErrorResponse 5xx", () => {
		expect(run(new ErrorResponse("Storage unavailable", 503)).body.message).toBe("Storage unavailable");
	});

	it("keeps 4xx messages", () => {
		expect(run(Object.assign(new Error("Unexpected token"), { statusCode: 400 }))).toMatchObject({
			status: 400,
			body: { message: "Unexpected token" },
		});
	});

	it("shows the real message in development", () => {
		env.NODE_ENV = "development";
		expect(run(new Error("boom")).body.message).toBe("boom");
	});

	it("keeps the four-parameter signature Express needs", () => {
		expect(errorMiddleware.length).toBe(4);
	});
});
