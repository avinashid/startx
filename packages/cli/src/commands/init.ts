import { fsTool } from "@repo/lib/file-system-module";
import { logger } from "@repo/logger";
import { Command } from "commander";
import path from "path";
import z from "zod";

import { FileCheck } from "../configs/files";
import type { StartXPackageJson, TAGS } from "../types";
import { CliUtils, type RawPackageItem } from "../utils/cli-utils";
import { FileHandler } from "../utils/file-handler";
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
		await this.installWorkspace({
			name: prefs.projectName,
			tags: packagePrefs.tags,
			dir: {
				workspace: prefs.workspace,
				template: prefs.template,
			},
		});
		for (const pkg of [...packagePrefs.selectedPackages, ...apps]) {
			let appDeps: Record<string, string> = {};

			if (pkg.type === "apps") {
				const packages = packagePrefs.selectedPackages.filter(e =>
					pkg.packageJson?.startx?.tags?.every(t => e.packageJson?.startx?.tags?.includes(t))
				);

				appDeps = Object.fromEntries(
					packages
						.map(e => e.packageJson?.name)
						.filter((name): name is string => !!name)
						.map(name => [name, "workspace:^"])
				);
			}
			await this.installPackage({
				packages: pkg,
				directory: {
					workspace: prefs.workspace,
					template: prefs.template,
				},
				tags: packagePrefs.tags,
				dependencies: appDeps,
			});
		}
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
			template: directory.template,
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
			const requiredDeps = pkg.packageJson?.startx?.requiredDeps || [];
			const requiredDevDeps = pkg.packageJson?.startx?.requiredDevDeps || [];
			if (requiredDeps?.length || requiredDevDeps?.length) {
				for (const dep of [...requiredDeps, ...requiredDevDeps]) {
					requiredPackages.add(dep);
					const requiredPackageInfo = props.packages.find(e => e.name === dep);
					if (requiredPackageInfo) {
						requiredPackageInfo.packageJson?.startx?.tags?.forEach(e => appTags.add(e));
					}
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

	private static async installPackage(props: {
		packages: PackageWithJson;
		directory: {
			workspace: string;
			template: string;
		};
		tags: TAGS[];
		dependencies: Record<string, string>;
	}) {
		const { packageJson, isWorkspace } = FileHandler.handlePackageJson({
			app: props.packages.packageJson!,
			tags: props.tags,
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
		props.tags.push("root");
		const rawPackage = await CliUtils.parsePackageJson({ dir: props.dir.template });
		const startXRawPackage = await CliUtils.parsePackageJson({
			dir: props.dir.workspace,
			file: "startx",
		});

		if (!rawPackage) throw new Error("Failed to parse package.json");
		rawPackage.dependencies = startXRawPackage?.dependencies || {};
		rawPackage.devDependencies = startXRawPackage?.devDependencies || {};
		const { packageJson } = FileHandler.handlePackageJson({
			app: rawPackage,
			tags: props.tags,
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
			if (checked && !checked.tags.every(e => props.tags.includes(e))) continue;
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
