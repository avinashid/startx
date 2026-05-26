import { Time } from "@repo/common/time";
import type { SessionUser } from "@repo/common/types/users";
import { defineEnv } from "@repo/env";
import crypto from "node:crypto";
import { z } from "zod";
import { TokenModule } from "../extra/token-module.js";

const env = defineEnv({
	SESSION_DURATION: z.number().default(Time.days(30).milliseconds),
});

export const constants = {
	sessionDuration: env.SESSION_DURATION,
};

export type TokenPair = {
	accessToken: string;
	refreshToken: string;
};

export type SessionType =
	| {
			type: "single";
	  }
	| {
			type: "multi";
			maxConcurrentSessions: number;
	  };

export type SessionRecord = {
	sessionId: string;
	user: Omit<SessionUser, "accessToken">;
	refreshTokenHash: string;
	createdAt: number;
	lastSeenAt: number;
};

export abstract class IUserSession {
	protected abstract type: SessionType;

	protected sessionKey(sessionId: string) {
		return `session:${sessionId}`;
	}

	protected userSessionsKey(userId: string) {
		return `user:sessions:${userId}`;
	}

	protected hashToken(token: string) {
		return crypto.createHash("sha256").update(token).digest("hex");
	}

	protected abstract setSession(sessionId: string, data: SessionRecord, ttl: number): Promise<void>;

	protected abstract getSession(sessionId: string): Promise<SessionRecord | null>;

	protected abstract deleteSession(sessionId: string): Promise<void>;

	protected abstract addUserSession(userId: string, sessionId: string): Promise<void>;

	protected abstract removeUserSession(userId: string, sessionId: string): Promise<void>;

	protected abstract getUserSessions(userId: string): Promise<string[]>;

	protected abstract clearUserSessions(userId: string): Promise<void>;

	protected generateSessionId() {
		return crypto.randomUUID();
	}

	protected generateRefreshJti() {
		return crypto.randomUUID();
	}

	public async startSession(user: Omit<SessionUser, "accessToken">): Promise<TokenPair> {
		if (this.type.type === "single") {
			await this.endAllSessions(user.id);
		}

		if (this.type.type === "multi") {
			const existing = await this.getUserSessions(user.id);

			if (existing.length >= this.type.maxConcurrentSessions) {
				const oldest = existing[0];
				await this.endSession(oldest);
			}
		}

		const sessionId = this.generateSessionId();
		const refreshJti = this.generateRefreshJti();

		const accessToken = TokenModule.signAccessToken({
			userID: user.id,
			email: user.email,
			sessionID: sessionId,
		});

		const refreshToken = TokenModule.signRefreshToken({
			userID: user.id,
			email: user.email,
			sessionID: sessionId,
			jti: refreshJti,
		});

		const record: SessionRecord = {
			sessionId,
			user,
			refreshTokenHash: this.hashToken(refreshToken),
			createdAt: Date.now(),
			lastSeenAt: Date.now(),
		};

		await Promise.all([
			this.setSession(sessionId, record, constants.sessionDuration),
			this.addUserSession(user.id, sessionId),
		]);

		return {
			accessToken,
			refreshToken,
		};
	}

	public async validateSession(sessionId: string): Promise<SessionRecord | null> {
		return await this.getSession(sessionId);
	}

	public async rotateRefreshToken(sessionId: string, refreshToken: string): Promise<TokenPair | null> {
		const session = await this.getSession(sessionId);
		if (!session) return null;

		const incomingHash = this.hashToken(refreshToken);

		if (incomingHash !== session.refreshTokenHash) {
			await this.endSession(sessionId);
			return null;
		}

		const newRefreshJti = this.generateRefreshJti();

		const accessToken = TokenModule.signAccessToken({
			userID: session.user.id,
			email: session.user.email,
			sessionID: sessionId,
		});

		const newRefreshToken = TokenModule.signRefreshToken({
			userID: session.user.id,
			email: session.user.email,
			sessionID: sessionId,
			jti: newRefreshJti,
		});

		session.refreshTokenHash = this.hashToken(newRefreshToken);
		session.lastSeenAt = Date.now();

		await this.setSession(sessionId, session, constants.sessionDuration);

		return {
			accessToken,
			refreshToken: newRefreshToken,
		};
	}

	public async endSession(sessionId: string): Promise<void> {
		const session = await this.getSession(sessionId);
		if (!session) return;

		await Promise.all([this.deleteSession(sessionId), this.removeUserSession(session.user.id, sessionId)]);
	}

	public async endAllSessions(userId: string): Promise<void> {
		const sessions = await this.getUserSessions(userId);

		await Promise.all(sessions.map((sid) => this.deleteSession(sid)));

		await this.clearUserSessions(userId);
	}
}
