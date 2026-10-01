import { defineEnv } from "@repo/env";
import { drizzle } from "drizzle-orm/node-sqlite";
import { DatabaseSync } from "node:sqlite";
import z from "zod";
import { prepareDbPath } from "./path.js";

const env = defineEnv({
	// Relative paths resolve against the workspace root (see resolveDbPath), ":memory:" is in-memory.
	SQLITE_DB_PATH: z.string().min(1).default("data/app.db"),
});

/** Open a database with the pragmas a server wants: WAL, foreign keys enforced, a busy wait. */
export function openSqlite(dbPath: string): DatabaseSync {
	const client = new DatabaseSync(prepareDbPath(dbPath));
	client.exec(`
		PRAGMA journal_mode = WAL;
		PRAGMA synchronous = NORMAL;
		PRAGMA foreign_keys = ON;
		PRAGMA busy_timeout = 5000;
	`);
	return client;
}

/** The raw node:sqlite handle, for pragmas, backups or closing on shutdown. */
const sqlite = openSqlite(env.SQLITE_DB_PATH);
const db = drizzle({ client: sqlite });

export type SqliteDB = typeof db;
export type SqliteTransaction = Parameters<Parameters<SqliteDB["transaction"]>[0]>[0];
export { db, sqlite };
