import { fsTool } from "@repo/lib/file-system-module";
import { logger } from "@repo/logger";
import { spawn } from "child_process";
import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import * as YAML from "yaml";
import z from "zod";

import { DepCheck } from "../configs/deps";
import { FileCheck } from "../configs/files";
import type { StartXPackageJson, TAGS } from "../types";
import { CliUtils, type PackageItem } from "../utils/cli-utils";
import { FileHandler } from "../utils/file-handler";
import { CommonInquirer } from "../utils/inquirer";

type PackageOptions = {
	eslint?: boolean;
	install?: boolean;
	name?: string;
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
				.description("Add an existing StartX app or package, optionally with a new name.")
				.argument("[packageName]")
				.option("-n, --name <name>", "override the name for the added package")
				.option("--eslint", "enable ESLint support for the added package")
				.option("--no-eslint", "skip ESLint support for the added package")
				.option("--no-install", "do not run the package manager after updating dependencies")
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
				message: "Select app or package to add",
				options: availablePackages.map(pkg => pkg.name),
				mode: "single",
				required: true,
			}));

		const selectedPackage = this.findPackage(packages, selectedName);
		if (!selectedPackage) {
			throw new Error(`Package "${selectedName}" was not found in the StartX template.`);
		}

		const templateName = selectedPackage.packageJson?.name ?? selectedPackage.name;
		const overrideName =
			options.name ??
			(await CommonInquirer.getText({
				message: "Name for the new package (leave unchanged to keep the original)",
				name: "overrideName",
				default: templateName,
				schema: packageNameSchema,
			}));

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

		await this.checkAndInstallMissingDeps({
			directory,
			tags,
			install: options.install,
		});

		for (const pkg of packagesToInstall) {
			const isMain = pkg.name === selectedPackage.name;
			await this.installTemplatePackage({
				pkg,
				directory,
				tags,
				overrideName: isMain ? overrideName : undefined,
				overrideRelativePath: isMain ? this.getDestinationPath(pkg.relativePath, overrideName) : undefined,
			});
		}

		logger.info(`Done! Run \`pnpm install\` to link the new package.`);
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

		const rootPackage = await this.readRootPackage(directory.workspace);
		const eslintEnabled = await this.resolveEslintPreference(options);
		const vitestEnabled = this.hasDependency(rootPackage, "vitest");
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

		if (vitestEnabled) {
			await this.ensureTemplatePackage({
				packages,
				name: "vitest-config",
				directory,
				tags: ["common", "node", "vitest"],
			});
		}

		await fs.mkdir(path.join(packageDir, "src"), { recursive: true });
		await this.writeJson(
			path.join(packageDir, "package.json"),
			this.createPackageJson({ name, eslintEnabled, vitestEnabled })
		);
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

		if (vitestEnabled) {
			await fs.writeFile(
				path.join(packageDir, "vitest.config.ts"),
				`import vitestConfig from "vitest-config/node";\n\nexport default vitestConfig;\n`
			);
		}

		logger.info(`Created package ${name} at ${path.relative(directory.workspace, packageDir)}`);
		logger.info(`Run \`pnpm install\` to link the new package.`);
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

	private static async getInstallTags(props: { workspace: string; packages: PackageItem[]; eslintEnabled: boolean }) {
		const tags = new Set<TAGS>(["common", "node"]);
		const rootPackage = await this.readRootPackage(props.workspace);

		if (props.eslintEnabled) tags.add("eslint");
		if (this.hasDependency(rootPackage, "@biomejs/biome")) tags.add("biome");
		if (this.hasDependency(rootPackage, "prettier")) tags.add("prettier");
		if (this.hasDependency(rootPackage, "vitest")) tags.add("vitest");
		if (this.hasDependency(rootPackage, "tsdown")) tags.add("tsdown");

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
		overrideName?: string;
		overrideRelativePath?: string;
	}) {
		if (!props.pkg.packageJson) {
			throw new Error(`Missing package.json for ${props.pkg.name}`);
		}

		const relativePath = props.overrideRelativePath ?? props.pkg.relativePath;
		const destination = path.join(props.directory.workspace, relativePath);

		if (await this.pathExists(path.join(destination, "package.json"))) {
			const overwrite = await CommonInquirer.confirm({
				message: `"${relativePath}" already exists. Overwrite?`,
				default: false,
			});
			if (!overwrite) {
				logger.info(`Skipping ${props.pkg.name}.`);
				return;
			}
		}

		const tags = new Set<TAGS>([...props.tags, ...(props.pkg.packageJson.startx?.tags ?? [])]);
		const ignoreList = props.pkg.packageJson.startx?.ignore ?? [];
		if (ignoreList.includes("eslint-config")) tags.delete("eslint");
		if (ignoreList.includes("vitest-config")) tags.delete("vitest");

		const { packageJson, isWorkspace } = FileHandler.handlePackageJson({
			app: props.pkg.packageJson,
			tags: Array.from(tags),
			name: props.overrideName ?? props.pkg.packageJson.name ?? props.pkg.name,
		});

		if (isWorkspace) {
			throw new Error(`Cannot install workspace as a package: ${props.pkg.name}`);
		}

		await this.syncDepsWithCatalog({
			workspace: props.directory.workspace,
			templateDir: props.directory.template,
			packageJson: packageJson as Record<string, unknown>,
		});

		await fsTool.writeJSONFile({ dir: destination, file: "package", content: packageJson });
		await this.copyValidatedFilesFromFolder(props.pkg.path, destination, tags);
		await fsTool.copyDirectory({
			from: path.join(props.pkg.path, "src"),
			to: path.join(destination, "src"),
			exclude: !tags.has("vitest") ? /\.test\.tsx?$/ : undefined,
		});

		logger.info(`Installed ${props.overrideName ?? props.pkg.name} at ${relativePath}`);
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

	private static createPackageJson(props: { name: string; eslintEnabled: boolean; vitestEnabled: boolean }) {
		const scripts: Record<string, string> = {
			typecheck: "tsc --noEmit",
			clean: "rimraf dist .turbo",
		};
		const devDependencies: Record<string, string> = {
			"typescript-config": "workspace:*",
		};
		const ignore: string[] = [];

		if (props.eslintEnabled) {
			scripts.lint = "eslint .";
			scripts["lint:fix"] = "eslint . --fix";
			devDependencies["eslint-config"] = "workspace:*";
		} else {
			ignore.push("eslint-config");
		}

		if (props.vitestEnabled) {
			scripts.test = "vitest run";
			devDependencies["vitest-config"] = "workspace:*";
		} else {
			ignore.push("vitest-config");
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
				...(ignore.length > 0 ? { ignore } : {}),
			},
		};
	}
	private static async checkAndInstallMissingDeps(props: {
		directory: {
			template: string;
			workspace: string;
		};
		tags: TAGS[];
		install?: boolean;
	}) {
		const rootPackage = await this.readRootPackage(props.directory.workspace);
		const pnpmWorkspace = await CliUtils.parsePnpmWorkspace({ dir: props.directory.workspace });

		const missingNpm: Array<{ name: string; version: string; isDev: boolean }> = [];
		const missingWorkspace: string[] = [];

		for (const [dep, config] of Object.entries(DepCheck)) {
			if (!config.tags.every(tag => props.tags.includes(tag))) continue;
			if (config.tags.includes("root")) continue;

			if (config.version.startsWith("workspace:")) {
				const exists = await this.workspacePackageExists(props.directory.workspace, dep);
				if (!exists) missingWorkspace.push(dep);
			} else {
				if (this.hasDependency(rootPackage, dep)) continue;
				const version = pnpmWorkspace?.catalog?.[dep] ? "catalog:" : config.version;
				missingNpm.push({ name: dep, version, isDev: config.isDevDependency ?? true });
			}
		}

		if (missingWorkspace.length > 0) {
			logger.warn("The following workspace packages are missing from this monorepo:");
			for (const name of missingWorkspace) {
				logger.warn(`  - ${name}  →  run: startx package add ${name}`);
			}
		}

		if (missingNpm.length === 0) return;

		logger.warn("The following npm dependencies are required but not installed:");
		for (const dep of missingNpm) {
			logger.warn(`  - ${dep.name}`);
		}

		const shouldAdd = await CommonInquirer.confirm({
			message: "Add them to the workspace root package.json?",
			default: true,
		});
		if (!shouldAdd) {
			logger.warn("Skipping. Some features may not work correctly without these dependencies.");
			return;
		}

		rootPackage.devDependencies ??= {};
		rootPackage.dependencies ??= {};

		for (const dep of missingNpm) {
			if (dep.isDev) {
				(rootPackage.devDependencies as Record<string, string>)[dep.name] = dep.version;
			} else {
				(rootPackage.dependencies as Record<string, string>)[dep.name] = dep.version;
			}
		}

		await this.writeJson(path.join(props.directory.workspace, "package.json"), rootPackage);
		logger.info("Added missing dependencies to root package.json.");

		if (props.install !== false) {
			await this.installRootDependencies(props.directory.workspace);
		}
	}
	private static async workspacePackageExists(workspace: string, packageName: string): Promise<boolean> {
		// Resolve scoped names: @repo/lib → packages/@repo/lib
		const subPath = packageName.startsWith("@") ? path.join(...packageName.split("/")) : packageName;

		const candidates = [
			path.join(workspace, "configs", subPath, "package.json"),
			path.join(workspace, "packages", subPath, "package.json"),
			path.join(workspace, "apps", subPath, "package.json"),
		];

		for (const candidate of candidates) {
			if (await this.pathExists(candidate)) return true;
		}
		return false;
	}

	private static getDestinationPath(templateRelativePath: string, newName: string): string {
		const parentDir = path.dirname(templateRelativePath);
		const leafName = newName.includes("/") ? newName.split("/").pop()! : newName;
		return path.join(parentDir, leafName);
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
	private static async syncDepsWithCatalog(props: {
		workspace: string;
		templateDir: string;
		packageJson: Record<string, unknown>;
	}): Promise<void> {
		const workspacePath = path.join(props.workspace, "pnpm-workspace.yaml");
		let content: string;
		try {
			content = await fs.readFile(workspacePath, "utf-8");
		} catch {
			logger.warn(`Could not find pnpm workspace file at ${workspacePath}.`);
			return;
		}

		const doc = YAML.parseDocument(content);

		if (!doc.has("catalog")) {
			doc.set("catalog", {});
		}

		const templateCatalog = await this.loadTemplateCatalog(props.templateDir);

		const deps = props.packageJson.dependencies as Record<string, string> | undefined;
		const devDeps = props.packageJson.devDependencies as Record<string, string> | undefined;
		const newEntries: Record<string, string> = {};

		const processMap = (depMap: Record<string, string> | undefined) => {
			if (!depMap) return;
			for (const [name, version] of Object.entries(depMap)) {
				if (version.startsWith("workspace:")) continue;

				const existsInUserCatalog = doc.hasIn(["catalog", name]);

				if (version === "catalog:") {
					if (!existsInUserCatalog) {
						const templateVersion = templateCatalog[name];
						if (templateVersion) newEntries[name] = templateVersion;
					}
				} else {
					depMap[name] = "catalog:";
					if (!existsInUserCatalog) newEntries[name] = version;
				}
			}
		};

		processMap(deps);
		processMap(devDeps);

		if (Object.keys(newEntries).length === 0) return;

		for (const [name, version] of Object.entries(newEntries)) {
			doc.setIn(["catalog", name], version);
		}

		await fs.writeFile(workspacePath, doc.toString());
		logger.info("Added to pnpm-workspace.yaml catalog:");
		for (const [name, version] of Object.entries(newEntries)) {
			logger.info(`  + ${name}: ${version}`);
		}
	}

	private static async loadTemplateCatalog(templateDir: string): Promise<Record<string, string>> {
		try {
			const raw = await fs.readFile(path.join(templateDir, "pnpm-workspace.yaml"), "utf-8");
			const doc = YAML.parseDocument(raw);
			const catalogNode = doc.get("catalog") as YAML.Document | undefined;

			return catalogNode ? (catalogNode.toJSON() as Record<string, string>) : {};
		} catch {
			logger.warn(`Could not find pnpm-workspace.yaml template in ${templateDir}.`);
			return {};
		}
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
