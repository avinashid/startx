import { Time } from "@repo/common/time";
import { defineEnv, ENV, envBool } from "@repo/env";
import type { CookieOptions } from "express";
import z from "zod";

/**
 * Both values stay optional at the schema level so that this module adds no import-time throw of
 * its own. It cannot promise more than that: `@repo/env` evaluates its own `ENV` schema at module
 * scope, so e.g. `NODE_ENV=bogus` still throws one level up, during this module's import.
 *
 * These two are validated when the cookie descriptor is first built — see
 * `CookieModule.validateConfig`.
 */
const credentials = defineEnv({
	COOKIE_DOMAIN: z.string().optional(),
	COOKIE_CROSS_SITE: z.string().optional(),
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
	development: Time.days(90).milliseconds,
	staging: Time.days(90).milliseconds,
	production: Time.days(30).milliseconds,
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
		throw new Error(
			`COOKIE_DOMAIN must be configured in staging/production environments (NODE_ENV=${ENV.NODE_ENV}). ` +
				`Set it to the domain the refresh-token cookie should be scoped to, e.g. ".example.com".`,
		);
	}

	return credentials.COOKIE_DOMAIN;
}

/**
 * Whether the browser sends requests to this API from a different site than the one it is
 * currently on. Only the deployer knows this, so it is configuration, not a guess from NODE_ENV.
 */
function resolveCrossSite(): boolean {
	const raw = credentials.COOKIE_CROSS_SITE;

	if (raw === undefined) {
		return false;
	}

	const result = envBool().safeParse(raw);

	if (!result.success) {
		throw new Error(`COOKIE_CROSS_SITE must be a boolean ("true", "false", "1", or "0"), received "${raw}"`);
	}

	return result.data;
}

/**
 * If frontend and API are on different sites the cookie must be `sameSite: "none"`, which every
 * current browser rejects unless `secure: true` is set alongside it. `createRefreshTokenCookie`
 * derives `secure` from this return value so the two can never drift apart.
 *
 * Otherwise lax is safer.
 */
function resolveSameSite(crossSite: boolean): CookieOptions["sameSite"] {
	return crossSite ? "none" : "lax";
}

function createRefreshTokenCookie(): CookieDescriptor {
	const env = getRuntimeEnv();
	const sameSite = resolveSameSite(resolveCrossSite());
	const secure = sameSite === "none" || env !== "development";

	// Frozen because a single descriptor is memoised and handed to every caller: an innocent
	// `options.maxAge = 0` for a "remember me off" path would otherwise re-TTL every refresh
	// cookie in the process, and clearing `secure` would leak `SameSite=None` without `Secure`.
	return Object.freeze({
		name: env === "production" ? COOKIE_NAMES.production : COOKIE_NAMES.nonProduction,
		options: Object.freeze({
			httpOnly: true,
			secure,
			sameSite,
			maxAge: COOKIE_TTL[env],
			domain: resolveCookieDomain(env),
			path: "/",
		}),
	});
}

let refreshTokenCookie: CookieDescriptor | undefined;

/**
 * Built on first use, not at module load: a missing COOKIE_DOMAIN must not turn every
 * `import "@repo/lib/cookie-module"` — including tooling and tests that never touch cookies —
 * into a module-evaluation crash. Call `CookieModule.validateConfig()` during boot to get the
 * same failure as an ordinary startup error instead.
 *
 * This defers building the descriptor, NOT reading the environment: `credentials` and `ENV` are
 * snapshotted at import, so populating `process.env` from a secrets manager after this module has
 * been imported will not be picked up.
 */
function getRefreshTokenCookie(): CookieDescriptor {
	refreshTokenCookie ??= createRefreshTokenCookie();
	return refreshTokenCookie;
}

export const CookieModule = Object.freeze({
	/** Throws if the cookie environment is misconfigured. Call this at server startup. */
	validateConfig(): void {
		getRefreshTokenCookie();
	},

	refreshTokenName(): string {
		return getRefreshTokenCookie().name;
	},

	setRefreshToken(token: string): [string, string, CookieOptions] {
		const cookie = getRefreshTokenCookie();
		return [cookie.name, token, cookie.options];
	},

	clearRefreshToken(): [string, string, CookieOptions] {
		const cookie = getRefreshTokenCookie();

		return [
			cookie.name,
			"",
			{
				...cookie.options,
				maxAge: 0,
				expires: new Date(0),
			},
		];
	},

	getRefreshTokenOptions(): CookieOptions {
		return getRefreshTokenCookie().options;
	},
});
