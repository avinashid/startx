import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import * as YAML from "yaml";

import { PackageCommand } from "./package";
import type { StartXPackageJson } from "../types";
import type { PackageItem } from "../utils/cli-utils";

type Internals = {
	assertInsideWorkspace: (workspace: string, target: string, label: string) => string;
	syncDepsWithCatalog: (props: {
		workspace: string;
		templateDir: string;
		packageJson: Record<string, unknown>;
	}) => Promise<void>;
	assertAddable: (packages: PackageItem[], pkg: PackageItem) => void;
};
const { assertInsideWorkspace, syncDepsWithCatalog, assertAddable } = PackageCommand as unknown as Internals;
const check = (target: string) => assertInsideWorkspace.call(PackageCommand, "/ws", target, "package");

describe("PackageCommand.assertInsideWorkspace (B62)", () => {
	it.each(["..foo", "packages/..foo", "packages/@repo/..bar"])(
		"accepts %s, a name that only starts with dots",
		(target) => {
			expect(check(target)).toBe(path.resolve("/ws", target));
		},
	);

	it.each(["..", "../sibling", "packages/../../x", "/etc", "."])("rejects %s", (target) => {
		expect(() => check(target)).toThrow(/not inside the workspace/);
	});
});

describe("PackageCommand.syncDepsWithCatalog (B72)", () => {
	it("catalogs registry specs only and leaves protocol, path and shorthand specs literal", async () => {
		const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "sx-catalog-"));
		await fs.writeFile(path.join(workspace, "pnpm-workspace.yaml"), "packages:\n  - packages/*\ncatalog: {}\n");

		const literal = {
			vine: "link:@types/vinejs/vine",
			local: "file:../local",
			alias: "npm:other@^1.0.0",
			git: "git+https://github.com/a/b.git",
			shorthand: "user/repo",
			relative: "./vendor/pkg",
		};
		const dependencies: Record<string, string> = { range: "^1.2.0", tag: "latest", own: "workspace:^", ...literal };

		await syncDepsWithCatalog.call(PackageCommand, {
			workspace,
			templateDir: workspace,
			packageJson: { dependencies },
		});

		expect(dependencies).toEqual({ range: "catalog:", tag: "catalog:", own: "workspace:^", ...literal });
		const doc = YAML.parse(await fs.readFile(path.join(workspace, "pnpm-workspace.yaml"), "utf-8")) as {
			catalog: Record<string, string>;
		};
		expect(doc.catalog).toEqual({ range: "^1.2.0", tag: "latest" });

		await fs.rm(workspace, { recursive: true, force: true });
	});
});

describe("PackageCommand.assertAddable (B76)", () => {
	const item = (name: string, startx: StartXPackageJson["startx"]): PackageItem => ({
		type: "apps",
		path: `/t/${name}`,
		relativePath: name,
		name,
		packageJson: { name, startx } as StartXPackageJson,
	});
	const packages = [
		item("core-server", { requiredDevDeps: ["typescript-config"] }),
		item("typescript-config", { mode: "silent" }),
		item("startx-cli", { mode: "silent" }),
	];
	const check = (name: string) => () =>
		assertAddable.call(PackageCommand, packages, packages.find((pkg) => pkg.name === name)!);

	it("allows an ordinary package and a silent one that is a dependency", () => {
		expect(check("core-server")).not.toThrow();
		expect(check("typescript-config")).not.toThrow();
	});

	it("rejects a silent package nothing depends on", () => {
		expect(check("startx-cli")).toThrow(/internal to the StartX template/);
	});
});
