import type { CookieOptions } from "express";

const constants = {
	refreshToken: {
		cookie: "",
		cookieDomain: "",
		secureCookie: false,
		maxAge: 0,
	},
	initialize() {
		const prodMaxAge = 1000 * 60 * 60 * 24 * 30;
		const stagingMaxAge = 1000 * 60 * 60 * 24 * 365;
		const prodEnv = process.env.NODE_ENV === "production";
		const stagingEnv = process.env.NODE_ENV === "staging";

		if (prodEnv) {
			this.refreshToken.cookie = "refresh-token";
			this.refreshToken.cookieDomain = process.env.COOKIE_DOMAIN;
			this.refreshToken.secureCookie = true;
			this.refreshToken.maxAge = prodMaxAge;
		} else {
			this.refreshToken.cookie = "refresh-token-staging";
			this.refreshToken.cookieDomain = stagingEnv
				? process.env.COOKIE_DOMAIN
				: process.env.COOKIE_DOMAIN || "localhost";
			this.refreshToken.secureCookie = stagingEnv ? true : false;
			this.refreshToken.maxAge = stagingMaxAge;
		}
	},
};
constants.initialize();

export function getCookieOptions(refreshToken: string): [string, string, CookieOptions] {
	const cookieOptions: CookieOptions = {
		domain: constants.refreshToken.cookieDomain,
		maxAge: constants.refreshToken.maxAge,
		sameSite: "lax",
		httpOnly: true,
		secure: constants.refreshToken.secureCookie,
	};
	return [constants.refreshToken.cookie, refreshToken, cookieOptions];
}
