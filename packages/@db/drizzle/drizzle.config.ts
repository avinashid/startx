import { defineConfig } from "drizzle-kit";
import { defineEnv } from "@repo/env";
import z from "zod";
const env = defineEnv({
	DATABASE_URL: z.string(),
});
export default defineConfig({
	out: "./drizzle",
	schema: "./src/schema/index.ts",
	dialect: "postgresql",
	dbCredentials: {
		url: env.DATABASE_URL!,
	},
});
