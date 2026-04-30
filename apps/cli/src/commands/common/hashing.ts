import { HashingModule } from "@repo/lib/hashing-module";
import { logger } from "@repo/logger";
import { Command } from "commander";
import { ICommand } from "../i-command.js";

class HashingCommand extends ICommand {
	command = new Command("hash")
		.argument("<password>", "String to hash")
		.description("Hash a string")
		.action(this.run.bind(this));

	async run(password: string) {
		const hash = await HashingModule.hash(password);

		logger.info(`Hash for "${password}": ${hash}`);
	}
}

export class HashingCompareCommand extends ICommand {
	command = new Command("hash:compare")
		.argument("<password>", "Original string")
		.argument("<hash>", "Hash to compare")
		.description("Compare a string against a hash")
		.action(this.run.bind(this));

	async run(password: string, hash: string) {
		logger.info(`Comparing password: "${password}" against hash: "${hash}"`);

		const compare = await HashingModule.compare(password, hash);

		logger.info(`Hash for "${password}": ${compare ? "Valid" : "Invalid"}`);
	}
}
export const HashingCommands = [new HashingCommand(), new HashingCompareCommand()];
