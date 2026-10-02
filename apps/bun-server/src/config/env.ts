import { defineEnv } from "@repo/env";
import z from "zod";

export const BunServerEnv = defineEnv({
	// Its own variable rather than PORT, which core-server reads, so both run in one workspace.
	PORT: { schema: z.coerce.number().int().min(1).max(65535), env: "BUN_SERVER_PORT", default: "3002" },
	// Request bodies over this many bytes get a 413 before they are read.
	MAX_BODY_BYTES: {
		schema: z.coerce.number().int().positive(),
		env: "BUN_SERVER_MAX_BODY_BYTES",
		default: String(1024 * 1024),
	},
});
