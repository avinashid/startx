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
import { topLevelSources } from "../configs/scripts";
import type { PnpmWorkspace, StartXPackageJson, TAGS } from "../types";
import { CliUtils, type PackageItem } from "../utils/cli-utils";
import { findPackageByName, resolvePackageClosure } from "../utils/closure";
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
				.action(PackageCommand.list.bind(PackageCommand)),
		)
		.addCommand(
			new Command("add")
				.description("Add an existing StartX app or package, optionally with a new name.")
				.argument("[packageName]")
				.option("-n, --name <name>", "override the name for the added package")
				.option("--eslint", "enable ESLint support for the added package")
				.option("--no-eslint", "skip ESLint support for the added package")
				.option("--no-install", "do not run the package manager after updating dependencies")
				.action(PackageCommand.add.bind(PackageCommand)),
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
				.action(PackageCommand.create.bind(PackageCommand)),
		);

	private static async list() {
		const packages = await CliUtils.getPackageList();
		const byType = new Map<PackageItem["type"], PackageItem[]>();

		// The same set the interactive `add` picker offers: silent packages are reachable only as
		// someone's dependency, so listing them advertises something `add` will not offer (B76).
		for (const pkg of packages.filter((item) => item.packageJson?.startx?.mode !== "silent")) {
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
		const availablePackages = packages.filter((pkg) => pkg.packageJson?.startx?.mode !== "silent");
		const selectedName =
			packageName ??
			(await CommonInquirer.choose({
				message: "Select app or package to add",
				options: availablePackages.map((pkg) => pkg.name),
				mode: "single",
				required: true,
			}));

		const selectedPackage = this.findPackage(packages, selectedName);
		if (!selectedPackage) {
			throw new Error(`Package "${selectedName}" was not found in the StartX template.`);
		}
		this.assertAddable(packages, selectedPackage);

		const templateName = selectedPackage.packageJson?.name ?? selectedPackage.name;
		// `--name` never went through the prompt, so it never went through the schema either:
		// validate it here or an npm-invalid name (`../../.ssh/authorized_keys`) reaches the filesystem.
		const overrideName =
			options.name !== undefined
				? this.validatePackageName(options.name)
				: await CommonInquirer.getText({
						message: "Name for the new package (leave unchanged to keep the original)",
						name: "overrideName",
						default: templateName,
						schema: packageNameSchema,
					});

		const directory = CliUtils.getDirectory();
		const workspaceGlobs = await CliUtils.parsePnpmWorkspace({ dir: directory.workspace })
			.then((workspace) => workspace?.packages)
			.catch(() => undefined);
		const eslintEnabled = await this.resolveEslintPreference(options);
		const packagesToInstall = resolvePackageClosure({
			packages,
			seeds: [selectedPackage],
			includeEslintConfig: eslintEnabled,
		});
		const tags = await this.getInstallTags({
			workspace: directory.workspace,
			packages: packagesToInstall,
			eslintEnabled,
		});
		const mainIsRunnable =
			selectedPackage.type === "apps" || selectedPackage.packageJson?.startx?.mode === "standalone";

		await this.checkAndInstallMissingDeps({
			directory,
			tags: mainIsRunnable ? [...tags, "runnable"] : tags,
			install: options.install,
		});

		for (const pkg of packagesToInstall) {
			const isMain = pkg.name === selectedPackage.name;
			const pkgTags = new Set<TAGS>(tags);
			if (pkg.type === "apps" || pkg.packageJson?.startx?.mode === "standalone") {
				pkgTags.add("runnable");
			}

			await this.installTemplatePackage({
				pkg,
				directory,
				tags: Array.from(pkgTags),
				overrideName: isMain ? overrideName : undefined,
				overrideRelativePath: isMain
					? this.getDestinationPath(pkg.relativePath, overrideName, workspaceGlobs)
					: undefined,
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
		// `--dir` is user input that reaches the filesystem directly: keep it inside the workspace.
		const packageDir = this.assertInsideWorkspace(
			directory.workspace,
			options.dir ?? this.getDefaultPackagePath(name),
			`package "${name}"`,
		);

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

		const hasBiome = this.hasDependency(rootPackage, "@biomejs/biome");
		const hasPrettier = this.hasDependency(rootPackage, "prettier");

		await fs.mkdir(path.join(packageDir, "src"), { recursive: true });
		await this.writeJson(
			path.join(packageDir, "package.json"),
			FileHandler.stripGeneratorFields(
				this.createPackageJson({ name, eslintEnabled, vitestEnabled, hasBiome, hasPrettier }),
			),
		);
		// writeJson, not JSON.stringify(…, 2): the workspace formatters use tabs, so a 2-space
		// tsconfig fails format:check the moment the package exists (B71).
		await this.writeJson(path.join(packageDir, "tsconfig.json"), {
			extends: "typescript-config/tsconfig.node.json",
			compilerOptions: {
				moduleResolution: "bundler",
				module: "esnext",
				target: "es2022",
			},
			include: ["src/**/*.ts"],
		});
		await fs.writeFile(path.join(packageDir, "src", "index.ts"), "export {};\n");

		if (eslintEnabled) {
			await fs.writeFile(
				path.join(packageDir, "eslint.config.ts"),
				`import { baseConfig } from "eslint-config/base";\nimport { extend } from "eslint-config/extend";\n\nexport default extend(baseConfig);\n`,
			);
		}

		if (vitestEnabled) {
			await fs.writeFile(
				path.join(packageDir, "vitest.config.ts"),
				`import vitestConfig from "vitest-config/node";\n\nexport default vitestConfig;\n`,
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
		if (await this.ensureMinimumPackageManager(rootPackage)) {
			logger.info(`Bumped workspace packageManager to ${rootPackage.packageManager}.`);
		}
		await this.writeJson(path.join(directory.workspace, "package.json"), rootPackage);
		logger.info("Added eslint to the root devDependencies.");

		if (options.install !== false) {
			await this.installRootDependencies(directory.workspace, "eslint was added to the root package.json");
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
			pkg.packageJson?.startx?.gTags?.forEach((tag) => tags.add(tag));
		}

		return Array.from(tags);
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
		const destination = this.assertInsideWorkspace(
			props.directory.workspace,
			relativePath,
			`package "${props.overrideName ?? props.pkg.name}"`,
		);

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
			if (checked && !checked.tags.every((tag) => tags.has(tag))) continue;
			if (file === "package.json") continue;

			await fsTool.copyFile({
				from: path.join(source, file),
				to: path.join(destination, file),
			});
		}
	}

	private static createPackageJson(props: {
		name: string;
		eslintEnabled: boolean;
		vitestEnabled: boolean;
		hasBiome: boolean;
		hasPrettier: boolean;
	}) {
		const scripts: Record<string, string> = {
			typecheck: "tsc --noEmit",
			clean: "rimraf dist .turbo",
		};

		if (props.hasBiome) {
			scripts.format = "biome format --write .";
			scripts["format:check"] = "biome ci .";
		} else if (props.hasPrettier) {
			scripts.format = `prettier --write src "${topLevelSources}" --no-error-on-unmatched-pattern`;
			scripts["format:check"] = `prettier --check src "${topLevelSources}" --no-error-on-unmatched-pattern`;
		}
		const devDependencies: Record<string, string> = {
			"typescript-config": "workspace:*",
		};
		if (props.eslintEnabled) {
			scripts.lint = "eslint .";
			scripts["lint:fix"] = "eslint . --fix";
			devDependencies["eslint-config"] = "workspace:*";
		}

		if (props.vitestEnabled) {
			scripts.test = "vitest run";
			devDependencies["vitest-config"] = "workspace:*";
		}

		return {
			name: props.name,
			version: "1.0.0",
			type: "module",
			scripts,
			exports: "./src/index.ts",
			devDependencies,
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

		// Tracked separately so the install log names what actually changed, not a guess.
		const changes: string[] = [];
		let rootChanged = await this.ensureMinimumPackageManager(rootPackage);
		if (rootChanged) {
			logger.info(`Bumped workspace packageManager to ${rootPackage.packageManager}.`);
			changes.push(`packageManager was bumped to ${rootPackage.packageManager}`);
		}

		// These are opt-in via prompts elsewhere (formatter/test-runner choice); never force-install them here.
		const ignoredRootTools = new Set(["eslint", "vitest", "@biomejs/biome"]);

		const missingNpm: Array<{ name: string; version: string; isDev: boolean }> = [];
		const missingWorkspace: string[] = [];

		// Every root-level DepCheck entry is tagged `root`, which no package's install tags carry —
		// without it here, nothing root-level (tsdown for a newly added app) was ever offered (B64).
		const rootTags = new Set<TAGS>([...props.tags, "root"]);

		for (const [dep, config] of Object.entries(DepCheck)) {
			if (!config.tags.every((tag) => rootTags.has(tag))) continue;
			if (ignoredRootTools.has(dep)) continue;

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

		if (missingNpm.length > 0) {
			logger.warn("The following npm dependencies are required but not installed:");
			for (const dep of missingNpm) {
				logger.warn(`  - ${dep.name}`);
			}

			const shouldAdd = await CommonInquirer.confirm({
				message: "Add them to the workspace root package.json?",
				default: true,
			});

			if (shouldAdd) {
				rootPackage.devDependencies ??= {};
				rootPackage.dependencies ??= {};

				for (const dep of missingNpm) {
					if (dep.isDev) {
						(rootPackage.devDependencies as Record<string, string>)[dep.name] = dep.version;
					} else {
						(rootPackage.dependencies as Record<string, string>)[dep.name] = dep.version;
					}
				}

				rootChanged = true;
				changes.push(`${missingNpm.length} missing dependenc${missingNpm.length === 1 ? "y was" : "ies were"} added`);
				logger.info("Added missing dependencies to root package.json.");
			} else {
				logger.warn("Skipping. Some features may not work correctly without these dependencies.");
			}
		}

		if (!rootChanged) return;

		await this.writeJson(path.join(props.directory.workspace, "package.json"), rootPackage);

		if (props.install !== false) {
			await this.installRootDependencies(
				props.directory.workspace,
				changes.join(" and ") || "root package.json changed",
			);
		}
	}
	/** The workspace's pinned pnpm is the user's choice: bump it only with their say-so (B61). */
	private static async ensureMinimumPackageManager(rootPackage: StartXPackageJson): Promise<boolean> {
		const current = rootPackage.packageManager;
		const match = current?.match(/^pnpm@(\d+)/);
		if (!match) return false;

		const majorVersion = Number(match[1]);
		if (majorVersion >= 11) return false;

		const bump = await CommonInquirer.confirm({
			message: `This workspace pins ${current}, but startx templates target pnpm 11. Update packageManager to pnpm@11.5.1?`,
			default: true,
		});
		if (!bump) {
			logger.warn(`Keeping ${current}. Installing startx packages with pnpm ${majorVersion} may fail.`);
			return false;
		}

		rootPackage.packageManager = "pnpm@11.5.1";
		return true;
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

	private static getDestinationPath(templateRelativePath: string, newName: string, workspaceGlobs?: string[]): string {
		// Keep the template's top-level bucket (apps / packages / configs) but let the
		// NEW name decide the scope directory, so `-n @repo/analytics` never lands in `@db/`.
		const bucket = templateRelativePath.split(/[\\/]/).filter(Boolean)[0] ?? "packages";
		const leaf = newName.includes("/") ? newName.split("/").pop()! : newName;

		if (newName.startsWith("@") && this.bucketAllowsScopeDir(bucket, workspaceGlobs)) {
			const scope = newName.split("/")[0];
			return path.join(bucket, scope, leaf);
		}

		// The bucket has no two-level glob (`apps/*` but no `apps/*/*`), so a scope directory
		// would put the package outside every workspace glob and pnpm would never link it.
		return path.join(bucket, leaf);
	}

	/** Does the workspace declare a glob that reaches `<bucket>/<scope>/<leaf>`? */
	private static bucketAllowsScopeDir(bucket: string, workspaceGlobs?: string[]): boolean {
		// No pnpm-workspace.yaml to read: fall back to the layout startx itself ships.
		if (!workspaceGlobs || workspaceGlobs.length === 0) return bucket === "packages";

		return workspaceGlobs.some((glob) => {
			const parts = glob.replace(/^\.\//, "").split("/").filter(Boolean);
			const head = parts[0];
			if (head !== bucket && head !== "*" && head !== "**") return false;
			return parts.includes("**") || parts.length >= 3;
		});
	}

	private static validatePackageName(name: string) {
		const result = packageNameSchema.safeParse(name);
		if (!result.success) {
			throw new Error(`Invalid package name "${name}": ${result.error.issues[0]?.message ?? "invalid name"}.`);
		}
		return result.data;
	}

	/** Every filesystem destination derived from user input must land inside the workspace. */
	private static assertInsideWorkspace(workspace: string, target: string, label: string) {
		const root = path.resolve(workspace);
		const resolved = path.resolve(root, target);
		const relative = path.relative(root, resolved);

		// Only a leading `..` SEGMENT escapes: `..foo` is an ordinary directory name (B62).
		const escapes = relative === ".." || relative.startsWith(`..${path.sep}`);
		if (!relative || escapes || path.isAbsolute(relative)) {
			throw new Error(`Refusing to write ${label} to "${resolved}": it is not inside the workspace "${root}".`);
		}

		return resolved;
	}

	private static getDefaultPackagePath(name: string) {
		if (name.startsWith("@")) {
			const [scope, packageName] = name.split("/");
			return path.join("packages", scope, packageName);
		}

		return path.join("packages", name);
	}

	/**
	 * A silent package is never offered, but one that is somebody's dependency (typescript-config,
	 * tsdown-config) may still be added by name. One that nothing depends on is internal to the
	 * template, startx-cli itself, and copying it into a workspace is never what was meant (B76).
	 */
	private static assertAddable(packages: PackageItem[], pkg: PackageItem) {
		if (pkg.packageJson?.startx?.mode !== "silent") return;

		const name = pkg.packageJson.name ?? pkg.name;
		const isDependency = packages.some((other) =>
			[
				...(other.packageJson?.startx?.requiredDeps ?? []),
				...(other.packageJson?.startx?.requiredDevDeps ?? []),
			].includes(name),
		);
		if (!isDependency) {
			throw new Error(`"${name}" is internal to the StartX template and cannot be added to a workspace.`);
		}
	}

	private static findPackage(packages: PackageItem[], name: string) {
		return findPackageByName(packages, name);
	}

	private static hasDependency(packageJson: StartXPackageJson, dependency: string) {
		return Boolean(
			packageJson.dependencies?.[dependency] ||
			packageJson.devDependencies?.[dependency] ||
			packageJson.peerDependencies?.[dependency],
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

	private static async installRootDependencies(workspace: string, reason: string) {
		const rootPackage = await this.readRootPackage(workspace);
		const command = rootPackage.packageManager?.split("@")[0] || "pnpm";
		const args = ["install"];

		logger.info(`Running ${command} install (${reason})...`);

		await new Promise<void>((resolve, reject) => {
			const child = spawn(command, args, {
				cwd: workspace,
				stdio: "inherit",
				shell: process.platform === "win32",
			});

			child.on("error", reject);
			child.on("close", (code) => {
				if (code === 0) {
					resolve();
					return;
				}

				reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
			});
		}).catch((error) => {
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
			doc.set("catalog", doc.createNode({}));
		}

		const template = await this.loadTemplateCatalogs(props.templateDir);

		const deps = props.packageJson.dependencies as Record<string, string> | undefined;
		const devDeps = props.packageJson.devDependencies as Record<string, string> | undefined;
		const peerDeps = props.packageJson.peerDependencies as Record<string, string> | undefined;
		const newEntries: Record<string, string> = {};
		const newNamedEntries: Array<{ catalog: string; name: string; version: string }> = [];

		const processMap = (depMap: Record<string, string> | undefined) => {
			if (!depMap) return;
			for (const [name, version] of Object.entries(depMap)) {
				if (version.startsWith("workspace:")) continue;

				if (version.startsWith("catalog:")) {
					// pnpm resolves bare `catalog:` against the DEFAULT catalog and `catalog:<name>`
					// against `catalogs.<name>`. They are separate namespaces — never cross them.
					const catalogName = version.slice("catalog:".length).trim();

					if (catalogName) {
						if (doc.hasIn(["catalogs", catalogName, name])) continue;

						const templateVersion = template.catalogs[catalogName]?.[name];
						if (templateVersion) {
							newNamedEntries.push({ catalog: catalogName, name, version: templateVersion });
						} else {
							logger.warn(
								`No version found for ${name} in catalog "${catalogName}"; it stays as "${version}" and ` +
									`pnpm install will fail. Add ${name} under catalogs.${catalogName} in pnpm-workspace.yaml.`,
							);
						}
						continue;
					}

					if (doc.hasIn(["catalog", name])) continue;

					const templateVersion = template.catalog[name];
					if (templateVersion) {
						newEntries[name] = templateVersion;
						continue;
					}

					// Nothing can resolve this entry — there is no version literal to fall back to
					// once a template has pinned `catalog:`, so the only honest action is to say so.
					logger.warn(
						`No catalog version found for ${name}; it stays as "catalog:" and pnpm install will fail. ` +
							`Add ${name} to the catalog in pnpm-workspace.yaml.`,
					);
					continue;
				}

				// Only registry specs (semver ranges, dist-tags) belong in a catalog. A `link:`, `file:`,
				// `npm:` or git/URL spec, a path or a `user/repo` shorthand stays literal in the package:
				// cataloged, pnpm resolves it against the workspace root and the install fails (B72).
				if (/[:/\\]/.test(version) || version.startsWith(".")) continue;

				depMap[name] = "catalog:";
				if (!doc.hasIn(["catalog", name])) newEntries[name] = version;
			}
		};

		processMap(deps);
		processMap(devDeps);
		processMap(peerDeps);

		if (Object.keys(newEntries).length === 0 && newNamedEntries.length === 0) return;

		for (const [name, version] of Object.entries(newEntries)) {
			doc.setIn(["catalog", name], version);
		}
		for (const entry of newNamedEntries) {
			if (!doc.hasIn(["catalogs", entry.catalog])) {
				doc.setIn(["catalogs", entry.catalog], doc.createNode({}));
			}
			doc.setIn(["catalogs", entry.catalog, entry.name], entry.version);
		}

		await fs.writeFile(workspacePath, doc.toString());
		logger.info("Added to pnpm-workspace.yaml catalog:");
		for (const [name, version] of Object.entries(newEntries)) {
			logger.info(`  + ${name}: ${version}`);
		}
		for (const entry of newNamedEntries) {
			logger.info(`  + catalogs.${entry.catalog}.${entry.name}: ${entry.version}`);
		}
	}

	private static async loadTemplateCatalogs(
		templateDir: string,
	): Promise<{ catalog: Record<string, string>; catalogs: Record<string, Record<string, string>> }> {
		const empty = { catalog: {}, catalogs: {} };
		const file = path.join(templateDir, "pnpm-workspace.yaml");

		let raw: string;
		try {
			raw = await fs.readFile(file, "utf-8");
		} catch {
			logger.warn(`Could not find pnpm-workspace.yaml template in ${templateDir}.`);
			return empty;
		}

		let parsed: Partial<PnpmWorkspace>;
		try {
			parsed = (YAML.parse(raw) ?? {}) as Partial<PnpmWorkspace>;
		} catch (error) {
			logger.warn(
				`Could not parse ${file}: ${error instanceof Error ? error.message : String(error)}. ` +
					`Catalog versions will not be resolved.`,
			);
			return empty;
		}

		// YAML happily yields numbers for `foo: 1.2`; every catalog value must be a version string.
		const asVersions = (entries?: Record<string, unknown>): Record<string, string> =>
			Object.fromEntries(Object.entries(entries ?? {}).map(([name, version]) => [name, String(version)]));

		return {
			catalog: asVersions(parsed.catalog),
			catalogs: Object.fromEntries(
				Object.entries(parsed.catalogs ?? {}).map(([name, group]) => [name, asVersions(group)]),
			),
		};
	}
	private static async writeJson(file: string, content: object) {
		await fs.writeFile(file, `${JSON.stringify(content, null, "\t")}\n`);
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
