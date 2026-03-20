import { DepCheck } from "../configs/deps";
import { scripts } from "../configs/scripts";
import { Constants } from "../constants";
import type { StartXPackageJson, TAGS } from "../types";

export class FileHandler {
	private static objSorter(obj: Record<string, unknown>, sorter: string[] = []) {
		const cleaned = Object.fromEntries(
			Object.entries(obj).filter(([, v]) => v !== null && v !== undefined)
		);

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
		const isWorkspace = !!props.app.devDependencies?.turbo;

		const tags = isWorkspace ? [...props.tags, "root"] : [...props.tags];

		const workspaceAttr: Record<string, unknown> = isWorkspace
			? {
					version: "1.0.0",
					packageManager: Constants.packageManager,
					engines: {
						node: Constants.node,
					},
				}
			: {};

		const packageScript = Object.fromEntries(
			Object.entries(scripts)
				.map(([key, value]) => {
					const script = value.find(e => e.tags.every(tag => tags.includes(tag)));
					return script ? [key, script.script] : null;
				})
				.filter((v): v is [string, string] => v !== null)
		);

		const filterDeps = (deps?: Record<string, string>) =>
			Object.fromEntries(
				Object.entries(deps ?? {}).filter(([key]) => {
					const selected = DepCheck[key];
					return !selected || selected.tags.every(tag => tags.includes(tag));
				})
			);

		const dependencies = filterDeps(props.app.dependencies as Record<string, string>);
		const devDependencies = filterDeps(props.app.devDependencies as Record<string, string>);

		// Removing all workspace dependencies
		for (const [key, value] of Object.entries(devDependencies)) {
			if (value.includes("workspace:")) {
				delete devDependencies[key];
			}
		}

		// Adding required
		if (props.dependencies) {
			for (const [key, value] of Object.entries(props.dependencies)) {
				if (!dependencies[key]) {
					dependencies[key] = value;
				}
			}
		}

		// Adding rest
		for (const [key, value] of Object.entries(DepCheck)) {
			const isDev = value.isDevDependency;
			if (isDev && !devDependencies[key]) {
				devDependencies[key] = value.version;
			} else if (!dependencies[key]) {
				dependencies[key] = value.version;
			}
		}

		// Removing ignore
		for (const value of props.app.startx?.ignore ?? []) {
			delete dependencies[value];
			delete devDependencies[value];
		}

		const packageJson = {
			name: props.name || props.app.name,
			description: props.app.description,
			type: "module",
			exports: props.app.exports,
			files: props.app.files,
			scripts: packageScript,
			dependencies,
			devDependencies,
			...workspaceAttr,
		};

		const sorter = [
			"name",
			"description",
			"version",
			"type",
			"scripts",
			"files",
			"exports",
			"dependencies",
			"devDependencies",
			"packageManager",
			"engines",
		];

		return {
			packageJson: this.objSorter(packageJson, sorter),
			isWorkspace,
		};
	}
}
