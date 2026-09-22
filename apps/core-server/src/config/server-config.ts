import { defineEnv, ENV } from "@repo/env";
import { logger } from "@repo/logger";
import path from "node:path";
import z from "zod";

/** What `bytes` — and therefore body-parser — accepts. Anything else silently disables the cap. */
const BYTE_SIZE = /^\d+(\.\d+)?\s*(b|kb|mb|gb)$/i;

export const ServerConfig = defineEnv({
	/** Cap for `json()` / `urlencoded()` bodies. Rejected at boot unless `bytes` can parse it. */
	MAX_BODY_SIZE: z.string().regex(BYTE_SIZE, "must be a byte size such as 100kb, 1mb or 512b").default("100kb"),
	/** Per-file cap inside a multipart request. */
	MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(10),
	/** Cap for the whole multipart request — files, fields, boundaries and all. */
	MAX_MULTIPART_SIZE_MB: z.coerce.number().positive().default(25),
	MAX_UPLOAD_FILES: z.coerce.number().positive().default(5),
	MAX_UPLOAD_FIELDS: z.coerce.number().positive().default(20),
	RATE_LIMIT_WINDOW_MS: z.coerce.number().positive().default(60_000),
	RATE_LIMIT_MAX: z.coerce.number().positive().default(100),
	AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().positive().default(15 * 60_000),
	AUTH_RATE_LIMIT_MAX: z.coerce.number().positive().default(10),
	/**
	 * Express `trust proxy`: `true` | `false` | a hop count | `loopback` | `uniquelocal` | an
	 * ip/CIDR list. It decides what `req.ip` is, and `req.ip` is the rate limiter's key.
	 *
	 * Default `loopback`: correct when the proxy shares the host (the usual nginx sidecar), and
	 * equivalent to trusting nothing when it does not — so it can never hand a spoofable key to
	 * a client that is not already on the loopback interface. A proxy on another host — a
	 * separate nginx container, an ALB — MUST set the hop count (`1`) or the proxy's address, or
	 * every client shares a single rate-limit bucket.
	 */
	TRUST_PROXY: z
		.string()
		.default("loopback")
		.transform(raw => {
			const value = raw.trim();
			if (value === "true") return true;
			if (value === "false") return false;
			if (/^\d+$/.test(value)) return Number(value);
			return value;
		}),
});

/**
 * A relative `FILE_STORAGE_PATH` resolves against `process.cwd()`, which is the package directory
 * under `pnpm dev` but `/app` in the container — so the sink moves with the working directory.
 * Only an absolute path is deployment-independent; a relative one is resolved and reported rather
 * than left implicit.
 */
export const STORAGE_ROOT = path.resolve(ENV.FILE_STORAGE_PATH);

if (!path.isAbsolute(ENV.FILE_STORAGE_PATH)) {
	logger.warn(
		`FILE_STORAGE_PATH="${ENV.FILE_STORAGE_PATH}" is relative and was resolved against the working directory to "${STORAGE_ROOT}". Set an absolute path so uploads do not move with it.`
	);
}

export const UPLOAD_TEMP_ROOT = path.join(STORAGE_ROOT, ".tmp");
