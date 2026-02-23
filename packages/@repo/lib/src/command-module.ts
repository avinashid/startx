import { logger } from "./logger-module/logger.js";

/**
 * @description Custom command class that extends for creating custom commands
 * @constructor
 * @param name
 * @param description
 * @param fn
 */
export class Command {
	name: string;
	description?: string;
	fn: (flags: string[]) => void;
	constructor({
		description = "",
		fn,
		name,
	}: {
		name: string;
		description?: string;
		fn: (flags: string[]) => void;
	}) {
		this.name = name;
		this.description = description;
		this.fn = fn;
	}
}

/**
 * @description Custom command executer class
 */
export class CommandExecuter {
	/**
	 * @description Available commands
	 */
	static commands = new Map<string, Command>();

	/**
	 * @description Register a new command
	 * @param command
	 */
	static register(command: Command) {
		this.commands.set(command.name, command);
	}
	static registerAll(commands: Command[]) {
		for (const command of commands) {
			this.register(command);
		}
	}

	/**
	 * @description execute the command from console
	 * @param string
	 */
	static async start() {
		const command = process.argv[2];
		const flags = process.argv.slice(3);
		if (command === undefined) {
			CommandExecuter.listCommands();
		} else if (this.commands.has(command)) {
			this.commands.get(command)?.fn(flags);
			await new Promise((resolve) => setTimeout(resolve, 1000));
			logger.info(`Command executed: ${command}`);
			process.exit();
		} else {
			console.log(`Unknown command: ${command}`);
			CommandExecuter.listCommands();
		}
	}

	static listCommands() {
		console.log("Available commands:");
		for (const command of this.commands.values()) {
			console.log(`- ${command.name}: ${command.description}`);
		}
	}
}
