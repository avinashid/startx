import { defineEnv } from "@repo/env";
import fs from "fs/promises";
import https from "https";
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
// An offline or firewalled run caches its failure too, so it pays the timeout once an hour, not on every init.
const FAILURE_TTL_MS = 60 * 60 * 1000;
const TIMEOUT_MS = 1500;
const MAX_BODY_BYTES = 64 * 1024;

/** `latest: null` records a failed check. */
type Cache = { checkedAt: number; latest: string | null };

export type RegistryResponse = { status: number; body: string };
export type RegistryRequest = (url: string, signal: AbortSignal) => Promise<RegistryResponse>;

export type UpdateCheckOptions = {
	current: string;
	request?: RegistryRequest;
	/** A function, so resolving the default path (`os.homedir()`, which can throw) happens inside the guard. */
	cacheFile?: () => string;
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
		return typeof parsed.checkedAt === "number" && (typeof parsed.latest === "string" || parsed.latest === null)
			? (parsed as Cache)
			: null;
	} catch {
		return null;
	}
}

/**
 * `node:https` rather than `fetch`: after an abort, undici's pending connect keeps the process alive
 * for its own ~10s connect timeout, so a blackholed registry would hold up a finished command.
 * An aborted `https` request destroys its socket.
 */
export const httpsRequest: RegistryRequest = (url, signal) =>
	new Promise((resolve, reject) => {
		const req = https.get(url, { signal, headers: { accept: "application/json" } }, (res) => {
			let body = "";
			res.setEncoding("utf-8");
			res.on("data", (chunk: string) => {
				body += chunk;
				if (body.length > MAX_BODY_BYTES) req.destroy(new Error("registry response too large"));
			});
			res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
			res.on("error", reject);
		});
		req.on("error", reject);
	});

async function fetchLatest(request: RegistryRequest): Promise<string | null> {
	try {
		const response = await request(REGISTRY_URL, AbortSignal.timeout(TIMEOUT_MS));
		if (response.status !== 200) return null;
		const body = JSON.parse(response.body) as { version?: unknown };
		return typeof body.version === "string" ? body.version : null;
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
	const request = options.request ?? httpsRequest;

	try {
		const cacheFile = (options.cacheFile ?? defaultCacheFile)();
		const cached = await readCache(cacheFile);
		let latest: string | null;
		if (cached && now() - cached.checkedAt < (cached.latest === null ? FAILURE_TTL_MS : CACHE_TTL_MS)) {
			latest = cached.latest;
		} else {
			latest = await fetchLatest(request);
			// Its own guard: a read-only cache dir must not throw away a check that succeeded.
			try {
				await fs.mkdir(path.dirname(cacheFile), { recursive: true });
				await fs.writeFile(cacheFile, JSON.stringify({ checkedAt: now(), latest } satisfies Cache));
			} catch {
				// Uncached: the next run checks again.
			}
		}
		return latest !== null && isNewer(latest, options.current) ? latest : undefined;
	} catch {
		return undefined;
	}
}
