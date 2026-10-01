type RedisAuthCheck = {
	password: string;
	allowNoAuth: boolean;
	nodeEnv: string;
};

/**
 * A blank `REDIS_PASSWORD` is normal against a local Redis, and a silent unauthenticated connection
 * anywhere else. Outside development and test it has to be opted into with `REDIS_ALLOW_NO_AUTH`,
 * e.g. for a Redis that is only reachable on a private network.
 */
export function assertRedisAuth({ password, allowNoAuth, nodeEnv }: RedisAuthCheck) {
	if (password !== "" || allowNoAuth) return;
	if (nodeEnv === "development" || nodeEnv === "test") return;

	throw new Error(
		`REDIS_PASSWORD is not set and NODE_ENV is "${nodeEnv}". Set REDIS_PASSWORD, or set ` +
			"REDIS_ALLOW_NO_AUTH=true if this Redis is deliberately unauthenticated.",
	);
}
