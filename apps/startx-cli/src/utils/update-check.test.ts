import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkForUpdate, isNewer } from "./update-check";

const live = { CI: undefined, STARTX_NO_UPDATE_CHECK: undefined, STARTX_ENV: "production" };
const registry = (version: string) =>
	vi.fn(() => Promise.resolve(new Response(JSON.stringify({ version }), { status: 200 }))) as unknown as typeof fetch;

let tmp: string;
let cacheFile: string;
beforeEach(async () => {
	tmp = await fs.mkdtemp(path.join(os.tmpdir(), "startx-update-test-"));
	cacheFile = path.join(tmp, "nested", "update-check.json");
});
afterEach(async () => {
	await fs.rm(tmp, { recursive: true, force: true });
});

describe("isNewer", () => {
	it("compares numerically, not lexically", () => {
		expect(isNewer("1.10.0", "1.9.9")).toBe(true);
		expect(isNewer("1.2.0", "1.1.60")).toBe(true);
		expect(isNewer("1.2.0", "1.2.0")).toBe(false);
		expect(isNewer("1.1.60", "1.2.0")).toBe(false);
	});

	it("treats prereleases and garbage as not newer", () => {
		expect(isNewer("2.0.0-beta.1", "1.2.0")).toBe(false);
		expect(isNewer("latest", "1.2.0")).toBe(false);
	});
});

describe("checkForUpdate", () => {
	it("returns the newer version and caches it", async () => {
		const fetchImpl = registry("1.3.0");
		await expect(checkForUpdate({ current: "1.2.0", fetchImpl, cacheFile, env: live })).resolves.toBe("1.3.0");
		const cached = JSON.parse(await fs.readFile(cacheFile, "utf-8")) as { latest: string };
		expect(cached.latest).toBe("1.3.0");
	});

	it("returns undefined when already on latest", async () => {
		await expect(
			checkForUpdate({ current: "1.2.0", fetchImpl: registry("1.2.0"), cacheFile, env: live }),
		).resolves.toBeUndefined();
	});

	it("serves a fresh cache without touching the network, and refetches once it is a day old", async () => {
		const fetchImpl = registry("1.3.0");
		let now = 1_000;
		await checkForUpdate({ current: "1.2.0", fetchImpl, cacheFile, env: live, now: () => now });
		now += 23 * 60 * 60 * 1000;
		await expect(checkForUpdate({ current: "1.2.0", fetchImpl, cacheFile, env: live, now: () => now })).resolves.toBe(
			"1.3.0",
		);
		expect(fetchImpl).toHaveBeenCalledTimes(1);
		now += 2 * 60 * 60 * 1000;
		await checkForUpdate({ current: "1.2.0", fetchImpl, cacheFile, env: live, now: () => now });
		expect(fetchImpl).toHaveBeenCalledTimes(2);
	});

	it("is skipped in CI, when opted out, and from a source checkout", async () => {
		const fetchImpl = registry("9.9.9");
		for (const env of [
			{ ...live, CI: "true" },
			{ ...live, STARTX_NO_UPDATE_CHECK: "1" },
			{ ...live, STARTX_ENV: "development" },
		]) {
			await expect(checkForUpdate({ current: "1.2.0", fetchImpl, cacheFile, env })).resolves.toBeUndefined();
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("swallows network failures and bad responses", async () => {
		const offline = vi.fn(() => Promise.reject(new TypeError("fetch failed"))) as unknown as typeof fetch;
		await expect(
			checkForUpdate({ current: "1.2.0", fetchImpl: offline, cacheFile, env: live }),
		).resolves.toBeUndefined();
		const notFound = vi.fn(() => Promise.resolve(new Response("{}", { status: 404 }))) as unknown as typeof fetch;
		await expect(
			checkForUpdate({ current: "1.2.0", fetchImpl: notFound, cacheFile, env: live }),
		).resolves.toBeUndefined();
	});
});
