import { RedisStore } from "@repo/redis";

import { TokenModule } from "../extra/token-module.js";
export const constants = {
	sessionDuration: 60 * 60 * 6,
};

const accessTokenKey = (key: string) => `access_token:${key}`;
const refreshTokenKey = (key: string) => `refresh_token:${key}`;
const userTokensKey = (userId: string) => `session:${userId}`;
export type SessionUser = {
	id: string;
	email: string;
	fullName: string;
	countries: string[];
	department: string;
	currentScenario?: string;
	accessToken: string;
};

const userRedisStore = new RedisStore<SessionUser>({
	namespace: "user-session",
});

const userRedisTokenStore = new RedisStore<{ accessToken: string; refreshToken: string }>({
	namespace: "user-tokens",
});

export class UserSession {
	static async getSessionUser(token: string) {
		return await userRedisStore.get(accessTokenKey(token));
	}

	static async startSession(payload: Omit<SessionUser, "accessToken">) {
		await UserSession.endSession(payload.id);

		const accessToken = TokenModule.signAccessToken({
			userID: payload.id,
			email: payload.email,
		});

		const refreshToken = TokenModule.signRefreshToken({
			userID: payload.id,
			email: payload.email,
		});

		const sessionData: SessionUser = { ...payload, accessToken };

		// store access token -> user
		await userRedisStore.set(accessTokenKey(accessToken), sessionData, constants.sessionDuration);

		// store user -> session (optional but useful)
		await userRedisStore.set(payload.id, sessionData, constants.sessionDuration);

		// store refresh token -> userId
		await userRedisTokenStore.set(
			refreshTokenKey(refreshToken),
			{ accessToken, refreshToken },
			constants.sessionDuration
		);

		// store user -> tokens
		await userRedisTokenStore.set(
			userTokensKey(payload.id),
			{ accessToken, refreshToken },
			constants.sessionDuration
		);

		return { accessToken, refreshToken };
	}

	static async checkRefreshToken(refreshToken: string) {
		const tokens = await userRedisTokenStore.get(refreshTokenKey(refreshToken));
		return tokens ?? null;
	}

	static async updateAccessToken(payload: Omit<SessionUser, "accessToken">) {
		const tokens = await this.getTokens(payload.id);
		if (!tokens) return null;

		const accessToken = tokens.accessToken;

		await userRedisStore.set(
			accessTokenKey(accessToken),
			{ ...payload, accessToken },
			constants.sessionDuration
		);

		return accessToken;
	}

	static async getTokens(userId: string) {
		return await userRedisTokenStore.get(userTokensKey(userId));
	}

	static async logout(accessToken: string) {
		const session = await userRedisStore.get(accessTokenKey(accessToken));
		if (!session) return null;

		await this.endSession(session.id);
		return null;
	}

	static async endSession(userId: string) {
		const tokens = await this.getTokens(userId);
		if (!tokens) return;

		await userRedisTokenStore.del(refreshTokenKey(tokens.refreshToken));
		await userRedisStore.del(accessTokenKey(tokens.accessToken));
		await userRedisTokenStore.del(userTokensKey(userId));
		await userRedisStore.del(userId);
	}
}
