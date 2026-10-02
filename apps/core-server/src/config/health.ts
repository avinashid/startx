import { createHealth } from "@repo/observability";
import { getRedis } from "@repo/redis";

/**
 * What `/ready` waits on. Sessions and OTPs live in Redis, so without it the API cannot serve
 * authenticated traffic. Add a check per hard dependency (a database: `db.execute(sql\`select 1\`)`).
 * A soft dependency the app degrades without does not belong here: failing it takes every replica
 * out of rotation at once.
 */
export const health = createHealth([{ name: "redis", run: () => getRedis().ping() }]);
