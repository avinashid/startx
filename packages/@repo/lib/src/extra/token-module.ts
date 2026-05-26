import { Time } from "@repo/common/time";
import { defineEnv } from "@repo/env";
import { logger } from "@repo/logger";
import jwt from "jsonwebtoken";
import z from "zod";

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

const env = defineEnv({
	ACCESS_TOKEN_SECRET: z.string().min(32),
	REFRESH_TOKEN_SECRET: z.string().min(32),
	ACCESS_TOKEN_EXPIRY: z.coerce.number().default(Time.hours(1).milliseconds),
	REFRESH_TOKEN_EXPIRY: z.coerce.number().default(Time.days(30).milliseconds),
});

const JWT_CONFIG = {
	algorithm: "HS256" as const,
};

export class TokenModule {
	static signAccessToken(payload: AccessTokenPayload): string {
		return jwt.sign(payload, env.ACCESS_TOKEN_SECRET, {
			...JWT_CONFIG,
			expiresIn: env.ACCESS_TOKEN_EXPIRY,
		});
	}

	static verifyAccessToken(token: string): AccessTokenPayload | null {
		try {
			return jwt.verify(token, env.ACCESS_TOKEN_SECRET, {
				algorithms: ["HS256"],
			}) as AccessTokenPayload;
		} catch (error) {
			logger.warn("Access token verification failed", {
				error: error instanceof Error ? error.message : "unknown",
			});
			return null;
		}
	}

	static signRefreshToken(payload: RefreshTokenPayload): string {
		return jwt.sign(payload, env.REFRESH_TOKEN_SECRET, {
			...JWT_CONFIG,
			expiresIn: env.REFRESH_TOKEN_EXPIRY,
		});
	}

	static verifyRefreshToken(token: string): RefreshTokenPayload | null {
		try {
			return jwt.verify(token, env.REFRESH_TOKEN_SECRET, {
				algorithms: ["HS256"],
			}) as RefreshTokenPayload;
		} catch (error) {
			logger.warn("Refresh token verification failed", {
				error: error instanceof Error ? error.message : "unknown",
			});
			return null;
		}
	}
}
