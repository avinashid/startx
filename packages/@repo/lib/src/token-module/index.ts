import { Time } from "@repo/common/time";
import { defineEnv, ENV, envSecret } from "@repo/env";
import { z } from "zod";
import { ITokenModule } from "./i-token.js";

const env = defineEnv({
	ACCESS_TOKEN_SECRET: envSecret({ min: 32 }),
	REFRESH_TOKEN_SECRET: envSecret({ min: 32 }),
	ACCESS_TOKEN_EXPIRY: z.coerce.number().default(Time.hours(1).seconds),
	REFRESH_TOKEN_EXPIRY: z.coerce.number().default(Time.days(30).seconds),
});

// One shared secret means a refresh token verifies as an access token and vice versa.
if (env.ACCESS_TOKEN_SECRET === env.REFRESH_TOKEN_SECRET && ENV.NODE_ENV !== "development" && ENV.NODE_ENV !== "test") {
	throw new Error("Invalid environment variables:\n  ❌ ACCESS_TOKEN_SECRET and REFRESH_TOKEN_SECRET must differ");
}

export type AccessTokenPayload = {
	userID: string;
	email: string;
	sessionID: string;
};

export type RefreshTokenPayload = {
	userID: string;
	email: string;
	sessionID: string;
	jti: string;
};

const JWT_CONFIG = {
	algorithm: "HS256" as const,
};

export const AccessToken = new ITokenModule<AccessTokenPayload>({
	signingKey: env.ACCESS_TOKEN_SECRET,
	options: {
		...JWT_CONFIG,
		expiresIn: env.ACCESS_TOKEN_EXPIRY,
	},
});

export const RefreshToken = new ITokenModule<RefreshTokenPayload>({
	signingKey: env.REFRESH_TOKEN_SECRET,
	options: {
		...JWT_CONFIG,
		expiresIn: env.REFRESH_TOKEN_EXPIRY,
	},
});
