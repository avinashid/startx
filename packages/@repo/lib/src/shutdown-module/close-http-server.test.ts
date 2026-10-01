import { Agent, createServer, get, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";

import { trackHttpServer } from "./shutdown.js";

// Real sockets and a keep-alive agent: the defect (B73 review) only shows on a kept-alive connection.
const servers: Server[] = [];
const agents: Agent[] = [];

const start = async () => {
	const held: Array<() => void> = [];
	const server = createServer((_req, res) => held.push(() => res.end("ok")));
	server.keepAliveTimeout = 5_000;
	servers.push(server);
	const tracked = trackHttpServer(server);
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const agent = new Agent({ keepAlive: true });
	agents.push(agent);
	const { port } = server.address() as AddressInfo;
	const request = () =>
		new Promise<{ res: IncomingMessage; body: string }>((resolve, reject) => {
			get({ host: "127.0.0.1", port, agent, path: "/" }, (res) => {
				let body = "";
				res.on("data", (chunk: Buffer) => (body += chunk.toString()));
				res.on("end", () => resolve({ res, body }));
			}).on("error", reject);
		});
	const respondAll = () => {
		for (const respond of held.splice(0)) respond();
	};
	const waitForRequests = async (count: number) => {
		while (held.length < count) await new Promise((r) => setTimeout(r, 5));
	};
	return { tracked, request, respondAll, waitForRequests };
};

const elapsed = async (promise: Promise<unknown>) => {
	const t0 = performance.now();
	await promise;
	return performance.now() - t0;
};

afterEach(() => {
	for (const agent of agents.splice(0)) agent.destroy();
	for (const server of servers.splice(0)) server.closeAllConnections();
});

describe("trackHttpServer (B73)", () => {
	it("lets an in-flight keep-alive request finish and closes without waiting out keepAliveTimeout", async () => {
		const { tracked, request, respondAll, waitForRequests } = await start();
		const inFlight = request();
		await waitForRequests(1);

		// A long sweep interval: the socket must close because of Connection: close, not the sweep.
		const closing = tracked.close({ pollMs: 60_000 });
		setTimeout(respondAll, 200);
		const [ms, { res, body }] = await Promise.all([elapsed(closing), inFlight]);

		expect(body).toBe("ok");
		expect(res.headers.connection).toBe("close");
		expect(ms).toBeLessThan(1_500);
	});

	it("keeps Connection: keep-alive outside a drain", async () => {
		const { tracked, request, respondAll, waitForRequests } = await start();
		const pending = request();
		await waitForRequests(1);
		respondAll();

		expect((await pending).res.headers.connection).toBe("keep-alive");
		expect(await elapsed(tracked.close())).toBeLessThan(1_500);
	});

	it("cuts a request that outlasts graceMs", async () => {
		const { tracked, request, waitForRequests } = await start();
		const hung = request().catch((error: unknown) => error);
		await waitForRequests(1);

		expect(await elapsed(tracked.close({ graceMs: 200 }))).toBeLessThan(1_500);
		expect(await hung).toBeInstanceOf(Error);
	});
});
