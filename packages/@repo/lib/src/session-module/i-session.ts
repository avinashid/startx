import type { SessionUser } from "@repo/common/types/users";
import { defineEnv } from "@repo/env";
import { z } from "zod";
import { TokenModule } from "../extra/token-module.js";
const env = defineEnv({
	SESSION_DURATION: z.number().default(60 * 60 * 6),
});
export const constants = {
	sessionDuration: env.SESSION_DURATION,
};

export type TokenPair = {
	accessToken: string;
	refreshToken: string;
};

export abstract class IUserSession {
	protected accessTokenKey(key: string) {
		return `access_token:${key}`;
	}
	protected refreshTokenKey(key: string) {
		return `refresh_token:${key}`;
	}
	protected userTokensKey(userId: string) {
		return `session:${userId}`;
	}

	protected abstract setSessionData(key: string, data: SessionUser, ttl: number): Promise<void>;
	protected abstract getSessionData(key: string): Promise<SessionUser | null>;
	protected abstract deleteSessionData(key: string): Promise<void>;

	protected abstract setTokenData(key: string, data: TokenPair, ttl: number): Promise<void>;
	protected abstract getTokenData(key: string): Promise<TokenPair | null>;
	protected abstract deleteTokenData(key: string): Promise<void>;

	public async getSessionUser(token: string): Promise<SessionUser | null> {
		return await this.getSessionData(this.accessTokenKey(token));
	}

	public async startSession(payload: Omit<SessionUser, "accessToken">): Promise<TokenPair> {
		await this.endSession(payload.id);

		const accessToken = TokenModule.signAccessToken({
			userID: payload.id,
			email: payload.email,
		});

		const refreshToken = TokenModule.signRefreshToken({
			userID: payload.id,
			email: payload.email,
		});

		const sessionData: SessionUser = { ...payload, accessToken };
		const tokens: TokenPair = { accessToken, refreshToken };

		await Promise.all([
			this.setSessionData(this.accessTokenKey(accessToken), sessionData, constants.sessionDuration),
			this.setSessionData(payload.id, sessionData, constants.sessionDuration),
			this.setTokenData(this.refreshTokenKey(refreshToken), tokens, constants.sessionDuration),
			this.setTokenData(this.userTokensKey(payload.id), tokens, constants.sessionDuration),
		]);

		return tokens;
	}

	public async checkRefreshToken(refreshToken: string): Promise<TokenPair | null> {
		return await this.getTokenData(this.refreshTokenKey(refreshToken));
	}

	public async updateAccessToken(payload: Omit<SessionUser, "accessToken">): Promise<string | null> {
		const tokens = await this.getTokens(payload.id);
		if (!tokens) return null;

		const accessToken = tokens.accessToken;
		const sessionData: SessionUser = { ...payload, accessToken };

		await Promise.all([
			this.setSessionData(this.accessTokenKey(accessToken), sessionData, constants.sessionDuration),
			this.setSessionData(payload.id, sessionData, constants.sessionDuration),
		]);

		return accessToken;
	}

	public async getTokens(userId: string): Promise<TokenPair | null> {
		return await this.getTokenData(this.userTokensKey(userId));
	}

	public async logout(accessToken: string): Promise<null> {
		const session = await this.getSessionUser(accessToken);
		if (!session) return null;

		await this.endSession(session.id);
		return null;
	}

	public async endSession(userId: string): Promise<void> {
		const tokens = await this.getTokens(userId);
		if (!tokens) return;

		await Promise.all([
			this.deleteTokenData(this.refreshTokenKey(tokens.refreshToken)),
			this.deleteSessionData(this.accessTokenKey(tokens.accessToken)),
			this.deleteTokenData(this.userTokensKey(userId)),
			this.deleteSessionData(userId),
		]);
	}
}
