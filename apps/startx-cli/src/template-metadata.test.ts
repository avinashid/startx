import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { StartXPackageJson } from "./types";

// The template is this repository: apps/startx-cli/src → repo root.
const root = path.resolve(import.meta.dirname, "../../..");

const templatePackages = ["packages", "packages/@db", "packages/@repo", "configs"].flatMap((dir) =>
	fs
		.readdirSync(path.join(root, dir), { withFileTypes: true })
		.filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, dir, entry.name, "package.json")))
		.map((entry) => path.join(dir, entry.name)),
);

// Wired by tag (eslint/vitest selection), not by the closure.
const tagWired = new Set(["eslint-config", "vitest-config"]);

describe("template metadata", () => {
	it.each(templatePackages)("%s lists every workspace dependency in requiredDeps (B51)", (dir) => {
		const pkg = JSON.parse(fs.readFileSync(path.join(root, dir, "package.json"), "utf8")) as StartXPackageJson;
		const meta = pkg.startx ?? {};
		const covered = new Set([...(meta.requiredDeps ?? []), ...(meta.requiredDevDeps ?? []), ...(meta.ignore ?? [])]);

		// handlePackageJson drops every `workspace:` dependency and re-adds only requiredDeps, so a
		// workspace import that is not listed there vanishes from the scaffolded package.
		const dropped = [
			...Object.entries((pkg.dependencies ?? {}) as Record<string, string>),
			...Object.entries((pkg.devDependencies ?? {}) as Record<string, string>),
		]
			.filter(([name, range]) => range.startsWith("workspace:") && !covered.has(name) && !tagWired.has(name))
			.map(([name]) => name);

		expect(dropped).toEqual([]);
	});
});
