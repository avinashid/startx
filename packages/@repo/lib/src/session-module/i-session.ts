import type { SessionUser } from "@repo/common/types/users";
import crypto from "node:crypto";
import { AccessToken, RefreshToken } from "../token-module/index.js";

export type TokenPair = {
	accessToken: string;
	refreshToken: string;
};

export type SessionType =
	| {
			type: "single";
			sessionDuration: number;
	  }
	| {
			type: "multi";
			sessionDuration: number;
			maxConcurrentSessions: number;
	  };

export type SessionRecord = {
	sessionId: string;
	user: Omit<SessionUser, "accessToken">;
	refreshTokenHash: string;
	createdAt: number;
	lastSeenAt: number;
};

type PartialSessionRecord = Partial<SessionRecord>;

export abstract class IUserSession {
	protected readonly type: SessionType;

	constructor(type: SessionType) {
		this.type = type;
	}

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

	protected abstract updateSession(sessionId: string, data: PartialSessionRecord): Promise<void>;

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

	public async updateSessionData(userId: string, data: PartialSessionRecord): Promise<void> {
		const sessions = await this.getUserSessions(userId);

		await Promise.all(sessions.map(sessionId => this.updateSession(sessionId, data)));
	}

	public async startSession(user: Omit<SessionUser, "accessToken">): Promise<TokenPair> {
		if (this.type.type === "single") {
			await this.endAllSessions(user.id);
		}

		if (this.type.type === "multi") {
			const existing = await this.getUserSessions(user.id);

			if (existing.length >= this.type.maxConcurrentSessions) {
				const oldest = existing[0];

				if (oldest) {
					await this.endSession(oldest);
				}
			}
		}

		const sessionId = this.generateSessionId();
		const refreshJti = this.generateRefreshJti();

		const accessToken = AccessToken.generateToken({
			userID: user.id,
			email: user.email,
			sessionID: sessionId,
		});

		const refreshToken = RefreshToken.generateToken({
			userID: user.id,
			email: user.email,
			sessionID: sessionId,
			jti: refreshJti,
		});

		const now = Date.now();

		const record: SessionRecord = {
			sessionId,
			user,
			refreshTokenHash: this.hashToken(refreshToken),
			createdAt: now,
			lastSeenAt: now,
		};

		await Promise.all([
			this.setSession(sessionId, record, this.type.sessionDuration),
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

	public async verifyRefreshToken(token?: string): Promise<SessionRecord | null> {
		if (!token) return null;

		const payload = RefreshToken.verifyToken(token);

		if (!payload) return null;

		return await this.getSession(payload.sessionID);
	}

	public async createAccessToken(sessionId: string): Promise<string | null> {
		const session = await this.getSession(sessionId);

		if (!session) return null;

		return AccessToken.generateToken({
			userID: session.user.id,
			email: session.user.email,
			sessionID: sessionId,
		});
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

		const accessToken = AccessToken.generateToken({
			userID: session.user.id,
			email: session.user.email,
			sessionID: sessionId,
		});

		const newRefreshToken = RefreshToken.generateToken({
			userID: session.user.id,
			email: session.user.email,
			sessionID: sessionId,
			jti: newRefreshJti,
		});

		session.refreshTokenHash = this.hashToken(newRefreshToken);
		session.lastSeenAt = Date.now();

		await this.setSession(sessionId, session, this.type.sessionDuration);

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

		await Promise.all(sessions.map(sessionId => this.deleteSession(sessionId)));

		await this.clearUserSessions(userId);
	}
}
