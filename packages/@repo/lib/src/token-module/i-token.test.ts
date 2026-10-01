import jwt from "jsonwebtoken";
import { describe, expect, it } from "vitest";

import { ITokenModule } from "./i-token.js";

const key = "k".repeat(16) + "e".repeat(16);

describe("ITokenModule.verifyToken (B58)", () => {
	const tokens = new ITokenModule<{ sub: string }>({ signingKey: key, options: { algorithm: "HS256" } });

	it("verifies a token signed with the configured algorithm", () => {
		expect(tokens.verifyToken(tokens.generateToken({ sub: "u1" })).sub).toBe("u1");
	});

	it("rejects a token signed with a different HMAC algorithm under the same key", () => {
		const forged = jwt.sign({ sub: "u1" }, key, { algorithm: "HS512" });
		expect(() => tokens.verifyToken(forged)).toThrow(/invalid algorithm/);
	});
});
