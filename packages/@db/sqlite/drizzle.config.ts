import { defineEnv } from "@repo/env";
import { defineConfig } from "drizzle-kit";
import z from "zod";
import { prepareDbPath } from "./src/path.js";

const env = defineEnv({
	SQLITE_DB_PATH: z.string().min(1).default("data/app.db"),
});
export default defineConfig({
	out: "./drizzle",
	// The barrel, not a glob: a glob also matches index.ts, which re-exports every table, and
	// drizzle-kit then reports each table twice.
	schema: "./src/schema/index.ts",
	dialect: "sqlite",
	dbCredentials: {
		url: prepareDbPath(env.SQLITE_DB_PATH),
	},
});
