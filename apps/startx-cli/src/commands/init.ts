import { fsTool } from "@repo/lib/file-system-module";
import { logger } from "@repo/logger";
import { Command } from "commander";
import path from "path";
import z from "zod";

import { FileCheck } from "../configs/files";
import type { StartXPackageJson, TAGS } from "../types";
import { CliUtils } from "../utils/cli-utils";
import { FileHandler } from "../utils/file-handler";
import { CommonInquirer } from "../utils/inquirer";

type InitOptions = {
	dir?: string;
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
		.action(InitCommand.run.bind(InitCommand));

	private static async run(projectName: string | undefined, options: InitOptions) {
		const packageList: PackageWithJson[] = await Promise.all(
			(await CliUtils.getPackageList()).map(async e => ({
				...e,
				packageJson: await CliUtils.parsePackageJson({ dir: e.path }),
			}))
		);

		const prefs = await InitCommand.getPrefs({
			projectName,
			options,
			projects: packageList.filter(e => {
				if (e.type !== "apps") return false;
				if (e.packageJson?.startx?.mode === "silent") return false;
				return true;
			}),
		});

		const packages = await Promise.all(
			packageList
				.filter(e => e.type !== "apps")
				.map(async e => ({
					...e,
					packageJson: await CliUtils.parsePackageJson({ dir: e.path }),
				}))
		);

		const config = await this.getConfigPrefs({
			selectedApps: prefs.selectedApps,
			packages,
		});

		const packagePrefs = await this.getPackagesPrefs({
			selectedApps: prefs.selectedApps,
			selectedPackages: config.selectedConfigs,
			packages,
			tags: config.tags,
		});
		await this.installWorkspace({
			name: prefs.projectName,
			tags: [...packagePrefs.tags, "runnable"],
			dir: {
				workspace: prefs.directory.workspace,
				template: prefs.directory.template,
			},
		});

		await Promise.all(
			packagePrefs.selectedPackages.concat(prefs.selectedApps).map(async pkg => {
				const appDeps = new Map<string, string>();
				const tags = new Set(packagePrefs.tags);

				if (pkg.packageJson?.startx?.mode === "standalone") tags.add("runnable");

				if (pkg.type === "apps") {
					tags.add("runnable");

					packagePrefs.selectedPackages
						.filter(
							e =>
								e.packageJson?.startx?.mode !== "standalone" &&
								e.packageJson?.startx?.iTags?.every(tag =>
									pkg.packageJson?.startx?.tags?.includes(tag)
								)
						)
						.forEach(e => appDeps.set(e.packageJson?.name || e.name, "workspace:^"));
				}

				await this.installPackage({
					packages: pkg,
					directory: {
						workspace: prefs.directory.workspace,
						template: prefs.directory.template,
					},
					tags: Array.from(tags),
					dependencies: Object.fromEntries(appDeps),
				});
			})
		);
	}

	private static async getPrefs(props: {
		projectName?: string;
		directory?: string;
		options: InitOptions;
		projects: PackageWithJson[];
	}) {
		if (!props.projectName) {
			props.projectName = await CommonInquirer.getText({
				message: "Project name",
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

		const selectedApps = props.projects.filter(e => selectedAppNames.includes(e.name));

		return {
			projectName: props.projectName,
			directory: {
				workspace,
				template: directory.template,
			},
			selectedApps,
		};
	}

	private static async getConfigPrefs(props: {
		packages: PackageWithJson[];
		selectedApps: PackageWithJson[];
	}) {
		const tags = new Set<TAGS>(["common"]);
		const configs = new Map<string, PackageWithJson>();
		// Add additional tags from apps
		props.selectedApps
			.flatMap(app => app.packageJson?.startx?.gTags || [])
			.forEach(tag => tags.add(tag));

		// Add required configs from apps
		props.selectedApps
			.flatMap(app => [
				...(app.packageJson?.startx?.requiredDeps || []),
				...(app.packageJson?.startx?.requiredDevDeps || []),
			])
			.forEach(pkg => {
				const config = props.packages.find(e => e.packageJson?.name === pkg);
				if (config) configs.set(config.name, config);
			});

		const availableConfigs = props.packages.filter(e => {
			if (e.type !== "configs") return false;
			if (e.packageJson?.startx?.mode === "silent") {
				return false;
			}
			if (configs.has(e.name)) return false;
			if (!e.packageJson?.startx?.iTags?.every(t => tags.has(t))) return false;
			return true;
		});

		if (availableConfigs.length === 0)
			return {
				tags: Array.from(tags),
				selectedConfigs: Array.from(configs.values()),
			};

		const rawSelectedConfigs = await CommonInquirer.choose({
			message: "Select configs to install",
			options: availableConfigs.map(e => e.name),
			includeAllOption: true,
			mode: "multiple",
			required: false,
		});

		availableConfigs
			.filter(e => rawSelectedConfigs.includes(e.name))
			.forEach(e => configs.set(e.name, e));

		if (tags.has("node")) {
			const formatter: string | string[] = await CommonInquirer.choose({
				message: "Select formatter",
				options: ["prettier + biome", "prettier"],
				mode: "single",
				default: "prettier",
				required: true,
			});
			if (formatter === "prettier") {
				tags.add("prettier");
			} else {
				tags.add("biome");
				tags.add("prettier");
			}
		}

		// Include required configs
		Array.from(configs.values()).forEach(e => {
			const requiredDeps = e.packageJson?.startx?.requiredDeps || [];
			const requiredDevDeps = e.packageJson?.startx?.requiredDevDeps || [];

			const required = [...requiredDeps, ...requiredDevDeps];
			required.forEach(pkg => {
				const config = props.packages.find(e => e.packageJson?.name === pkg);
				if (config) {
					configs.set(config.name, config);
				}
			});
		});

		// Include all tags
		Array.from(configs.values()).forEach(e => {
			const gTags = e.packageJson?.startx?.gTags || [];
			gTags.forEach(tag => tags.add(tag));
		});

		return {
			tags: Array.from(tags),
			selectedConfigs: Array.from(configs.values()),
		};
	}

	private static async getPackagesPrefs(props: {
		tags: TAGS[];
		packages: PackageWithJson[];
		selectedApps: PackageWithJson[];
		selectedPackages: PackageWithJson[];
	}) {
		const appTags = new Set<TAGS>(props.tags);
		const packages = new Map<string, PackageWithJson>(props.selectedPackages.map(e => [e.name, e]));
		const availablePackages = props.packages.filter(pkg => {
			if (pkg.type !== "packages") return false;
			if (pkg.packageJson?.startx?.mode === "silent") {
				return false;
			}
			if (packages.has(pkg.name)) return false;
			if (!pkg.packageJson?.startx?.iTags?.every(t => appTags.has(t))) return false;
			return true;
		});
		if (!availablePackages.length)
			return {
				selectedPackages: Array.from(packages.values()),
				tags: Array.from(appTags),
			};
		const rawSelectedPackages = await CommonInquirer.choose({
			message: "Select packages to install",
			options: availablePackages.map(e => e.name),
			includeAllOption: true,
			mode: "multiple",
			required: false,
		});

		availablePackages
			.filter(e => rawSelectedPackages.includes(e.name))
			.forEach(e => packages.set(e.name, e));

		Array.from(packages.values()).forEach(e => {
			const requiredDeps = e.packageJson?.startx?.requiredDeps || [];
			const requiredDevDeps = e.packageJson?.startx?.requiredDevDeps || [];

			const required = [...requiredDeps, ...requiredDevDeps];
			required.forEach(tag => {
				const config = props.packages.find(e => e.packageJson?.name === tag);
				if (config) {
					packages.set(config.name, config);
				}
			});
		});

		// Include all tags
		Array.from(packages.values()).forEach(e => {
			const gTags = e.packageJson?.startx?.gTags || [];
			gTags.forEach(tag => appTags.add(tag));
		});

		return {
			tags: Array.from(appTags),
			selectedPackages: Array.from(packages.values()),
		};
	}

	private static async installPackage(props: {
		packages: PackageWithJson;
		directory: {
			workspace: string;
			template: string;
		};
		tags: TAGS[];
		dependencies: Record<string, string>;
	}) {
		const tags = new Set(props.tags.concat(props.packages.packageJson?.startx?.tags || []));
		const { packageJson, isWorkspace } = FileHandler.handlePackageJson({
			app: props.packages.packageJson!,
			tags: Array.from(tags),
			name: props.packages.name,
		});

		if (isWorkspace) throw new Error("Can't install workspace as package.");

		let iDirectory = path.join(props.directory.workspace, props.packages.type);
		let iTemplate = path.join(props.directory.template, props.packages.type);
		if (props.packages.packageJson?.name?.startsWith("@repo")) {
			const repoName = props.packages.packageJson.name.split("/")[1];
			iDirectory = path.join(iDirectory, "@repo", repoName);
			iTemplate = path.join(iTemplate, "@repo", repoName);
		} else {
			iDirectory = path.join(iDirectory, props.packages.name);
			iTemplate = path.join(iTemplate, props.packages.name);
		}

		await fsTool.writeJSONFile({
			dir: iDirectory,
			file: "package",
			content: packageJson,
		});

		const files = await fsTool.listFiles({ dir: iTemplate });
		for (const file of files) {
			const checked = FileCheck[file];
			if (checked && !checked.tags.every(e => props.tags.includes(e))) continue;
			try {
				await fsTool.copyFile({
					from: path.join(iTemplate, file),
					to: path.join(iDirectory, file),
				});
			} catch (error) {
				logger.error(`Failed to copy file ${file}:`, error);
			}
		}

		// Installing src
		await fsTool.copyDirectory({
			from: path.join(iTemplate, "src"),
			to: path.join(iDirectory, "src"),
			exclude: !props.tags.includes("vitest") ? /\.test\.tsx?$/ : undefined,
		});
		logger.info(`Successfully installed ${props.packages.name}`);
	}

	private static async installWorkspace(props: {
		name: string;
		tags: TAGS[];
		dir: {
			workspace: string;
			template: string;
		};
	}) {
		const rootTags = ["root", ...props.tags] as TAGS[];
		const rawPackage = await CliUtils.parsePackageJson({ dir: props.dir.template });
		const startXRawPackage = await CliUtils.parsePackageJson({
			dir: props.dir.template,
			file: "startx",
		});

		if (!rawPackage) throw new Error("Failed to parse package.json");
		rawPackage.dependencies = startXRawPackage?.dependencies || {};
		rawPackage.devDependencies = startXRawPackage?.devDependencies || {};
		const { packageJson } = FileHandler.handlePackageJson({
			app: rawPackage,
			tags: rootTags,
			name: props.name,
		});

		await fsTool.writeJSONFile({
			dir: props.dir.workspace,
			file: "package",
			content: packageJson,
		});

		const files = await fsTool.listFiles({ dir: props.dir.template });
		for (const file of files) {
			const checked = FileCheck[file];
			if (checked && !checked.tags.every(e => rootTags.includes(e))) continue;
			try {
				await fsTool.copyFile({
					from: path.join(props.dir.template, file),
					to: path.join(props.dir.workspace, file),
				});
			} catch (error) {
				logger.error(`Failed to copy file ${file}:`, error);
			}
		}
	}
}
