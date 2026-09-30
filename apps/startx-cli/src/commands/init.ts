import { fsTool } from "@repo/lib/file-system-module";
import { logger } from "@repo/logger";
import { Command } from "commander";
import fs from "fs/promises";
import os from "os";
import path from "path";
import z from "zod";

import { FileCheck } from "../configs/files";
import type { TAGS } from "../types";
import { CliUtils, type PackageItem } from "../utils/cli-utils";
import { resolvePackageClosure } from "../utils/closure";
import { FileHandler } from "../utils/file-handler";
import { CommonInquirer } from "../utils/inquirer";

type InitOptions = {
	dir?: string;
	force?: boolean;
};

export class InitCommand {
	static command = new Command("init")
		.argument("[projectName]")
		.option("-d, --dir <path>", "workspace directory")
		.option("-f, --force", "delete the contents of a non-empty target directory before scaffolding")
		.action(InitCommand.run.bind(InitCommand));

	private static async run(projectName: string | undefined, options: InitOptions) {
		const packageList = await CliUtils.getPackageList();
		const availableApps = packageList.filter(
			(pkg) => pkg.type === "apps" && pkg.packageJson?.startx?.mode !== "silent",
		);
		const prefs = await this.getPrefs({ projectName, options, projects: availableApps });
		const nonAppPackages = packageList.filter((pkg) => pkg.type !== "apps");

		await this.checkTargetDirectory(prefs.directory.workspace, options.force === true);

		const config = await this.getConfigPrefs({
			selectedApps: prefs.selectedApps,
			packages: nonAppPackages,
		});
		const packagePrefs = await this.getPackagesPrefs({
			selectedPackages: config.selectedConfigs,
			packages: nonAppPackages,
			tags: config.gTags,
		});

		// Installing Workspace
		const workspaceTags = [...packagePrefs.gTags, "runnable"] as TAGS[];
		await this.installWorkspace({
			name: prefs.projectName,
			tags: workspaceTags,
			dir: prefs.directory,
		});

		// Installing Apps
		const allSelectedPackages = [...packagePrefs.selectedPackages, ...prefs.selectedApps];
		await Promise.all(
			allSelectedPackages.map(async (pkg) => {
				const appDeps: Record<string, string> = {};
				const tags = new Set<TAGS>(packagePrefs.gTags);

				if (pkg.packageJson?.startx?.mode === "standalone") {
					tags.add("runnable");
				}

				if (pkg.type === "apps") {
					tags.add("runnable");

					packagePrefs.selectedPackages
						.filter((depPkg) => {
							if (depPkg.type !== "packages") return false;
							if (depPkg.packageJson?.startx?.mode === "standalone") return false;
							const sharesTags = depPkg.packageJson?.startx?.iTags?.every((tag) =>
								pkg.packageJson?.startx?.gTags?.includes(tag),
							);
							return sharesTags;
						})
						.forEach((depPkg) => {
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
			}),
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
			options: props.projects.map((pkg) => pkg.name),
			includeAllOption: true,
			mode: "multiple",
			required: true,
		});

		return {
			projectName,
			directory: { workspace, template: directory.template },
			selectedApps: props.projects.filter((pkg) => selectedAppNames.includes(pkg.name)),
		};
	}

	private static async getConfigPrefs(props: { packages: PackageItem[]; selectedApps: PackageItem[] }) {
		const gTags = new Set<TAGS>(["common", "node"]);
		const configs = new Map<string, PackageItem>();
		// Selected apps globals tags and dependencies resolver
		this.getGlobalTags({ pkgs: props.selectedApps }).forEach((tag) => gTags.add(tag));

		this.getPackageDeps({
			allPkgs: props.packages,
			pkgs: props.selectedApps,
		}).forEach((pkg) => configs.set(pkg.name, pkg));

		const availableConfigs = props.packages.filter((pkg) => {
			if (pkg.type !== "configs") return false;
			if (pkg.packageJson?.startx?.mode === "silent") return false;
			if (configs.has(pkg.name)) return false;
			return pkg.packageJson?.startx?.iTags?.every((t) => gTags.has(t)) ?? true;
		});
		if (availableConfigs.length > 0) {
			const rawSelectedConfigs = await CommonInquirer.choose({
				message: "Select configs to install",
				options: availableConfigs.map((pkg) => pkg.name),
				includeAllOption: true,
				mode: "multiple",
				required: false,
			});
			availableConfigs
				.filter((pkg) => rawSelectedConfigs.includes(pkg.name))
				.forEach((pkg) => configs.set(pkg.name, pkg));
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
		}).forEach((pkg) => configs.set(pkg.name, pkg));

		// Adding global tags
		this.getGlobalTags({ pkgs: Array.from(configs.values()) }).forEach((tag) => gTags.add(tag));

		return {
			gTags: Array.from(gTags),
			selectedConfigs: Array.from(configs.values()),
		};
	}

	private static async getPackagesPrefs(props: {
		tags: TAGS[];
		packages: PackageItem[];
		selectedPackages: PackageItem[];
	}) {
		const gTags = new Set<TAGS>(props.tags);
		const packages = new Map<string, PackageItem>(props.selectedPackages.map((pkg) => [pkg.name, pkg]));
		const availablePackages = props.packages.filter((pkg) => {
			if (pkg.type !== "packages") return false;
			if (pkg.packageJson?.startx?.mode === "silent") return false;
			if (packages.has(pkg.name)) return false;
			return pkg.packageJson?.startx?.iTags?.every((t) => gTags.has(t)) ?? false;
		});
		if (availablePackages.length > 0) {
			const rawSelectedPackages = await CommonInquirer.choose({
				message: "Select packages to install",
				options: availablePackages.map((pkg) => pkg.name),
				includeAllOption: true,
				mode: "multiple",
				required: false,
			});

			availablePackages
				.filter((pkg) => rawSelectedPackages.includes(pkg.name))
				.forEach((pkg) => packages.set(pkg.name, pkg));
		}

		this.getPackageDeps({
			allPkgs: props.packages,
			pkgs: Array.from(packages.values()),
		}).forEach((pkg) => packages.set(pkg.name, pkg));

		this.getGlobalTags({
			pkgs: Array.from(packages.values()),
		}).forEach((tag) => gTags.add(tag));

		return {
			gTags: Array.from(gTags),
			selectedPackages: Array.from(packages.values()),
		};
	}

	private static async installPackage(props: {
		pkg: PackageItem;
		packageName?: string;
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
			name: props.packageName || props.pkg.packageJson.name || props.pkg.name,
			dependencies: props.dependencies,
		});

		if (isWorkspace) {
			throw new Error(`Cannot install workspace as a package: ${props.pkg.name}`);
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
			new Set(["root", ...props.tags] as TAGS[]),
		);
		await this.writeVscodeSettings({
			workspace: props.dir.workspace,
			tags: props.tags,
		});
	}

	private static async writeVscodeSettings(props: { workspace: string; tags: TAGS[] }) {
		const usesBiome = props.tags.includes("biome");
		const usesPrettier = props.tags.includes("prettier");
		const usesFormatter = usesBiome || usesPrettier;
		const vscodeDir = path.join(props.workspace, ".vscode");

		const settings: Record<string, unknown> = {
			...(usesFormatter
				? {
						"editor.formatOnSave": true,
						"editor.defaultFormatter": usesBiome ? "biomejs.biome" : "esbenp.prettier-vscode",
					}
				: {}),
			"editor.codeActionsOnSave": {
				...(usesBiome
					? {
							"source.organizeImports.biome": "explicit",
							"source.fixAll.biome": "explicit",
						}
					: {}),
				"source.fixAll.eslint": "explicit",
				"source.fixAll": "explicit",
			},
			"eslint.workingDirectories": [{ mode: "auto" }],
		};

		const extensions = {
			recommendations: [
				"dbaeumer.vscode-eslint",
				...(usesBiome ? ["biomejs.biome"] : usesPrettier ? ["esbenp.prettier-vscode"] : []),
			],
		};

		await Promise.all([
			fsTool.writeJSONFile({ dir: vscodeDir, file: "settings", content: settings }),
			fsTool.writeJSONFile({ dir: vscodeDir, file: "extensions", content: extensions }),
		]);
	}

	private static async checkTargetDirectory(workspace: string, force = false) {
		if (!(await this.pathExists(workspace))) return;

		// Read the directory raw: listFiles/listDirectories filter on isFile()/isDirectory(),
		// so symlinks, fifos and sockets are invisible to them — they would be miscounted,
		// left behind by --force, and could make a non-empty directory look empty.
		const entries = await fs.readdir(workspace);
		if (entries.length === 0) return;

		const entryCount = entries.length;

		if (!force) {
			// Default behaviour is a merge: the new workspace is written on top of what is
			// already there. Nothing is deleted, so the prompt must not promise an overwrite.
			const proceed = await CommonInquirer.confirm({
				message:
					`Directory "${workspace}" already exists and is not empty (${entryCount} entries). ` +
					`Merge the new workspace into it? Files with the same path are overwritten, everything else is kept ` +
					`(re-run with --force to clear the directory first).`,
				default: false,
			});
			if (!proceed) {
				throw new Error("Aborted: target directory already exists.");
			}
			return;
		}

		// Guard the REAL directory: `workspace` may be a symlink, and fs.rm below follows it.
		const target = await this.assertSafeToClear(workspace);

		try {
			await fs.access(target, fs.constants.W_OK);
		} catch {
			throw new Error(`Refusing to clear "${target}" — it is not writable, so the clear would fail part-way.`);
		}

		const confirmed = await CommonInquirer.confirm({
			message:
				`--force: PERMANENTLY DELETE all ${entryCount} entries inside "${target}" before scaffolding? ` +
				`This cannot be undone.`,
			default: false,
		});
		if (!confirmed) {
			throw new Error("Aborted: target directory already exists.");
		}

		// Never abort mid-clear: a thrown rm would leave a half-destroyed directory and no
		// workspace. Collect failures, keep going, and report exactly what survived.
		const failed: string[] = [];
		for (const entry of entries) {
			await fs.rm(path.join(target, entry), { recursive: true, force: true }).catch((error: unknown) => {
				failed.push(`${entry} (${error instanceof Error ? error.message : String(error)})`);
			});
		}

		logger.warn(`Cleared ${entryCount - failed.length} of ${entryCount} entries from ${target}.`);
		if (failed.length > 0) {
			logger.warn(`Could not remove ${failed.length} entr${failed.length === 1 ? "y" : "ies"}; scaffolding anyway:`);
			for (const entry of failed) logger.warn(`  - ${entry}`);
		}
	}

	/** Resolves symlinks and refuses anything that is not safely disposable. Returns the real path. */
	private static async assertSafeToClear(workspace: string) {
		// path.resolve is lexical and does NOT dereference symlinks, but fs.rm does — so a
		// symlink pointing at $HOME would sail through a lexical check and then be emptied.
		const realPath = async (target: string) => await fs.realpath(target).catch(() => path.resolve(target));
		const resolved = await realPath(workspace);
		const cwd = await realPath(process.cwd());
		const refuse = (why: string) => {
			throw new Error(`Refusing to clear "${resolved}" — ${why}.`);
		};

		const exact = new Set(
			await Promise.all(
				[
					path.parse(resolved).root,
					os.homedir(),
					os.tmpdir(),
					process.cwd(),
					...[
						"etc",
						"usr",
						"var",
						"bin",
						"sbin",
						"lib",
						"opt",
						"boot",
						"dev",
						"proc",
						"sys",
						"root",
						"home",
						"Users",
					].map((dir) => path.join(path.parse(resolved).root, dir)),
					...["Documents", "Desktop", "Downloads", "Pictures", "Music", "Movies", "Videos", "Public", "Library"].map(
						(dir) => path.join(os.homedir(), dir),
					),
				].map(realPath),
			),
		);

		if (exact.has(resolved)) {
			refuse("it is a filesystem root, a system directory, your home directory or a well-known directory inside it");
		}

		// Any ancestor of the cwd — covers "." , ".." , "../.." and any absolute parent.
		const toCwd = path.relative(resolved, cwd);
		if (toCwd === "" || (!toCwd.startsWith("..") && !path.isAbsolute(toCwd))) {
			refuse("it is the current directory or one of its ancestors");
		}

		return resolved;
	}

	private static async pathExists(target: string) {
		try {
			await fs.access(target);
			return true;
		} catch {
			return false;
		}
	}

	// Helpers
	private static getPackageDeps(props: { pkgs: PackageItem[]; allPkgs: PackageItem[] }) {
		// Full BFS closure (shared with `startx package add`), then drop the seeds themselves
		// so callers keep getting only the newly required packages back.
		const seeded = new Set(props.pkgs.map((pkg) => pkg.name));
		return resolvePackageClosure({ packages: props.allPkgs, seeds: props.pkgs }).filter((pkg) => !seeded.has(pkg.name));
	}
	private static getGlobalTags(props: { pkgs: PackageItem[]; gTags?: TAGS[] }) {
		const tags = new Set<TAGS>(props.gTags || []);
		props.pkgs.forEach((pkg) => {
			pkg.packageJson?.startx?.gTags?.forEach((tag) => tags.add(tag));
		});
		return Array.from(tags);
	}
	private static async copyValidatedFilesFromFolder(source: string, destination: string, tags: Set<TAGS>) {
		const files = await fsTool.listFiles({ dir: source }).catch(() => []);
		for (const file of files) {
			const checked = FileCheck[file];
			if (checked && !checked.tags.every((tag) => tags.has(tag))) continue;
			const destFileName = file === "_gitignore" ? ".gitignore" : file;
			try {
				await fsTool.copyFile({
					from: path.join(source, file),
					to: path.join(destination, destFileName),
				});
			} catch (error) {
				logger.error(`Failed to copy file ${file}:`, error);
			}
		}
	}
}
