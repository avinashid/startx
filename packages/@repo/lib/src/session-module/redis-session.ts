import { RedisStore } from "@repo/redis";
import { IUserSession, type SessionRecord, type SessionType } from "./i-session.js";

type SessionIndex = string[];

export class RedisUserSession extends IUserSession {
	private sessionStore: RedisStore<SessionRecord>;
	private sessionIndexStore: RedisStore<SessionIndex>;

	constructor(type: SessionType) {
		super(type);
		this.sessionStore = new RedisStore<SessionRecord>({
			namespace: "auth-session",
		});

		this.sessionIndexStore = new RedisStore<SessionIndex>({
			namespace: "auth-session-index",
		});
	}

	protected async setSession(sessionId: string, data: SessionRecord, ttl: number): Promise<void> {
		await this.sessionStore.set(sessionId, data, ttl);
	}

	protected async updateSession(sessionId: string, data: Partial<SessionRecord>): Promise<void> {
		const session = await this.sessionStore.get(sessionId);
		if (session?.sessionId) {
			await this.setSession(
				sessionId,
				{
					...session,
					...data,
					user: {
						...session.user,
						...data.user,
					},
				},
				this.type.sessionDuration
			);
		}
	}

	protected async getSession(sessionId: string): Promise<SessionRecord | null> {
		const session = await this.sessionStore.get(sessionId);
		return session ?? null;
	}

	protected async deleteSession(sessionId: string): Promise<void> {
		await this.sessionStore.del(sessionId);
	}

	protected async addUserSession(userId: string, sessionId: string): Promise<void> {
		const key = this.userSessionsKey(userId);

		const sessions = (await this.sessionIndexStore.get(key)) ?? [];

		if (!sessions.includes(sessionId)) {
			sessions.push(sessionId);
		}

		await this.sessionIndexStore.set(key, sessions, this.type.sessionDuration);
	}

	protected async removeUserSession(userId: string, sessionId: string): Promise<void> {
		const key = this.userSessionsKey(userId);

		const sessions = (await this.sessionIndexStore.get(key)) ?? [];

		const filtered = sessions.filter(id => id !== sessionId);

		if (filtered.length === 0) {
			await this.sessionIndexStore.del(key);
			return;
		}

		await this.sessionIndexStore.set(key, filtered, this.type.sessionDuration);
	}

	protected async getUserSessions(userId: string): Promise<string[]> {
		const key = this.userSessionsKey(userId);
		return (await this.sessionIndexStore.get(key)) ?? [];
	}

	protected async clearUserSessions(userId: string): Promise<void> {
		await this.sessionIndexStore.del(this.userSessionsKey(userId));
	}
}
