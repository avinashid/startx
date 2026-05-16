import { fsTool } from "@repo/lib/file-system-module";
import { logger } from "@repo/logger";
import { spawn } from "child_process";
import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import z from "zod";

import { FileCheck } from "../configs/files";
import type { StartXPackageJson, TAGS } from "../types";
import { CliUtils, type PackageItem } from "../utils/cli-utils";
import { FileHandler } from "../utils/file-handler";
import { CommonInquirer } from "../utils/inquirer";

type PackageOptions = {
	eslint?: boolean;
	install?: boolean;
};

type NewPackageOptions = PackageOptions & {
	dir?: string;
};

const packageNameSchema = z
	.string()
	.min(1, "Package name is required")
	.max(214, "Package name too long")
	.regex(/^(?:@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/, "Invalid package name");

export class PackageCommand {
	static command = new Command("package")
		.alias("pkg")
		.description("List and add packages in the current monorepo.")
		.addCommand(
			new Command("list")
				.alias("ls")
				.description("List packages available from the StartX template.")
				.action(PackageCommand.list.bind(PackageCommand))
		)
		.addCommand(
			new Command("add")
				.description("Add an existing StartX package by name.")
				.argument("[packageName]")
				.option("--eslint", "enable ESLint support for the added package")
				.option("--no-eslint", "skip ESLint support for the added package")
				.option("--no-install", "do not run the package manager after updating ESLint")
				.action(PackageCommand.add.bind(PackageCommand))
		)
		.addCommand(
			new Command("new")
				.alias("create")
				.description("Create a new package from scratch.")
				.argument("[packageName]")
				.option("-d, --dir <path>", "package directory relative to the current workspace")
				.option("--eslint", "enable ESLint support for the new package")
				.option("--no-eslint", "skip ESLint support for the new package")
				.option("--no-install", "do not run the package manager after updating ESLint")
				.action(PackageCommand.create.bind(PackageCommand))
		);

	private static async list() {
		const packages = await CliUtils.getPackageList();
		const byType = new Map<PackageItem["type"], PackageItem[]>();

		for (const pkg of packages) {
			const list = byType.get(pkg.type) ?? [];
			list.push(pkg);
			byType.set(pkg.type, list);
		}

		for (const type of ["apps", "packages", "configs"] as const) {
			const entries = byType.get(type) ?? [];
			if (entries.length === 0) continue;

			logger.info(`${type}:`);
			for (const pkg of entries.sort((a, b) => a.name.localeCompare(b.name))) {
				logger.info(`  ${pkg.name} (${pkg.relativePath})`);
			}
		}
	}

	private static async add(packageName: string | undefined, options: PackageOptions) {
		const packages = await CliUtils.getPackageList();
		const availablePackages = packages.filter(pkg => pkg.packageJson?.startx?.mode !== "silent");
		const selectedName =
			packageName ??
			(await CommonInquirer.choose({
				message: "Select package to add",
				options: availablePackages.map(pkg => pkg.name),
				mode: "single",
				required: true,
			}));

		const selectedPackage = this.findPackage(packages, selectedName);
		if (!selectedPackage) {
			throw new Error(`Package "${selectedName}" was not found in the StartX template.`);
		}

		const directory = CliUtils.getDirectory();
		const eslintEnabled = await this.resolveEslintPreference(options);
		const packagesToInstall = this.resolvePackageClosure({
			packages,
			selectedPackage,
			includeEslintConfig: eslintEnabled,
		});
		const tags = await this.getInstallTags({
			workspace: directory.workspace,
			packages: packagesToInstall,
			eslintEnabled,
		});

		for (const pkg of packagesToInstall) {
			await this.installTemplatePackage({
				pkg,
				directory,
				tags,
			});
		}

		logger.info(`Package add complete: ${selectedPackage.name}`);
	}

	private static async create(packageName: string | undefined, options: NewPackageOptions) {
		const name = await CommonInquirer.getText({
			message: "Package name",
			name: "packageName",
			default: packageName,
			schema: packageNameSchema,
		});
		const directory = CliUtils.getDirectory();
		const packageDir = options.dir
			? path.resolve(directory.workspace, options.dir)
			: path.resolve(directory.workspace, this.getDefaultPackagePath(name));

		if (await this.pathExists(packageDir)) {
			throw new Error(`Package directory already exists: ${packageDir}`);
		}

		const eslintEnabled = await this.resolveEslintPreference(options);
		const packages = await CliUtils.getPackageList();
		await this.ensureTemplatePackage({
			packages,
			name: "typescript-config",
			directory,
			tags: ["common", "node"],
		});

		if (eslintEnabled) {
			await this.ensureTemplatePackage({
				packages,
				name: "eslint-config",
				directory,
				tags: ["common", "node", "eslint"],
			});
		}

		await fs.mkdir(path.join(packageDir, "src"), { recursive: true });
		await this.writeJson(path.join(packageDir, "package.json"), this.createPackageJson({ name, eslintEnabled }));
		await fs.writeFile(
			path.join(packageDir, "tsconfig.json"),
			`${JSON.stringify(
				{
					extends: "typescript-config/tsconfig.node.json",
					compilerOptions: {
						moduleResolution: "bundler",
						module: "esnext",
						target: "es2022",
					},
					include: ["src/**/*.ts"],
				},
				null,
				2
			)}\n`
		);
		await fs.writeFile(path.join(packageDir, "src", "index.ts"), "export {};\n");

		if (eslintEnabled) {
			await fs.writeFile(
				path.join(packageDir, "eslint.config.ts"),
				`import { baseConfig } from "eslint-config/base";\nimport { extend } from "eslint-config/extend";\n\nexport default extend(baseConfig);\n`
			);
		}

		logger.info(`Created package ${name} at ${path.relative(directory.workspace, packageDir)}`);
	}

	private static async resolveEslintPreference(options: PackageOptions) {
		if (options.eslint === false) return false;

		const directory = CliUtils.getDirectory();
		const rootPackage = await this.readRootPackage(directory.workspace);
		const hasEslint = this.hasDependency(rootPackage, "eslint");

		if (hasEslint) return options.eslint ?? true;

		const shouldInstall =
			options.eslint === true ||
			(await CommonInquirer.confirm({
				message: "ESLint is not installed in this monorepo. Install and enable it?",
				default: true,
			}));

		if (!shouldInstall) return false;

		rootPackage.devDependencies = {
			...(rootPackage.devDependencies as Record<string, string> | undefined),
			eslint: await this.resolveDependencyVersion(directory.workspace, "eslint"),
		};
		await this.writeJson(path.join(directory.workspace, "package.json"), rootPackage);
		logger.info("Added eslint to the root devDependencies.");

		if (options.install !== false) {
			await this.installRootDependencies(directory.workspace);
		}

		return true;
	}

	private static async getInstallTags(props: {
		workspace: string;
		packages: PackageItem[];
		eslintEnabled: boolean;
	}) {
		const tags = new Set<TAGS>(["common", "node"]);
		const rootPackage = await this.readRootPackage(props.workspace);

		if (props.eslintEnabled) tags.add("eslint");
		if (this.hasDependency(rootPackage, "@biomejs/biome")) tags.add("biome");
		if (this.hasDependency(rootPackage, "prettier")) tags.add("prettier");
		if (this.hasDependency(rootPackage, "vitest")) tags.add("vitest");

		for (const pkg of props.packages) {
			pkg.packageJson?.startx?.tags?.forEach(tag => tags.add(tag));
			pkg.packageJson?.startx?.iTags?.forEach(tag => tags.add(tag));
			pkg.packageJson?.startx?.gTags?.forEach(tag => tags.add(tag));

			if (pkg.type === "apps" || pkg.packageJson?.startx?.mode === "standalone") {
				tags.add("runnable");
			}
		}

		return Array.from(tags);
	}

	private static resolvePackageClosure(props: {
		packages: PackageItem[];
		selectedPackage: PackageItem;
		includeEslintConfig: boolean;
	}) {
		const resolved = new Map<string, PackageItem>();
		const queue = [props.selectedPackage];
		const enqueue = (name: string) => {
			const pkg = this.findPackage(props.packages, name);
			if (pkg && !resolved.has(pkg.name)) queue.push(pkg);
		};

		if (props.includeEslintConfig) enqueue("eslint-config");

		while (queue.length > 0) {
			const pkg = queue.shift()!;
			if (resolved.has(pkg.name)) continue;

			resolved.set(pkg.name, pkg);
			for (const dep of [
				...(pkg.packageJson?.startx?.requiredDeps ?? []),
				...(pkg.packageJson?.startx?.requiredDevDeps ?? []),
			]) {
				enqueue(dep);
			}
		}

		return Array.from(resolved.values());
	}

	private static async ensureTemplatePackage(props: {
		packages: PackageItem[];
		name: string;
		directory: ReturnType<typeof CliUtils.getDirectory>;
		tags: TAGS[];
	}) {
		const pkg = this.findPackage(props.packages, props.name);
		if (!pkg) {
			logger.warn(`Could not find template package ${props.name}; skipping.`);
			return;
		}

		await this.installTemplatePackage({
			pkg,
			directory: props.directory,
			tags: props.tags,
		});
	}

	private static async installTemplatePackage(props: {
		pkg: PackageItem;
		directory: ReturnType<typeof CliUtils.getDirectory>;
		tags: TAGS[];
	}) {
		if (!props.pkg.packageJson) {
			throw new Error(`Missing package.json for ${props.pkg.name}`);
		}

		const destination = path.join(props.directory.workspace, props.pkg.relativePath);
		if (await this.pathExists(path.join(destination, "package.json"))) {
			logger.info(`Skipping ${props.pkg.name}; it already exists.`);
			return;
		}

		const tags = new Set<TAGS>([...props.tags, ...(props.pkg.packageJson.startx?.tags ?? [])]);
		const ignoreList = props.pkg.packageJson.startx?.ignore ?? [];
		if (ignoreList.includes("eslint-config")) tags.delete("eslint");
		if (ignoreList.includes("vitest-config")) tags.delete("vitest");

		const { packageJson, isWorkspace } = FileHandler.handlePackageJson({
			app: props.pkg.packageJson,
			tags: Array.from(tags),
			name: props.pkg.packageJson.name || props.pkg.name,
		});

		if (isWorkspace) {
			throw new Error(`Cannot install workspace as a package: ${props.pkg.name}`);
		}

		await fsTool.writeJSONFile({ dir: destination, file: "package", content: packageJson });
		await this.copyValidatedFilesFromFolder(props.pkg.path, destination, tags);
		await fsTool.copyDirectory({
			from: path.join(props.pkg.path, "src"),
			to: path.join(destination, "src"),
			exclude: !tags.has("vitest") ? /\.test\.tsx?$/ : undefined,
		});

		logger.info(`Installed ${props.pkg.name}`);
	}

	private static async copyValidatedFilesFromFolder(source: string, destination: string, tags: Set<TAGS>) {
		const files = await fsTool.listFiles({ dir: source }).catch(() => []);
		for (const file of files) {
			const checked = FileCheck[file];
			if (checked && !checked.tags.every(tag => tags.has(tag))) continue;
			if (file === "package.json") continue;

			await fsTool.copyFile({
				from: path.join(source, file),
				to: path.join(destination, file),
			});
		}
	}

	private static createPackageJson(props: { name: string; eslintEnabled: boolean }) {
		const scripts: Record<string, string> = {
			typecheck: "tsc --noEmit",
			clean: "rimraf dist .turbo",
		};
		const devDependencies: Record<string, string> = {
			"typescript-config": "workspace:*",
		};

		if (props.eslintEnabled) {
			scripts.lint = "eslint .";
			scripts["lint:fix"] = "eslint . --fix";
			devDependencies["eslint-config"] = "workspace:*";
		}

		return {
			name: props.name,
			version: "1.0.0",
			type: "module",
			scripts,
			exports: "./src/index.ts",
			devDependencies,
			startx: {
				iTags: ["node"],
				requiredDevDeps: ["typescript-config"],
				...(props.eslintEnabled ? {} : { ignore: ["eslint-config"] }),
			},
		};
	}

	private static getDefaultPackagePath(name: string) {
		if (name.startsWith("@")) {
			const [scope, packageName] = name.split("/");
			return path.join("packages", scope, packageName);
		}

		return path.join("packages", name);
	}

	private static findPackage(packages: PackageItem[], name: string) {
		return packages.find(pkg => pkg.name === name || pkg.packageJson?.name === name);
	}

	private static hasDependency(packageJson: StartXPackageJson, dependency: string) {
		return Boolean(
			packageJson.dependencies?.[dependency] ||
				packageJson.devDependencies?.[dependency] ||
				packageJson.peerDependencies?.[dependency]
		);
	}

	private static async readRootPackage(workspace: string) {
		const content = await fs.readFile(path.join(workspace, "package.json"), "utf-8");
		return JSON.parse(content) as StartXPackageJson;
	}

	private static async resolveDependencyVersion(workspace: string, dependency: string) {
		const pnpmWorkspace = await CliUtils.parsePnpmWorkspace({ dir: workspace });
		if (pnpmWorkspace?.catalog?.[dependency]) return "catalog:";
		return dependency === "eslint" ? "^9.0.0" : "latest";
	}

	private static async installRootDependencies(workspace: string) {
		const rootPackage = await this.readRootPackage(workspace);
		const packageManager = rootPackage.packageManager?.split("@")[0] || "pnpm";
		const command = packageManager === "yarn" ? "yarn" : packageManager;
		const args = packageManager === "yarn" ? ["install"] : ["install"];

		logger.info(`Running ${command} ${args.join(" ")} to install ESLint...`);

		await new Promise<void>((resolve, reject) => {
			const child = spawn(command, args, {
				cwd: workspace,
				stdio: "inherit",
				shell: process.platform === "win32",
			});

			child.on("error", reject);
			child.on("close", code => {
				if (code === 0) {
					resolve();
					return;
				}

				reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
			});
		}).catch(error => {
			logger.warn(`Could not install dependencies automatically: ${error instanceof Error ? error.message : error}`);
			logger.warn(`Run "${command} ${args.join(" ")}" manually in ${workspace}.`);
		});
	}

	private static async writeJson(file: string, content: object) {
		await fs.writeFile(file, `${JSON.stringify(content, null, 2)}\n`);
	}

	private static async pathExists(target: string) {
		try {
			await fs.access(target);
			return true;
		} catch {
			return false;
		}
	}
}
