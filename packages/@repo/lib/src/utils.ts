import { ENV } from "@repo/env";
import crypto from "crypto";
import path from "path";

export function __dirname() {
	if (ENV.NODE_ENV === "development") {
		return path.resolve(process.cwd(), "../../");
	}
	return process.cwd();
}

/**
 * @description Utility class for generating random strings and numbers
 */
export class Random {
	/**
	 * @description Generate a random UUID
	 */
	static generateUUID() {
		return crypto.randomUUID();
	}

	/**
	 * @description Generate a random string
	 * @param length
	 * @param encoding (default: 'hex')
	 */
	static generateString(length: number, encoding: BufferEncoding = "hex") {
		return crypto.randomBytes(length).toString(encoding);
	}

	/**
	 * @description Generate a random number
	 * @param digits (default: 6)
	 */
	static generateNumber(digits: number = 6) {
		return crypto.randomInt(10 ** (digits - 1), 10 ** digits);
	}

	/**
	 * @description Generate a zero-padded numeric code drawn uniformly from the whole keyspace.
	 * Unlike `generateNumber`, a code CAN start with 0 — `generateCode(6)` has 1_000_000 outcomes,
	 * `generateNumber(6)` only 900_000. Use this for OTPs and anything else brute-forceable.
	 * @param digits (default: 6)
	 */
	static generateCode(digits: number = 6) {
		return String(crypto.randomInt(0, 10 ** digits)).padStart(digits, "0");
	}

	static generateBoolean() {
		return crypto.randomInt(0, 2) === 1;
	}
}
