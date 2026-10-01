import { integer, sqliteTable } from "drizzle-orm/sqlite-core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.stubEnv("SQLITE_DB_PATH", ":memory:");
const { db, eq, increment, sqlite, usersTable } = await import("./index.js");

const counters = sqliteTable("counters", {
	id: integer("id").primaryKey(),
	n: integer("n").notNull(),
});

beforeAll(() => {
	sqlite.exec(`
		CREATE TABLE users (
			id TEXT PRIMARY KEY,
			email TEXT NOT NULL UNIQUE,
			full_name TEXT NOT NULL DEFAULT 'Guest',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE TABLE counters (id INTEGER PRIMARY KEY, n INTEGER NOT NULL);
		CREATE TABLE posts (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id));
	`);
});

afterAll(() => {
	sqlite.close();
	vi.unstubAllEnvs();
});

describe("@db/sqlite", () => {
	it("round-trips a row through drizzle on node:sqlite", () => {
		const [created] = db.insert(usersTable).values({ email: "a@example.com" }).returning().all();
		expect(created?.fullName).toBe("Guest");
		expect(created?.createdAt).toBeInstanceOf(Date);

		const found = db.select().from(usersTable).where(eq(usersTable.email, "a@example.com")).get();
		expect(found?.id).toBe(created?.id);
	});

	it("enforces foreign keys", () => {
		expect(() => sqlite.exec(`INSERT INTO posts (user_id) VALUES ('missing')`)).toThrow(/FOREIGN KEY/);
	});

	it("rolls a failed transaction back", () => {
		expect(() =>
			db.transaction((tx) => {
				tx.insert(usersTable).values({ email: "b@example.com" }).run();
				tx.insert(usersTable).values({ email: "b@example.com" }).run();
			}),
		).toThrow();
		expect(db.select().from(usersTable).where(eq(usersTable.email, "b@example.com")).all()).toHaveLength(0);
	});

	it("updates through the increment helper", () => {
		db.insert(counters).values({ id: 1, n: 1 }).run();
		db.update(counters)
			.set({ n: increment(counters.n, 2) })
			.where(eq(counters.id, 1))
			.run();
		expect(db.select().from(counters).where(eq(counters.id, 1)).get()?.n).toBe(3);
	});
});
