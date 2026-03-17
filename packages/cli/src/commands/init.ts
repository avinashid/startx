import { Command } from "commander";
import path from "path";
import z from "zod";

import type { TAGS } from "../types";
import { CliUtils, type RawPackageItem } from "../utils/cli-utils";
import { CommonInquirer } from "../utils/inquirer";

type InitOptions = {
	directory?: string;
	withVitest?: string;
	withEslint?: string;
};

export class InitCommand {
	static command = new Command("init")
		.argument("[projectName]")
		.option("-d, --directory <path>", "workspace directory")
		.option("--with-vitest <boolean>", "include vitest", true)
		.option("--with-eslint <boolean>", "include eslint", true)
		.action(InitCommand.run.bind(InitCommand));

	private static async run(projectName: string | undefined, options: InitOptions) {
		const packageList = await CliUtils.getPackageList();
		const prefs = await InitCommand.getPrefs({
			projectName,
			options,
			projects: packageList.filter(e => e.type === "apps"),
		});

		console.warn(JSON.stringify(prefs, null, 2));
	}

	private static async getPrefs(props: {
		projectName?: string;
		directory?: string;
		options: InitOptions;
		projects: RawPackageItem[];
	}) {
		const tags = new Map<TAGS, TAGS>();

		if (
			props.options.withEslint === "true" ||
			(props.options.withEslint as unknown as boolean) === true
		) {
			tags.set("eslint", "eslint");
		}

		if (
			props.options.withVitest === "true" ||
			(props.options.withVitest as unknown as boolean) === true
		) {
			tags.set("vitest", "vitest");
		}

		if (!props.projectName) {
			props.projectName = await CommonInquirer.getText({
				message: "Project naming",
				name: "projectName",
				schema: z.string().min(2).trim(),
			});
		}

		// Handling workspace directory
		const directory = CliUtils.getDirectory();
		let workspace;
		if (props.options.directory) {
			try {
				workspace = path.resolve(directory.workspace, props.options.directory);
			} catch {
				throw new Error("Invalid template directory");
			}
		} else {
			workspace = path.join(directory.workspace, props.projectName);
		}

		if (props.projects.length === 0) {
			throw new Error("No apps found");
		}

		const selectedAppNames = await CommonInquirer.choose({
			message: "Select apps to install",
			options: props.projects.map(e => e.name),
			includeAllOption: true,
			mode: "multiple",
			required: true,
		});

		const selectedProjects = props.projects.filter(e => selectedAppNames.includes(e.name));

		const formatter: string | string[] = await CommonInquirer.choose({
			message: "Select formatter",
			options: ["prettier + biome", "prettier"],
			mode: "single",
			default: "prettier",
			required: true,
		});

		if (formatter === "prettier") {
			tags.set("prettier", "prettier");
		} else {
			tags.set("biome", "biome");
			tags.set("prettier", "prettier");
		}

		return {
			projectName: props.projectName,
			workspace,
			selectedProjects,
			tags: Array.from(tags.values()),
		};
	}
}
