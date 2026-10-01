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

		// Never echo the input: log lines get shipped to collectors, shell history does not (B78).
		logger.info(`Hash: ${hash}`);
	}
}

export class HashingCompareCommand extends ICommand {
	command = new Command("hash:compare")
		.argument("<password>", "Original string")
		.argument("<hash>", "Hash to compare")
		.description("Compare a string against a hash")
		.action(this.run.bind(this));

	async run(password: string, hash: string) {
		const compare = await HashingModule.compare(password, hash);

		// The input stays out of the log, as in `hash` (B78).
		logger.info(`Password ${compare ? "matches" : "does not match"} the hash`);
	}
}
export const HashingCommands = [new HashingCommand(), new HashingCompareCommand()];
