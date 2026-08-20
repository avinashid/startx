import { Time } from "@repo/common/time";
import { defineEnv } from "@repo/env";
import { z } from "zod";
import { ITokenModule } from "./i-token.js";

const env = defineEnv({
	ACCESS_TOKEN_SECRET: z.string().min(32),
	REFRESH_TOKEN_SECRET: z.string().min(32),
	ACCESS_TOKEN_EXPIRY: z.coerce.number().default(Time.hours(1).seconds),
	REFRESH_TOKEN_EXPIRY: z.coerce.number().default(Time.days(30).seconds),
});

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
