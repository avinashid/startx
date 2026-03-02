#!/usr/bin/env node
import { Command } from "commander";
import { version } from "../../../package.json";

const program = new Command();

program
  .name("startx")
  .description("StartX CLI - Your all in one monorepo startup tool.")
  .version(version);



program.command("ping").action(()=> {
	console.log("pong")

	process.exit(1)
})

 program.parse(process.argv);
