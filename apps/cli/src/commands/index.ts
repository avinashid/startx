import { HashingCommands } from "./common/hashing.js";
import { PingCommand } from "./common/ping.js";
import { RandomCommand } from "./common/random.js";
import { TestCommand } from "./common/test.js";
import { ICommand } from "./i-command.js";

export const commands: ICommand[] = [new PingCommand(), new RandomCommand(), new TestCommand(), ...HashingCommands];
