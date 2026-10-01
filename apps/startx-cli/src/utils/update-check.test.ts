import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { checkForUpdate, httpsRequest, isNewer, type RegistryRequest } from "./update-check";

const live = { CI: undefined, STARTX_NO_UPDATE_CHECK: undefined, STARTX_ENV: "production" };
const registry = (version: string) =>
	vi.fn<RegistryRequest>(() => Promise.resolve({ status: 200, body: JSON.stringify({ version }) }));
const offline = () => vi.fn<RegistryRequest>(() => Promise.reject(new Error("connect ETIMEDOUT")));

let tmp: string;
let cacheFile: () => string;
const readCached = async () => JSON.parse(await fs.readFile(cacheFile(), "utf-8")) as { latest: string | null };
beforeEach(async () => {
	tmp = await fs.mkdtemp(path.join(os.tmpdir(), "startx-update-test-"));
	const file = path.join(tmp, "nested", "update-check.json");
	cacheFile = () => file;
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
		const request = registry("1.3.0");
		await expect(checkForUpdate({ current: "1.2.0", request, cacheFile, env: live })).resolves.toBe("1.3.0");
		expect((await readCached()).latest).toBe("1.3.0");
	});

	it("passes an abort signal that times out", async () => {
		const request = registry("1.3.0");
		await checkForUpdate({ current: "1.2.0", request, cacheFile, env: live });
		const [url, signal] = request.mock.calls[0] ?? [];
		expect(url).toBe("https://registry.npmjs.org/startx/latest");
		expect(signal).toBeInstanceOf(AbortSignal);
		expect(signal.aborted).toBe(false);
		await vi.waitFor(() => expect(signal.aborted).toBe(true), { timeout: 3000, interval: 50 });
		expect(signal.reason).toBeInstanceOf(DOMException);
		expect((signal.reason as DOMException).name).toBe("TimeoutError");
	});

	it("still reports a successful check when the cache cannot be written", async () => {
		// A file where the cache directory should be makes mkdir fail, as a read-only HOME would.
		await fs.writeFile(path.join(tmp, "nested"), "");
		await expect(checkForUpdate({ current: "1.2.0", request: registry("1.3.0"), cacheFile, env: live })).resolves.toBe(
			"1.3.0",
		);
	});

	it("never throws when the default cache path cannot be resolved", async () => {
		const cacheFile = () => {
			throw new Error("ENOENT: no such file or directory, uv_os_homedir");
		};
		const request = registry("1.3.0");
		await expect(checkForUpdate({ current: "1.2.0", request, cacheFile, env: live })).resolves.toBeUndefined();
		expect(request).not.toHaveBeenCalled();
	});

	it("caches a failure for an hour, not a day", async () => {
		let now = 1_000;
		const request = offline();
		await expect(
			checkForUpdate({ current: "1.2.0", request, cacheFile, env: live, now: () => now }),
		).resolves.toBeUndefined();
		expect((await readCached()).latest).toBeNull();

		now += 59 * 60 * 1000;
		await checkForUpdate({ current: "1.2.0", request, cacheFile, env: live, now: () => now });
		expect(request).toHaveBeenCalledTimes(1);

		now += 2 * 60 * 1000;
		const recovered = registry("1.3.0");
		await expect(
			checkForUpdate({ current: "1.2.0", request: recovered, cacheFile, env: live, now: () => now }),
		).resolves.toBe("1.3.0");
		expect(recovered).toHaveBeenCalledTimes(1);
	});

	it("returns undefined when already on latest", async () => {
		await expect(
			checkForUpdate({ current: "1.2.0", request: registry("1.2.0"), cacheFile, env: live }),
		).resolves.toBeUndefined();
	});

	it("serves a fresh cache without touching the network, and refetches once it is a day old", async () => {
		const request = registry("1.3.0");
		let now = 1_000;
		await checkForUpdate({ current: "1.2.0", request, cacheFile, env: live, now: () => now });
		now += 23 * 60 * 60 * 1000;
		await expect(checkForUpdate({ current: "1.2.0", request, cacheFile, env: live, now: () => now })).resolves.toBe(
			"1.3.0",
		);
		expect(request).toHaveBeenCalledTimes(1);
		now += 2 * 60 * 60 * 1000;
		await checkForUpdate({ current: "1.2.0", request, cacheFile, env: live, now: () => now });
		expect(request).toHaveBeenCalledTimes(2);
	});

	it("is skipped in CI, when opted out, and from a source checkout", async () => {
		const request = registry("9.9.9");
		for (const env of [
			{ ...live, CI: "true" },
			{ ...live, STARTX_NO_UPDATE_CHECK: "1" },
			{ ...live, STARTX_ENV: "development" },
		]) {
			await expect(checkForUpdate({ current: "1.2.0", request, cacheFile, env })).resolves.toBeUndefined();
		}
		expect(request).not.toHaveBeenCalled();
	});

	it("swallows network failures and bad responses", async () => {
		for (const request of [
			offline(),
			vi.fn<RegistryRequest>(() => Promise.resolve({ status: 404, body: "{}" })),
			vi.fn<RegistryRequest>(() => Promise.resolve({ status: 200, body: "<html>" })),
		]) {
			await fs.rm(cacheFile(), { force: true });
			await expect(checkForUpdate({ current: "1.2.0", request, cacheFile, env: live })).resolves.toBeUndefined();
		}
	});
});

describe("httpsRequest", () => {
	it("rejects as soon as the signal aborts when the registry stalls", async () => {
		// Accepts the TCP connection and never answers the TLS handshake, like a stalled proxy.
		const sockets = new Set<net.Socket>();
		const server = net.createServer((socket) => sockets.add(socket));
		await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
		const { port } = server.address() as net.AddressInfo;

		const started = Date.now();
		await expect(httpsRequest(`https://127.0.0.1:${port}/`, AbortSignal.timeout(200))).rejects.toMatchObject({
			name: "AbortError",
		});
		expect(Date.now() - started).toBeLessThan(2000);

		for (const socket of sockets) socket.destroy();
		await new Promise((resolve) => server.close(resolve));
	});
});
