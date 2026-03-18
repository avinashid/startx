import { fsTool } from "@repo/lib/file-system-module";
import { logger } from "@repo/logger";
import { Command } from "commander";
import path from "path";
import z from "zod";

import type { StartXPackageJson, TAGS } from "../types";
import { CliUtils, type RawPackageItem } from "../utils/cli-utils";
import { CommonInquirer } from "../utils/inquirer";

type InitOptions = {
	dir?: string;
	withVitest?: string;
	withEslint?: string;
};

type PackageWithJson = {
	packageJson: StartXPackageJson | null;
	type: "apps" | "configs" | "packages";
	path: string;
	name: string;
};

export class InitCommand {
	static command = new Command("init")
		.argument("[projectName]")
		.option("-d, --dir <path>", "workspace directory")
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

		const apps = await Promise.all(
			prefs.selectedProjects.map(async e => ({
				...e,
				packageJson: await CliUtils.parsePackageJson({ dir: e.path }),
			}))
		);

		const packages = await Promise.all(
			packageList
				.filter(e => e.type !== "apps")
				.map(async e => ({
					...e,
					packageJson: await CliUtils.parsePackageJson({ dir: e.path }),
				}))
		);

		const packagePrefs = await this.getPackagesPrefs({
			apps,
			packages,
			tags: prefs.tags,
		});

		await this.installPackages({
			apps,
			packages: packagePrefs.selectedPackages,
			directory: prefs.workspace,
			tags: prefs.tags,
		});
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
		if (props.options.dir) {
			try {
				workspace = path.resolve(directory.workspace, props.options.dir);
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

	private static async getPackagesPrefs(props: {
		tags: TAGS[];
		packages: PackageWithJson[];
		apps: PackageWithJson[];
	}) {
		const appTags = new Set<TAGS>(["common", ...props.tags]);

		for (const app of props.apps) {
			const tags = app.packageJson?.startx?.tags;
			if (tags?.length) {
				for (const tag of tags) {
					appTags.add(tag);
				}
			}
		}

		const packageToInstall = props.packages.filter(pkg => {
			if (pkg.type !== "packages") return false;

			const tags = pkg.packageJson?.startx?.tags;
			if (!tags?.length) return true;

			return tags.every(tag => appTags.has(tag));
		});

		let selectedPackages: string[] = [];
		if (packageToInstall.length) {
			selectedPackages = await CommonInquirer.choose({
				message: "Select packages to install",
				options: packageToInstall.map(e => e.name),
				includeAllOption: true,
				mode: "multiple",
				required: false,
			});
		}

		const configPackages = props.packages.filter(e => {
			if (e.type !== "configs") return false;

			const tags = e.packageJson?.startx?.tags;
			if (!tags?.length) return true;

			return tags.every(tag => appTags.has(tag));
		});

		const selectedPackageObjects = packageToInstall.filter(pkg =>
			selectedPackages.includes(pkg.name)
		);

		const requiredPackages = new Set<string>();

		for (const pkg of [...selectedPackageObjects, ...props.apps]) {
			const required = pkg.packageJson?.startx?.required;
			if (required?.length) {
				for (const dep of required) {
					requiredPackages.add(dep);
				}
			}
		}

		const finalSelectedPackages = Array.from(
			new Set([...selectedPackages, ...requiredPackages, ...configPackages.map(e => e.name)])
		).map(e => props.packages.find(p => e === p.name)!);

		if (requiredPackages.size) {
			logger.warn(`Auto-including required packages: ${Array.from(requiredPackages).join(", ")}`);
		}

		return {
			tags: Array.from(appTags),
			selectedPackages: finalSelectedPackages,
		};
	}

	private static async installPackages(props: {
		apps: PackageWithJson[];
		packages: PackageWithJson[];
		directory: string;
		tags: TAGS[];
	}) {
		const firstApp = props.apps[0];
		if (firstApp)
			await fsTool.copyDirectory({
				from: path.join(firstApp.path),
				include: /\.ts$/,
				to: props.directory,
			});
	}
}
