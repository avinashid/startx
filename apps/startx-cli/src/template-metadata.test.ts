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

const templateApps = fs
	.readdirSync(path.join(root, "apps"), { withFileTypes: true })
	.filter((entry) => entry.isDirectory() && fs.existsSync(path.join(root, "apps", entry.name, "package.json")))
	.map((entry) => path.join("apps", entry.name));

const workspaceNames = new Set(
	[...templatePackages, ...templateApps].map(
		(dir) => (JSON.parse(fs.readFileSync(path.join(root, dir, "package.json"), "utf8")) as StartXPackageJson).name,
	),
);

const packageOf = (specifier: string) =>
	specifier
		.split("/")
		.slice(0, specifier.startsWith("@") ? 2 : 1)
		.join("/");

describe("template app metadata", () => {
	// `init` auto-wires every selected library into an app, but `package add <app>` only adds the
	// requiredDeps closure, so a workspace import missing from it fails typecheck there (B70).
	it.each(templateApps)("%s lists every imported workspace package in requiredDeps (B70)", (dir) => {
		const pkg = JSON.parse(fs.readFileSync(path.join(root, dir, "package.json"), "utf8")) as StartXPackageJson;
		const required = new Set(pkg.startx?.requiredDeps ?? []);
		const src = path.join(root, dir, "src");

		const imported = new Set(
			fs
				.readdirSync(src, { recursive: true, encoding: "utf8" })
				.filter((file) => /\.(ts|tsx)$/.test(file))
				.flatMap((file) => [
					...fs.readFileSync(path.join(src, file), "utf8").matchAll(/(?:from|import\()\s*"([^"]+)"/g),
				])
				.map((match) => packageOf(match[1]!))
				.filter((name) => workspaceNames.has(name) && name !== pkg.name && !tagWired.has(name)),
		);

		expect([...imported].filter((name) => !required.has(name)).sort()).toEqual([]);
	});
});
