import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MEMORY_DB, prepareDbPath, resolveDbPath, workspaceRoot } from "./path.js";

let tmp: string;

beforeEach(() => {
	tmp = fs.mkdtempSync(path.join(os.tmpdir(), "db-sqlite-"));
});

afterEach(() => {
	fs.rmSync(tmp, { recursive: true, force: true });
});

describe("resolveDbPath", () => {
	it("passes :memory: and absolute paths through", () => {
		expect(resolveDbPath(MEMORY_DB, tmp)).toBe(MEMORY_DB);
		expect(resolveDbPath("/var/lib/app.db", tmp)).toBe("/var/lib/app.db");
	});

	it("anchors a relative path at the workspace root, from any package inside it", () => {
		fs.writeFileSync(path.join(tmp, "pnpm-workspace.yaml"), "packages: []\n");
		const pkg = path.join(tmp, "packages", "@db", "sqlite");
		const app = path.join(tmp, "apps", "core-server");
		fs.mkdirSync(pkg, { recursive: true });
		fs.mkdirSync(app, { recursive: true });

		expect(workspaceRoot(pkg)).toBe(tmp);
		expect(resolveDbPath("data/app.db", pkg)).toBe(path.join(tmp, "data", "app.db"));
		expect(resolveDbPath("data/app.db", app)).toBe(resolveDbPath("data/app.db", pkg));
	});

	it("falls back to the starting directory outside a workspace", () => {
		expect(resolveDbPath("data/app.db", tmp)).toBe(path.join(tmp, "data", "app.db"));
	});
});

describe("prepareDbPath", () => {
	it("creates the parent directory, not the file", () => {
		const resolved = prepareDbPath("nested/dir/app.db", tmp);
		expect(fs.statSync(path.dirname(resolved)).isDirectory()).toBe(true);
		expect(fs.existsSync(resolved)).toBe(false);
	});
});
