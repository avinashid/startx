import { defineEnv } from "@repo/env";
import { drizzle, type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import { PgAsyncTransaction } from "drizzle-orm/pg-core";
import z from "zod";

const env = defineEnv({
	DATABASE_URL: z.string(),
});
export type DrizzleTransaction = PgAsyncTransaction<NodePgQueryResultHKT>;
const db = drizzle(env.DATABASE_URL);

export type DrizzleDB = typeof db;
export { db };
export * from "drizzle-orm";
export * from "./functions.js";
