import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { defineEnv } from "./define-env.js";
import { envBool } from "./env-bool.js";

const KEY = "SX_DEFINE_ENV_TEST";

afterEach(() => {
	delete process.env[KEY];
});

describe("defineEnv", () => {
	it("falls back to the envBool default when the variable is unset", () => {
		expect(defineEnv({ [KEY]: envBool(true) })[KEY]).toBe(true);
	});

	it("rejects a blank envBool value instead of reading it as false (B63)", () => {
		process.env[KEY] = "";
		expect(() => defineEnv({ [KEY]: envBool() })).toThrow(/Invalid environment variables/);
	});

	it("still parses explicit envBool values", () => {
		process.env[KEY] = "0";
		expect(defineEnv({ [KEY]: envBool(true) })[KEY]).toBe(false);
	});

	it("treats a blank string variable as unset", () => {
		process.env[KEY] = "";
		expect(defineEnv({ [KEY]: z.string().default("fallback") })[KEY]).toBe("fallback");
	});
});
