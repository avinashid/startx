import { DepCheck } from "../configs/deps";
import { scripts } from "../configs/scripts";
import { Constants } from "../constants";
import type { StartXPackageJson, TAGS } from "../types";

export class FileHandler {
	// Metadata describing the generator rather than the workspace being generated. `startx` blocks
	// are only ever read back from the template directory (CliUtils.getPackageList), never from a
	// user's workspace; the rest identify startx itself and must not be inherited.
	private static readonly generatorFields = [
		"startx",
		"author",
		"license",
		"keywords",
		"repository",
		"homepage",
		"bugs",
		"publishConfig",
	] as const;

	static stripGeneratorFields<T extends Record<string, unknown>>(packageJson: T): T {
		for (const field of this.generatorFields) delete packageJson[field];
		return packageJson;
	}

	private static objSorter(obj: Record<string, unknown>, sorter: string[] = []) {
		const cleaned = Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== null && v !== undefined));

		const sortedEntries: Array<[string, unknown]> = [];

		for (const key of sorter) {
			if (key in cleaned) {
				sortedEntries.push([key, cleaned[key]]);
				delete cleaned[key];
			}
		}

		for (const entry of Object.entries(cleaned)) {
			sortedEntries.push(entry);
		}
		return Object.fromEntries(sortedEntries);
	}
	static handlePackageJson(props: {
		name?: string;
		app: StartXPackageJson;
		tags: TAGS[];
		dependencies?: Record<string, string>;
	}) {
		const isWorkspace = props.tags.includes("root");

		const tags = [...props.tags];
		const workspaceAttr: Record<string, unknown> = isWorkspace
			? {
					version: "1.0.0",
					// A monorepo root is never the published artifact; the template root has no `private`
					// to inherit because it *is* the published `startx` package.
					private: true,
					packageManager: Constants.packageManager,
					engines: {
						node: Constants.node,
					},
				}
			: {};

		const packageScript = Object.fromEntries(
			Object.entries(scripts)
				.map(([key, value]) => {
					const script = value.find((e) => e.tags.every((tag) => tags.includes(tag)));
					return script ? [key, script.script] : null;
				})
				.filter((v): v is [string, string] => v !== null),
		);

		const filterDeps = (deps?: Record<string, string>) =>
			Object.fromEntries(
				Object.entries(deps ?? {}).filter(([key]) => {
					const selected = DepCheck[key];
					return !selected || selected.tags.every((tag) => tags.includes(tag));
				}),
			);

		const dependencies = filterDeps(props.app.dependencies as Record<string, string>);
		const devDependencies = filterDeps(props.app.devDependencies as Record<string, string>);
		const peerDependencies = filterDeps(props.app.peerDependencies as Record<string, string>);

		// Removing all workspace dependencies
		for (const [key, value] of Object.entries(dependencies)) {
			if (value.includes("workspace:")) {
				delete dependencies[key];
			}
		}

		// Removing all workspace dev dependencies
		for (const [key, value] of Object.entries(devDependencies)) {
			if (value.includes("workspace:")) {
				delete devDependencies[key];
			}
		}

		// Adding props required dependencies
		if (props.dependencies) {
			for (const [key, value] of Object.entries(props.dependencies)) {
				if (!dependencies[key]) {
					dependencies[key] = value;
				}
			}
		}

		// Adding required dev & devDeps
		props.app.startx?.requiredDevDeps?.forEach((e) => (devDependencies[e] = "workspace:^"));
		props.app.startx?.requiredDeps?.forEach((e) => (dependencies[e] = "workspace:^"));

		// Adding rest
		for (const [key, value] of Object.entries(DepCheck)) {
			if (!value.tags.every((tag) => tags.includes(tag))) continue;
			if (isWorkspace && !value.tags.includes("root")) continue;
			const isDev = value.isDevDependency;
			if (isDev && !devDependencies[key]) {
				devDependencies[key] = value.version;
			} else if (!isDev && !dependencies[key]) {
				dependencies[key] = value.version;
			}
		}

		// Removing ignore
		for (const value of props.app.startx?.ignore ?? []) {
			delete dependencies[value];
			delete devDependencies[value];
		}

		// structuredClone so nested objects (exports, bin …) are not aliased into the emitted
		// package.json — a later mutation would otherwise poison the in-memory template for every
		// package emitted afterwards in the same run.
		const packageJson: Record<string, unknown> = {
			...structuredClone(props.app),
			name: props.name || props.app.name,
			type: "module",
			scripts: packageScript,
			dependencies,
			devDependencies,
			...(props.app.peerDependencies ? { peerDependencies } : {}),
			...workspaceAttr,
		};

		this.stripGeneratorFields(packageJson);

		// The template root package.json *is* the published `startx` package, so the workspace root is
		// assembled from an allowlist: a field added to the template root later cannot leak silently.
		const rootFields = [
			"name",
			"version",
			"private",
			"type",
			"scripts",
			"dependencies",
			"devDependencies",
			"packageManager",
			"engines",
		];

		if (isWorkspace) {
			for (const field of Object.keys(packageJson)) {
				if (!rootFields.includes(field)) delete packageJson[field];
			}
		}

		const sorter = [
			"name",
			"description",
			"version",
			"private",
			"type",
			"main",
			"bin",
			"scripts",
			"files",
			"exports",
			"types",
			"dependencies",
			"devDependencies",
			"peerDependencies",
			"packageManager",
			"engines",
		];

		return {
			packageJson: this.objSorter(packageJson, sorter),
			isWorkspace,
		};
	}
}
