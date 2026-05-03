import { logger } from "@repo/logger";
import { Command } from "commander";
import { ICommand } from "../i-command.js";

export class TestCommand extends ICommand {
	command = new Command("test").description("For general testing purposes.").action(this.run.bind(this));

	run() {
		logger.info("Test command executed.");
	}
}
