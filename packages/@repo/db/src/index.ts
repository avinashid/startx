import type { ExtractTablesWithRelations } from "drizzle-orm";
import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { type PgTransaction } from "drizzle-orm/pg-core";
import Pg from "pg";

import * as schema from "./schema/index.js";

export const client = new Pg.Pool({
	connectionString: process.env.DATABASE_URL,
});
const db = drizzle({ client, schema });
export type DrizzleTransaction = PgTransaction<
	NodePgQueryResultHKT,
	typeof schema,
	ExtractTablesWithRelations<typeof schema>
>;
export type DrizzleDB = typeof db;
export  {db};
export * from "./functions.js";
export * from "./schema/index.js";
