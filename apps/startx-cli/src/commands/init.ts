import { fsTool } from "@repo/lib/file-system-module";
import { logger } from "@repo/logger";
import { Command } from "commander";
import path from "path";
import z from "zod";

import { FileCheck } from "../configs/files";
import type { TAGS } from "../types";
import { CliUtils, type PackageItem } from "../utils/cli-utils";
import { FileHandler } from "../utils/file-handler";
import { CommonInquirer } from "../utils/inquirer";

type InitOptions = {
	dir?: string;
};

export class InitCommand {
	static command = new Command("init")
		.argument("[projectName]")
		.option("-d, --dir <path>", "workspace directory")
		.action(InitCommand.run.bind(InitCommand));

	private static async run(projectName: string | undefined, options: InitOptions) {
		const packageList = await CliUtils.getPackageList();
		const availableApps = packageList.filter(pkg => pkg.type === "apps" && pkg.packageJson?.startx?.mode !== "silent");
		const prefs = await this.getPrefs({ projectName, options, projects: availableApps });
		const nonAppPackages = packageList.filter(pkg => pkg.type !== "apps");

		const config = await this.getConfigPrefs({
			selectedApps: prefs.selectedApps,
			packages: nonAppPackages,
		});

		const packagePrefs = await this.getPackagesPrefs({
			selectedApps: prefs.selectedApps,
			selectedPackages: config.selectedConfigs,
			packages: nonAppPackages,
			tags: config.gTags,
		});

		// Installing Workspace
		const workspaceTags = [...packagePrefs.gTags, "runnable"] as TAGS[];
		await this.installWorkspace({
			name: prefs.projectName,
			tags: [...workspaceTags, "runnable"],
			dir: prefs.directory,
		});

		// Installing Apps
		const allSelectedPackages = [...packagePrefs.selectedPackages, ...prefs.selectedApps];
		await Promise.all(
			allSelectedPackages.map(async pkg => {
				const appDeps: Record<string, string> = {};
				const tags = new Set<TAGS>(packagePrefs.gTags);

				if (pkg.packageJson?.startx?.mode === "standalone") {
					tags.add("runnable");
				}

				if (pkg.type === "apps") {
					tags.add("runnable");

					packagePrefs.selectedPackages
						.filter(depPkg => {
							if (depPkg.type !== "packages") return false;
							if (depPkg.packageJson?.startx?.mode !== "standalone") return false;
							const sharesTags = depPkg.packageJson?.startx?.iTags?.every(tag =>
								pkg.packageJson?.startx?.gTags?.includes(tag)
							);
							return sharesTags;
						})
						.forEach(depPkg => {
							const depName = depPkg.packageJson?.name || depPkg.name;
							appDeps[depName] = "workspace:^";
						});
				}

				await this.installPackage({
					pkg,
					directory: prefs.directory,
					tags: Array.from(tags),
					dependencies: appDeps,
				});
			})
		);
	}

	private static async getPrefs(props: {
		projectName?: string;
		directory?: string;
		options: InitOptions;
		projects: PackageItem[];
	}) {
		const projectName = await CommonInquirer.getText({
			message: "Project name",
			name: "projectName",
			default: props.projectName,
			schema: z
				.string()
				.min(1, "Package name is required")
				.max(214, "Package name too long")
				.regex(/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/, "Invalid package name"),
		});
		if (props.projects.length === 0) {
			throw new Error("No apps found to install.");
		}
		const directory = CliUtils.getDirectory();
		const workspace = props.options.dir
			? path.resolve(directory.workspace, props.options.dir)
			: path.join(directory.workspace, projectName);

		const selectedAppNames = await CommonInquirer.choose({
			message: "Select apps to install",
			options: props.projects.map(pkg => pkg.name),
			includeAllOption: true,
			mode: "multiple",
			required: true,
		});

		return {
			projectName,
			directory: { workspace, template: directory.template },
			selectedApps: props.projects.filter(pkg => selectedAppNames.includes(pkg.name)),
		};
	}

	private static async getConfigPrefs(props: { packages: PackageItem[]; selectedApps: PackageItem[] }) {
		const gTags = new Set<TAGS>(["common"]);
		const configs = new Map<string, PackageItem>();
		// Selected apps globals tags and dependencies resolver
		this.getGlobalTags({ pkgs: props.selectedApps }).forEach(tag => gTags.add(tag));
		this.getPackageDeps({
			allPkgs: props.packages,
			pkgs: props.selectedApps,
		}).forEach(pkg => configs.set(pkg.name, pkg));

		const availableConfigs = props.packages.filter(pkg => {
			if (pkg.type !== "configs") return false;
			if (pkg.packageJson?.startx?.mode === "silent") return false;
			if (configs.has(pkg.name)) return false;
			return pkg.packageJson?.startx?.iTags?.every(t => gTags.has(t)) ?? true;
		});
		if (availableConfigs.length > 0) {
			const rawSelectedConfigs = await CommonInquirer.choose({
				message: "Select configs to install",
				options: availableConfigs.map(pkg => pkg.name),
				includeAllOption: true,
				mode: "multiple",
				required: false,
			});
			availableConfigs.filter(pkg => rawSelectedConfigs.includes(pkg.name)).forEach(pkg => configs.set(pkg.name, pkg));
		}

		if (gTags.has("node")) {
			const formatter: string | string[] = await CommonInquirer.choose({
				message: "Select formatter",
				options: ["prettier + biome", "prettier"],
				mode: "single",
				default: "prettier",
				required: true,
			});
			if (formatter === "prettier") {
				gTags.add("prettier");
			} else {
				gTags.add("biome");
				gTags.add("prettier");
			}
		}

		// Resolving deps for selected configs
		this.getPackageDeps({
			allPkgs: props.packages,
			pkgs: Array.from(configs.values()),
		}).forEach(pkg => configs.set(pkg.name, pkg));

		// Adding global tags
		this.getGlobalTags({ pkgs: Array.from(configs.values()) }).forEach(tag => gTags.add(tag));

		return {
			gTags: Array.from(gTags),
			selectedConfigs: Array.from(configs.values()),
		};
	}

	private static async getPackagesPrefs(props: {
		tags: TAGS[];
		packages: PackageItem[];
		selectedApps: PackageItem[];
		selectedPackages: PackageItem[];
	}) {
		const gTags = new Set<TAGS>(props.tags);
		const packages = new Map<string, PackageItem>(props.selectedPackages.map(pkg => [pkg.name, pkg]));
		const availablePackages = props.packages.filter(pkg => {
			if (pkg.type !== "packages") return false;
			if (pkg.packageJson?.startx?.mode === "silent") return false;
			if (packages.has(pkg.name)) return false;
			return pkg.packageJson?.startx?.iTags?.every(t => gTags.has(t)) ?? false;
		});
		if (availablePackages.length > 0) {
			const rawSelectedPackages = await CommonInquirer.choose({
				message: "Select packages to install",
				options: availablePackages.map(pkg => pkg.name),
				includeAllOption: true,
				mode: "multiple",
				required: false,
			});

			availablePackages
				.filter(pkg => rawSelectedPackages.includes(pkg.name))
				.forEach(pkg => packages.set(pkg.name, pkg));
		}

		this.getPackageDeps({
			allPkgs: props.packages,
			pkgs: Array.from(packages.values()),
		}).forEach(pkg => packages.set(pkg.name, pkg));

		this.getGlobalTags({
			pkgs: Array.from(packages.values()),
		}).forEach(tag => gTags.add(tag));

		return {
			gTags: Array.from(gTags),
			selectedPackages: Array.from(packages.values()),
		};
	}

	private static async installPackage(props: {
		pkg: PackageItem;
		directory: {
			workspace: string;
			template: string;
		};
		tags: TAGS[];
		dependencies: Record<string, string>;
	}) {
		if (!props.pkg.packageJson) {
			throw new Error(`Missing package.json for ${props.pkg.name}`);
		}
		const tags = new Set<TAGS>([...props.tags, ...(props.pkg.packageJson.startx?.tags || [])]);
		const ignoreList = props.pkg.packageJson.startx?.ignore || [];
		if (ignoreList.includes("eslint-config")) tags.delete("eslint");
		if (ignoreList.includes("vitest-config")) tags.delete("vitest");
		const { packageJson, isWorkspace } = FileHandler.handlePackageJson({
			app: props.pkg.packageJson,
			tags: Array.from(tags),
			name: props.pkg.name,
		});

		if (isWorkspace) {
			throw new Error(`Cannot install workspace as a package: ${props.pkg.name}`);
		}
		if (Object.keys(props.dependencies).length > 0) {
			packageJson.dependencies = {
				...(packageJson.dependencies as object),
				...props.dependencies,
			};
		}

		const iDirectory = path.join(props.directory.workspace, props.pkg.relativePath);
		const iTemplate = path.join(props.pkg.path);
		await fsTool.writeJSONFile({ dir: iDirectory, file: "package", content: packageJson });

		await this.copyValidatedFilesFromFolder(iTemplate, iDirectory, tags);
		await fsTool.copyDirectory({
			from: path.join(iTemplate, "src"),
			to: path.join(iDirectory, "src"),
			exclude: !tags.has("vitest") ? /\.test\.tsx?$/ : undefined,
		});

		logger.info(`Successfully installed ${props.pkg.name}`);
	}

	private static async installWorkspace(props: {
		name: string;
		tags: TAGS[];
		dir: {
			workspace: string;
			template: string;
		};
	}) {
		const rawPackage = await CliUtils.parsePackageJson({ dir: props.dir.template });
		const startXRawPackage = await CliUtils.parsePackageJson({
			dir: props.dir.template,
			file: "startx",
		});

		if (!rawPackage) throw new Error("Failed to parse root package.json");
		rawPackage.dependencies = { ...rawPackage.dependencies, ...(startXRawPackage?.dependencies || {}) };
		rawPackage.devDependencies = { ...rawPackage.devDependencies, ...(startXRawPackage?.devDependencies || {}) };

		const { packageJson } = FileHandler.handlePackageJson({
			app: rawPackage,
			tags: ["root", ...props.tags] as TAGS[],
			name: props.name,
		});

		await fsTool.writeJSONFile({
			dir: props.dir.workspace,
			file: "package",
			content: packageJson,
		});
		await this.copyValidatedFilesFromFolder(
			props.dir.template,
			props.dir.workspace,
			new Set(["root", ...props.tags] as TAGS[])
		);
	}

	// Helpers
	private static getPackageDeps(props: { pkgs: PackageItem[]; allPkgs: PackageItem[] }) {
		const deps = new Map<string, PackageItem>(props.pkgs.map(pkg => [pkg.name, pkg]));
		Array.from(deps.values()).forEach(pkg => {
			const required = [
				...(pkg.packageJson?.startx?.requiredDeps || []),
				...(pkg.packageJson?.startx?.requiredDevDeps || []),
			];
			required.forEach(reqPkgName => {
				const config = props.allPkgs.find(p => p.packageJson?.name === reqPkgName);
				if (config) deps.set(config.name, config);
			});
		});
		return Array.from(deps.values());
	}
	private static getGlobalTags(props: { pkgs: PackageItem[]; gTags?: TAGS[] }) {
		const tags = new Set<TAGS>(props.gTags || []);
		props.pkgs.forEach(pkg => {
			pkg.packageJson?.startx?.gTags?.forEach(tag => tags.add(tag));
		});
		return Array.from(tags);
	}
	private static async copyValidatedFilesFromFolder(source: string, destination: string, tags: Set<TAGS>) {
		const files = await fsTool.listFiles({ dir: source }).catch(() => []);
		for (const file of files) {
			const checked = FileCheck[file];
			if (checked && !checked.tags.every(tag => tags.has(tag))) continue;
			try {
				await fsTool.copyFile({
					from: path.join(source, file),
					to: path.join(destination, file),
				});
			} catch (error) {
				logger.error(`Failed to copy file ${file}:`, error);
			}
		}
	}
}
