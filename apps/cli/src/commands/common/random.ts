import { Random } from "@repo/lib";
import { logger } from "@repo/logger";
import { Command } from "commander";
import { ICommand } from "../i-command.js";

export class RandomCommand extends ICommand {
	command = new Command("random")
		.argument("<type>", "Type to generate (uuid, string, number, boolean)")
		.option("-l, --length <number>", "Length of string or digits of number")
		.option("-e, --encoding <type>", "Encoding for string (default: hex)")
		.description("Generate random data")
		.action(this.run.bind(this));

	run(type: string, options: { length?: string; encoding?: BufferEncoding }) {
		switch (type.toLowerCase()) {
			case "uuid": {
				logger.info(`UUID: ${Random.generateUUID()}`);
				break;
			}
			case "string": {
				const length = options.length ? parseInt(options.length, 10) : 16;
				const encoding = options.encoding || "hex";
				logger.info(`String: ${Random.generateString(length, encoding)}`);
				break;
			}
			case "number": {
				const digits = options.length ? parseInt(options.length, 10) : 6;
				logger.info(`Number: ${Random.generateNumber(digits)}`);
				break;
			}
			case "boolean": {
				logger.info(`Boolean: ${Random.generateBoolean()}`);
				break;
			}
			default: {
				logger.error(`Unknown type "${type}". Valid types: uuid, string, number, boolean`);
				process.exit(1);
			}
		}
	}
}
