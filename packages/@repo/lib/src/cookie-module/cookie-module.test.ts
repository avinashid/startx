import { Time } from "@repo/common/time";
import type { CookieOptions } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import z from "zod";

/**
 * `@repo/env` calls `loadDotenv()` at import, which reads `.env` from BOTH `process.cwd()` and the
 * resolved project root, and only prefers `.env.test` when `NODE_ENV === "test"`. Every case below
 * stubs `NODE_ENV` to production/staging first, so the real module takes the production branch and
 * back-fills the very keys the test just deleted: a developer who copied `.env.example` would get a
 * red suite on a package they never touched. Mocking keeps these tests off the filesystem entirely.
 * The mock mirrors the two behaviours this module depends on: `""` counts as absent, and
 * `ENV.NODE_ENV` defaults to `production`.
 */
vi.mock("@repo/env", () => {
	const read = (key: string) => {
		const raw = process.env[key];
		return raw === undefined || raw === "" ? undefined : raw;
	};

	return {
		get ENV() {
			return { NODE_ENV: read("NODE_ENV") ?? "production" };
		},
		defineEnv: (spec: Record<string, unknown>) => Object.fromEntries(Object.keys(spec).map((key) => [key, read(key)])),
		envBool: (def = false) =>
			z
				.enum(["true", "false", "1", "0", ""])
				.default(def ? "true" : "false")
				.transform((v) => v === "true" || v === "1"),
	};
});

type EnvOverrides = {
	NODE_ENV?: string;
	COOKIE_DOMAIN?: string;
	COOKIE_CROSS_SITE?: string;
};

async function loadCookieModule(overrides: EnvOverrides = {}) {
	vi.resetModules();
	vi.unstubAllEnvs();

	for (const key of ["NODE_ENV", "COOKIE_DOMAIN", "COOKIE_CROSS_SITE"] as const) {
		vi.stubEnv(key, overrides[key]);
	}

	const module = await import("./cookie-module.js");
	return module.CookieModule;
}

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
});

describe("CookieModule — import safety (B26)", () => {
	it("does not throw at import time when COOKIE_DOMAIN is missing in production", async () => {
		await expect(loadCookieModule({ NODE_ENV: "production" })).resolves.toBeDefined();
	});

	it("does not throw at import time when COOKIE_CROSS_SITE is nonsense", async () => {
		await expect(
			loadCookieModule({ NODE_ENV: "production", COOKIE_DOMAIN: ".x.com", COOKIE_CROSS_SITE: "yep" }),
		).resolves.toBeDefined();
	});

	it.each(["staging", "production"])("surfaces the missing COOKIE_DOMAIN as a startup error in %s", async (nodeEnv) => {
		const cookies = await loadCookieModule({ NODE_ENV: nodeEnv });

		expect(() => cookies.validateConfig()).toThrowError(/COOKIE_DOMAIN must be configured/);
		expect(() => cookies.validateConfig()).toThrowError(new RegExp(`NODE_ENV=${nodeEnv}`));
	});

	it("surfaces an unparseable COOKIE_CROSS_SITE as a startup error", async () => {
		const cookies = await loadCookieModule({
			NODE_ENV: "production",
			COOKIE_DOMAIN: ".example.com",
			COOKIE_CROSS_SITE: "yep",
		});

		expect(() => cookies.validateConfig()).toThrowError(/COOKIE_CROSS_SITE must be a boolean/);
	});

	it("also throws at the point of use, not silently", async () => {
		const cookies = await loadCookieModule({ NODE_ENV: "production" });

		expect(() => cookies.setRefreshToken("t")).toThrowError(/COOKIE_DOMAIN must be configured/);
		expect(() => cookies.refreshTokenName()).toThrowError(/COOKIE_DOMAIN must be configured/);
		expect(() => cookies.clearRefreshToken()).toThrowError(/COOKIE_DOMAIN must be configured/);
		expect(() => cookies.getRefreshTokenOptions()).toThrowError(/COOKIE_DOMAIN must be configured/);
	});

	it("passes validateConfig once the domain is supplied", async () => {
		const cookies = await loadCookieModule({
			NODE_ENV: "production",
			COOKIE_DOMAIN: ".example.com",
		});

		expect(() => cookies.validateConfig()).not.toThrow();
	});

	it("needs no COOKIE_DOMAIN in development", async () => {
		const cookies = await loadCookieModule({ NODE_ENV: "development" });

		expect(() => cookies.validateConfig()).not.toThrow();
		expect(cookies.getRefreshTokenOptions().domain).toBeUndefined();
	});
});

type Matrix = {
	name: string;
	env: EnvOverrides;
	expectedName: string;
	expected: CookieOptions;
};

const matrix: Matrix[] = [
	{
		name: "development, same-site",
		env: { NODE_ENV: "development" },
		expectedName: "refresh-token-staging",
		expected: {
			httpOnly: true,
			secure: false,
			sameSite: "lax",
			maxAge: Time.days(90).milliseconds,
			domain: undefined,
			path: "/",
		},
	},
	{
		name: "development, cross-site",
		env: { NODE_ENV: "development", COOKIE_CROSS_SITE: "true" },
		expectedName: "refresh-token-staging",
		expected: {
			httpOnly: true,
			secure: true,
			sameSite: "none",
			maxAge: Time.days(90).milliseconds,
			domain: undefined,
			path: "/",
		},
	},
	{
		name: "staging, same-site",
		env: { NODE_ENV: "staging", COOKIE_DOMAIN: ".staging.example.com" },
		expectedName: "refresh-token-staging",
		expected: {
			httpOnly: true,
			secure: true,
			sameSite: "lax",
			maxAge: Time.days(90).milliseconds,
			domain: ".staging.example.com",
			path: "/",
		},
	},
	{
		name: "staging, cross-site",
		env: {
			NODE_ENV: "staging",
			COOKIE_DOMAIN: ".staging.example.com",
			COOKIE_CROSS_SITE: "true",
		},
		expectedName: "refresh-token-staging",
		expected: {
			httpOnly: true,
			secure: true,
			sameSite: "none",
			maxAge: Time.days(90).milliseconds,
			domain: ".staging.example.com",
			path: "/",
		},
	},
	{
		name: "production, same-site",
		env: { NODE_ENV: "production", COOKIE_DOMAIN: ".example.com" },
		expectedName: "refresh-token",
		expected: {
			httpOnly: true,
			secure: true,
			sameSite: "lax",
			maxAge: Time.days(30).milliseconds,
			domain: ".example.com",
			path: "/",
		},
	},
	{
		name: "production, cross-site",
		env: { NODE_ENV: "production", COOKIE_DOMAIN: ".example.com", COOKIE_CROSS_SITE: "true" },
		expectedName: "refresh-token",
		expected: {
			httpOnly: true,
			secure: true,
			sameSite: "none",
			maxAge: Time.days(30).milliseconds,
			domain: ".example.com",
			path: "/",
		},
	},
];

describe("CookieModule — sameSite / secure matrix (B25)", () => {
	it.each(matrix)("$name", async ({ env, expectedName, expected }) => {
		const cookies = await loadCookieModule(env);

		expect(cookies.refreshTokenName()).toBe(expectedName);
		expect(cookies.getRefreshTokenOptions()).toEqual(expected);
		expect(cookies.setRefreshToken("token-value")).toEqual([expectedName, "token-value", expected]);
	});

	it.each(matrix)('$name — sameSite:"none" implies secure:true', async ({ env }) => {
		const cookies = await loadCookieModule(env);
		const options = cookies.getRefreshTokenOptions();

		if (options.sameSite === "none") {
			expect(options.secure).toBe(true);
		}

		expect(options.httpOnly).toBe(true);
	});

	it.each(matrix)("$name — clearing keeps the same flags", async ({ env, expectedName }) => {
		const cookies = await loadCookieModule(env);
		const [name, value, options] = cookies.clearRefreshToken();
		const live = cookies.getRefreshTokenOptions();

		expect(name).toBe(expectedName);
		expect(value).toBe("");
		expect(options.maxAge).toBe(0);
		expect(options.expires).toEqual(new Date(0));
		expect(options.sameSite).toBe(live.sameSite);
		expect(options.secure).toBe(live.secure);
		expect(options.domain).toBe(live.domain);
	});

	it.each(matrix)("$name — the memoised options cannot be mutated by a caller", async ({ env }) => {
		const cookies = await loadCookieModule(env);
		const options = cookies.getRefreshTokenOptions();

		expect(Object.isFrozen(options)).toBe(true);
		expect(() => {
			(options as { secure?: boolean }).secure = false;
		}).toThrow(TypeError);
		expect(() => {
			(options as { maxAge?: number }).maxAge = 0;
		}).toThrow(TypeError);

		// All three accessors share one object identity, so a successful mutation would leak.
		expect(cookies.getRefreshTokenOptions().secure).toBe(options.secure);
		expect(cookies.setRefreshToken("t")[2].maxAge).toBe(options.maxAge);
		expect(cookies.setRefreshToken("t")[2]).toBe(options);
	});

	it("still lets clearRefreshToken override maxAge on its own copy", async () => {
		const cookies = await loadCookieModule({ NODE_ENV: "production", COOKIE_DOMAIN: ".example.com" });
		const [, , cleared] = cookies.clearRefreshToken();

		expect(cleared.maxAge).toBe(0);
		expect(cookies.getRefreshTokenOptions().maxAge).toBe(Time.days(30).milliseconds);
	});

	it.each([
		["true", "none"],
		["1", "none"],
		["false", "lax"],
		["0", "lax"],
	])("COOKIE_CROSS_SITE=%s resolves to sameSite=%s", async (raw, expected) => {
		const cookies = await loadCookieModule({
			NODE_ENV: "production",
			COOKIE_DOMAIN: ".example.com",
			COOKIE_CROSS_SITE: raw,
		});

		expect(cookies.getRefreshTokenOptions().sameSite).toBe(expected);
	});

	// Strict, case-sensitive dialect shared with @repo/redis's REDIS_CLUSTER_MODE (B41): only
	// "true"/"false"/"1"/"0" are accepted, so these previously-lenient spellings now reject.
	it.each(["TRUE", "  True  ", "yes", "on", "off", "no"])("COOKIE_CROSS_SITE=%s is rejected", async (raw) => {
		const cookies = await loadCookieModule({
			NODE_ENV: "production",
			COOKIE_DOMAIN: ".example.com",
			COOKIE_CROSS_SITE: raw,
		});

		expect(() => cookies.getRefreshTokenOptions()).toThrowError(/COOKIE_CROSS_SITE must be a boolean/);
	});
});
