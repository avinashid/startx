import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger, format, transports } from "winston";

import { consoleFormat } from "./logger.js";

const capture = (colors: boolean) => {
	const lines: string[] = [];
	const stream = new Writable({
		write(chunk: Buffer, _encoding, done) {
			lines.push(chunk.toString());
			done();
		},
	});
	const log = createLogger({
		format: format.timestamp(),
		transports: [new transports.Stream({ stream, format: consoleFormat(colors) })],
	});
	return { log, lines };
};

describe("consoleFormat (B75)", () => {
	it("prints metadata without winston's Symbol internals", () => {
		const { log, lines } = capture(false);
		log.info("Registering worker", { queue: "email-send" });

		expect(lines[0]).toContain("Extra Details:");
		expect(lines[0]).toContain("queue: 'email-send'");
		expect(lines[0]).not.toContain("Symbol(");
	});

	it("adds no Extra Details block when there is no metadata", () => {
		const { log, lines } = capture(false);
		log.info("Worker ready");

		expect(lines[0]).toMatch(/:INFO: Worker ready/);
		expect(lines[0]).not.toContain("Extra Details");
	});

	it("emits ANSI colour only when asked", () => {
		const plain = capture(false);
		const colored = capture(true);
		plain.log.warn("x");
		colored.log.warn("x");

		expect(plain.lines[0]).not.toContain("\u001b[");
		expect(colored.lines[0]).toContain("\u001b[");
	});
});
