import { defineEnv } from "@repo/lib/env-module";
import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { type PgTransaction } from "drizzle-orm/pg-core";
import Pg from "pg";
import z from "zod";

import * as schema from "./schema/index.js";

const env = defineEnv({
	DATABASE_URL: z.string(),
});
export const client = new Pg.Pool({
	connectionString: env.DATABASE_URL,
});
const db = drizzle({ client, schema });
export type DrizzleTransaction = PgTransaction<
	NodePgQueryResultHKT,
	typeof schema,
	ExtractTablesWithRelations<typeof schema>
>;
export type DrizzleDB = typeof db;
export { db };
export * from "drizzle-orm";
export * from "./functions.js";
export * from "./schema/index.js";
