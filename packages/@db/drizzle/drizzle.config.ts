import { defineConfig } from "drizzle-kit";
import { defineEnv } from "@repo/env";
import z from "zod";
const env = defineEnv({
	DATABASE_URL: z.string(),
});
export default defineConfig({
	out: "./drizzle",
	// The barrel, not a glob: a glob also matches index.ts, which re-exports every table, and
	// drizzle-kit then reports each table twice.
	schema: "./src/schema/index.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: env.DATABASE_URL!,
	},
});
