#!/usr/bin/env node
import { logger } from "@repo/logger";
import { Command } from "commander";

import { InitCommand } from "./commands/init";
import { version } from "../../../package.json";

const program = new Command();

program
	.name("startx")
	.description("StartX CLI - Your all in one monorepo startup tool.")
	.version(version);

program.command("ping").action(() => {
	logger.info("pong");
});

program.addCommand(InitCommand.command);

program.parse(process.argv);
