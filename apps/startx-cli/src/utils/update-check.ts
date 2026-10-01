import { defineEnv } from "@repo/env";
import fs from "fs/promises";
import os from "os";
import path from "path";
import z from "zod";

const ENV = defineEnv({
	CI: z.string().optional(),
	STARTX_NO_UPDATE_CHECK: z.string().optional(),
	STARTX_ENV: z.string().optional(),
	XDG_CACHE_HOME: z.string().optional(),
});

const REGISTRY_URL = "https://registry.npmjs.org/startx/latest";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const TIMEOUT_MS = 1500;

type Cache = { checkedAt: number; latest: string };

export type UpdateCheckOptions = {
	current: string;
	fetchImpl?: typeof fetch;
	cacheFile?: string;
	now?: () => number;
	env?: Partial<typeof ENV>;
};

const isSet = (value: string | undefined) => value !== undefined && value !== "" && value !== "0" && value !== "false";

export const defaultCacheFile = () =>
	path.join(ENV.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"), "startx", "update-check.json");

/** `a > b` for plain `x.y.z` versions. Anything else (prereleases, garbage) compares as not newer. */
export const isNewer = (a: string, b: string) => {
	const parse = (v: string) => (/^\d+\.\d+\.\d+$/.test(v) ? v.split(".").map(Number) : null);
	const pa = parse(a);
	const pb = parse(b);
	if (!pa || !pb) return false;
	for (let i = 0; i < 3; i++) {
		if (pa[i] !== pb[i]) return pa[i] > pb[i];
	}
	return false;
};

async function readCache(file: string): Promise<Cache | null> {
	try {
		const parsed = JSON.parse(await fs.readFile(file, "utf-8")) as Partial<Cache>;
		return typeof parsed.checkedAt === "number" && typeof parsed.latest === "string" ? (parsed as Cache) : null;
	} catch {
		return null;
	}
}

/**
 * Resolves to the newer published version when the running CLI is behind npm `latest`, else
 * undefined. Never throws and never takes longer than the fetch timeout: a stale CLI scaffolds an
 * outdated template without any error, so this only warns, and an offline run must not notice it.
 */
export async function checkForUpdate(options: UpdateCheckOptions): Promise<string | undefined> {
	const env = { ...ENV, ...options.env };
	if (isSet(env.CI) || isSet(env.STARTX_NO_UPDATE_CHECK)) return undefined;
	// A source checkout (`pnpm cli`, the E2E harness) reports the repo's own version; skip the network.
	if (env.STARTX_ENV === "development" || env.STARTX_ENV === "test") return undefined;

	const now = options.now ?? Date.now;
	const cacheFile = options.cacheFile ?? defaultCacheFile();
	const fetchImpl = options.fetchImpl ?? fetch;

	try {
		let latest: string | undefined;
		const cached = await readCache(cacheFile);
		if (cached && now() - cached.checkedAt < CACHE_TTL_MS) {
			latest = cached.latest;
		} else {
			const response = await fetchImpl(REGISTRY_URL, { signal: AbortSignal.timeout(TIMEOUT_MS) });
			if (!response.ok) return undefined;
			const body = (await response.json()) as { version?: unknown };
			if (typeof body.version !== "string") return undefined;
			latest = body.version;
			await fs.mkdir(path.dirname(cacheFile), { recursive: true });
			await fs.writeFile(cacheFile, JSON.stringify({ checkedAt: now(), latest } satisfies Cache));
		}
		return isNewer(latest, options.current) ? latest : undefined;
	} catch {
		return undefined;
	}
}
