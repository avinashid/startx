import { z } from "zod";

import { ENV } from "./default-env.js";

type EnvSecretOptions = {
	/** Minimum length. Ignored when `length` is set. */
	min?: number;
	/** Exact length, e.g. 64 for a 32-byte hex key. */
	length?: number;
	/** Require hex characters only. */
	hex?: boolean;
	/** Accept placeholder values. Defaults to true only in development and test. */
	allowPlaceholder?: boolean;
};

// A copied .env.example (CHANGE_ME_…) or a key of one repeated character (all zeros) is not a
// secret. Both pass a length check, so without this a production deployment can boot with them.
export const isPlaceholderSecret = (value: string) => /change_?me/i.test(value) || /^(.)\1*$/.test(value);

export const envSecret = ({ min = 32, length, hex = false, allowPlaceholder }: EnvSecretOptions = {}) => {
	const allow = allowPlaceholder ?? (ENV.NODE_ENV === "development" || ENV.NODE_ENV === "test");
	let schema = length === undefined ? z.string().min(min) : z.string().length(length);
	if (hex) schema = schema.regex(/^[0-9a-f]+$/i, "must be a hex string");
	return schema.refine((value) => allow || !isPlaceholderSecret(value), {
		message: "is a placeholder (CHANGE_ME or one repeated character). Generate one with: openssl rand -hex 32",
	});
};
