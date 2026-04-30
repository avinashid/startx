import { Command } from "commander";

export abstract class ICommand {
	abstract command: Command;
	abstract run(...args: unknown[]): Promise<void> | void;
}
