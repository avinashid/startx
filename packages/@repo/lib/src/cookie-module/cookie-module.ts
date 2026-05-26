import { Time } from "@repo/common/time";
import { defineEnv, ENV } from "@repo/env";
import type { CookieOptions } from "express";
import z from "zod";

const credentials = defineEnv({
	COOKIE_DOMAIN: z.string().optional(),
});

type RuntimeEnv = "development" | "staging" | "production";

type CookieDescriptor = {
	name: string;
	options: CookieOptions;
};

const COOKIE_NAMES = {
	production: "refresh-token",
	nonProduction: "refresh-token-staging",
} as const;

const COOKIE_TTL = {
	development: Time.days(90).milliseconds, // 3 months
	staging: Time.days(90).milliseconds, // 3 months
	production: Time.days(30).milliseconds, // 30 days
} as const;

function getRuntimeEnv(): RuntimeEnv {
	switch (ENV.NODE_ENV) {
		case "production":
			return "production";
		case "staging":
			return "staging";
		default:
			return "development";
	}
}

function resolveCookieDomain(env: RuntimeEnv): string | undefined {
	if (env === "development") {
		return undefined;
	}

	if (!credentials.COOKIE_DOMAIN) {
		throw new Error("COOKIE_DOMAIN must be configured in staging/production environments");
	}

	return credentials.COOKIE_DOMAIN;
}

function resolveSameSite(env: RuntimeEnv): CookieOptions["sameSite"] {
	/**
	 * If frontend and API are on different origins:
	 * use "none" + secure=true
	 *
	 * Otherwise lax is safer.
	 */
	return env === "production" || env === "staging" ? "lax" : "lax";
}

function createRefreshTokenCookie(): CookieDescriptor {
	const env = getRuntimeEnv();
	const secure = env !== "development";

	return {
		name: env === "production" ? COOKIE_NAMES.production : COOKIE_NAMES.nonProduction,
		options: {
			httpOnly: true,
			secure,
			sameSite: resolveSameSite(env),
			maxAge: COOKIE_TTL[env],
			domain: resolveCookieDomain(env),
			path: "/",
		},
	};
}

const refreshTokenCookie = createRefreshTokenCookie();

export const CookieModule = Object.freeze({
	refreshTokenName(): string {
		return refreshTokenCookie.name;
	},

	setRefreshToken(token: string): [string, string, CookieOptions] {
		return [refreshTokenCookie.name, token, refreshTokenCookie.options];
	},

	clearRefreshToken(): [string, string, CookieOptions] {
		return [
			refreshTokenCookie.name,
			"",
			{
				...refreshTokenCookie.options,
				maxAge: 0,
				expires: new Date(0),
			},
		];
	},

	getRefreshTokenOptions(): CookieOptions {
		return refreshTokenCookie.options;
	},
});
