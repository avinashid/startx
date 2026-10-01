import { describe, expect, it } from "vitest";

import { assertRedisAuth } from "./redis-auth.js";

describe("assertRedisAuth (B59)", () => {
	it("rejects a blank password in production", () => {
		expect(() => assertRedisAuth({ password: "", allowNoAuth: false, nodeEnv: "production" })).toThrow(
			/REDIS_ALLOW_NO_AUTH/,
		);
	});

	it("rejects a blank password in staging", () => {
		expect(() => assertRedisAuth({ password: "", allowNoAuth: false, nodeEnv: "staging" })).toThrow();
	});

	it("accepts a blank password with the explicit opt-out", () => {
		expect(() => assertRedisAuth({ password: "", allowNoAuth: true, nodeEnv: "production" })).not.toThrow();
	});

	it("accepts a blank password in development and test", () => {
		expect(() => assertRedisAuth({ password: "", allowNoAuth: false, nodeEnv: "development" })).not.toThrow();
		expect(() => assertRedisAuth({ password: "", allowNoAuth: false, nodeEnv: "test" })).not.toThrow();
	});

	it("accepts a set password anywhere", () => {
		expect(() => assertRedisAuth({ password: "s3cret", allowNoAuth: false, nodeEnv: "production" })).not.toThrow();
	});
});
