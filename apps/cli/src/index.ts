import { Command } from "commander";
import { commands } from "./commands/index.js";
import packageJson from "../../../package.json" with { type: "json" };

const { version, name, description } = packageJson;

const program = new Command();

program.name(name).description(description).version(version);

for (const cmd of commands) {
	program.addCommand(cmd.command);
}
program.parse(process.argv);
