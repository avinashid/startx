import { logger } from "@repo/logger";
import { Command } from "commander";
import { ICommand } from "../i-command.js";

export class PingCommand extends ICommand {
	command = new Command("ping").description("Ping the CLI").action(this.run.bind(this));

	run() {
		logger.info("pong");
	}
}
