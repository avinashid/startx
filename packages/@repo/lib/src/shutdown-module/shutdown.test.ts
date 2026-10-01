import { describe, expect, it, vi } from "vitest";

import { createShutdown } from "./shutdown.js";

describe("createShutdown (B73)", () => {
	it("runs steps in order and exits 0", async () => {
		const order: string[] = [];
		const exit = vi.fn();
		const shutdown = createShutdown(
			[
				{
					name: "server",
					run: async () => {
						await Promise.resolve();
						order.push("server");
					},
				},
				{
					name: "redis",
					run: () => {
						order.push("redis");
					},
				},
			],
			{ exit },
		);

		await shutdown("SIGTERM");

		expect(order).toEqual(["server", "redis"]);
		expect(exit).toHaveBeenCalledExactlyOnceWith(0);
	});

	it("keeps going after a failing step and exits 1", async () => {
		const exit = vi.fn();
		const later = vi.fn();
		const shutdown = createShutdown(
			[
				{
					name: "broken",
					run: () => {
						throw new Error("boom");
					},
				},
				{ name: "later", run: later },
			],
			{ exit },
		);

		await shutdown("SIGTERM");

		expect(later).toHaveBeenCalledOnce();
		expect(exit).toHaveBeenCalledExactlyOnceWith(1);
	});

	it("exits 1 immediately on a second signal", async () => {
		const exit = vi.fn();
		let release!: () => void;
		const shutdown = createShutdown([{ name: "slow", run: () => new Promise<void>((r) => (release = r)) }], { exit });

		const first = shutdown("SIGTERM");
		await shutdown("SIGINT");
		expect(exit).toHaveBeenCalledExactlyOnceWith(1);

		release();
		await first;
	});

	it("exits 1 when the steps outlast the timeout", async () => {
		vi.useFakeTimers();
		const exit = vi.fn();
		const shutdown = createShutdown([{ name: "hang", run: () => new Promise(() => {}) }], { exit, timeoutMs: 50 });

		void shutdown("SIGTERM");
		await vi.advanceTimersByTimeAsync(60);

		expect(exit).toHaveBeenCalledExactlyOnceWith(1);
		vi.useRealTimers();
	});
});
