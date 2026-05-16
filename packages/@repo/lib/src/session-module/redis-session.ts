import type { SessionUser } from "@repo/common/types/users";
import { RedisStore } from "@repo/redis";
import { IUserSession, type TokenPair } from "./i-session.js";

export class RedisUserSession extends IUserSession {
	private userStore: RedisStore<SessionUser>;
	private tokenStore: RedisStore<TokenPair>;

	constructor() {
		super();
		this.userStore = new RedisStore<SessionUser>({
			namespace: "user-session",
		});
		this.tokenStore = new RedisStore<TokenPair>({
			namespace: "user-tokens",
		});
	}

	protected async setSessionData(key: string, data: SessionUser, ttl: number): Promise<void> {
		await this.userStore.set(key, data, ttl);
	}

	protected async getSessionData(key: string): Promise<SessionUser | null> {
		const data = await this.userStore.get(key);
		return data ?? null;
	}

	protected async deleteSessionData(key: string): Promise<void> {
		await this.userStore.del(key);
	}

	protected async setTokenData(key: string, data: TokenPair, ttl: number): Promise<void> {
		await this.tokenStore.set(key, data, ttl);
	}

	protected async getTokenData(key: string): Promise<TokenPair | null> {
		const data = await this.tokenStore.get(key);
		return data ?? null;
	}

	protected async deleteTokenData(key: string): Promise<void> {
		await this.tokenStore.del(key);
	}
}
