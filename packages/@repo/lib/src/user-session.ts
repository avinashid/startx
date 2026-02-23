import { redisClient } from "@repo/redis";

import { constants } from "./constants.js";
import { TokenModule } from "./token-module.js";

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

function jsonParse<T>(value: string) {
	try {
		return JSON.parse(value) as T;
	} catch (error) {
		console.error(error)
		throw error;
	}
}

export class UserSession {
	static async getSessionUser(token: string) {
		const session = await redisClient.get(accessTokenKey(token));
		if (session) {
			try {
				const user = JSON.parse(session) as SessionUser;
				return user;
			} catch (error) {
				console.log(error);
			}
		}
		return session ? jsonParse<SessionUser>(session) : null;
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

		await redisClient.setex(
			accessTokenKey(accessToken),
			constants.sessionDuration,
			JSON.stringify({ ...payload, accessToken })
		);
		await redisClient.setex(refreshTokenKey(refreshToken), constants.sessionDuration, payload.id);
		await redisClient.setex(
			userTokensKey(payload.id),
			constants.sessionDuration,
			JSON.stringify({
				accessToken,
				refreshToken,
			})
		);
		return { accessToken, refreshToken };
	}

	static async checkRefreshToken(refreshToken: string) {
		const userId = await redisClient.get(refreshTokenKey(refreshToken));
		return userId;
	}

	static async updateAccessToken(payload: Omit<SessionUser, "accessToken">) {
		let accessToken: string;
		const tokens = await UserSession.getTokens(payload.id);
		if (tokens) {
			accessToken = tokens.accessToken;
		} else {
			return null;
		}

		await redisClient.setex(
			accessTokenKey(accessToken),
			constants.sessionDuration,
			JSON.stringify({ ...payload, accessToken })
		);
		return accessToken;
	}

	static async getTokens(userId: string) {
		const tokens = await redisClient.get(userTokensKey(userId));
		return tokens ? jsonParse<{ refreshToken: string; accessToken: string }>(tokens) : null;
	}

	static async logout(accessToken: string) {
		const payload = await redisClient.get(accessTokenKey(accessToken));
		if (!payload) return null;
		const user = jsonParse<SessionUser>(payload);
		const tokens = await UserSession.getTokens(user.id);
		if (tokens) {
			await redisClient.del(refreshTokenKey(tokens.refreshToken));
			await redisClient.del(accessTokenKey(accessToken));
			await redisClient.del(userTokensKey(user.id));
		}
		return;
	}

	static async endSession(userId: string) {
		const tokens = await UserSession.getTokens(userId);
		if (tokens) {
			await redisClient.del(refreshTokenKey(tokens.refreshToken));
			await redisClient.del(accessTokenKey(tokens.accessToken));
			await redisClient.del(userTokensKey(userId));
		}
	}
}
