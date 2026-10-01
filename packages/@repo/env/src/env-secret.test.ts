import { describe, expect, it } from "vitest";

import { envSecret, isPlaceholderSecret } from "./env-secret.js";

const real = "3f9c1a7e5b2d4c6a8e0f1b3d5a7c9e1f3b5d7a9c1e3f5b7d9a1c3e5f7b9d1a3c";

describe("envSecret (B53)", () => {
	it.each([
		"CHANGE_ME_0000000000000000000000000000000000000000000000000000000a",
		"0000000000000000000000000000000000000000000000000000000000000000",
		"changeme-changeme-changeme-changeme",
	])("flags %s as a placeholder", (value) => {
		expect(isPlaceholderSecret(value)).toBe(true);
	});

	it("rejects placeholders when they are not allowed", () => {
		const schema = envSecret({ allowPlaceholder: false });
		expect(schema.safeParse("CHANGE_ME_0000000000000000000000000000000000000000000000000000000a").success).toBe(false);
		expect(envSecret({ length: 64, hex: true, allowPlaceholder: false }).safeParse("0".repeat(64)).success).toBe(false);
		expect(schema.safeParse(real).success).toBe(true);
	});

	it("accepts placeholders in development and test", () => {
		expect(envSecret({ allowPlaceholder: true }).safeParse("CHANGE_ME_0000000000000000000000000000000a").success).toBe(
			true,
		);
	});

	it("still enforces length and hex", () => {
		expect(envSecret({ allowPlaceholder: false }).safeParse("short").success).toBe(false);
		expect(envSecret({ length: 64, hex: true }).safeParse("z".repeat(63) + "y").success).toBe(false);
		expect(envSecret({ length: 64, hex: true }).safeParse(real).success).toBe(true);
	});
});
