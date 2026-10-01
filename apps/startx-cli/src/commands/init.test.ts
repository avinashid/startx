import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { TAGS } from "../types";
import { InitCommand, shellQuote } from "./init";

type Internals = {
	copyValidatedFilesFromFolder: (source: string, destination: string, tags: Set<TAGS>) => Promise<void>;
	assertSafeToClear: (workspace: string) => Promise<string>;
};
const { copyValidatedFilesFromFolder, assertSafeToClear } = InitCommand as unknown as Internals;
const copy = (source: string, destination: string) =>
	copyValidatedFilesFromFolder.call(InitCommand, source, destination, new Set<TAGS>(["root"]));

let tmp: string;
beforeEach(async () => {
	tmp = await fs.mkdtemp(path.join(os.tmpdir(), "startx-init-test-"));
	await fs.mkdir(path.join(tmp, "src"));
	await fs.writeFile(path.join(tmp, "src", "tsconfig.json"), "{}");
});
afterEach(async () => {
	vi.restoreAllMocks();
	await fs.rm(tmp, { recursive: true, force: true });
});

describe("InitCommand.copyValidatedFilesFromFolder (B60)", () => {
	it("throws when a file cannot be copied instead of logging and carrying on", async () => {
		// A regular file where the destination directory should be: every copy fails with ENOTDIR.
		await fs.writeFile(path.join(tmp, "blocker"), "");
		await expect(copy(path.join(tmp, "src"), path.join(tmp, "blocker"))).rejects.toThrow(
			/Failed to copy tsconfig\.json/,
		);
	});

	it("copies normally when the destination is writable", async () => {
		await copy(path.join(tmp, "src"), path.join(tmp, "out"));
		await expect(fs.readFile(path.join(tmp, "out", "tsconfig.json"), "utf8")).resolves.toBe("{}");
	});
});

describe("InitCommand.assertSafeToClear", () => {
	const clearFrom = async (cwd: string, target: string) => {
		vi.spyOn(process, "cwd").mockReturnValue(cwd);
		return await assertSafeToClear.call(InitCommand, target);
	};

	it("refuses an ancestor of a cwd whose first segment starts with '..'", async () => {
		// path.relative(tmp, tmp/..foo) is "..foo": a prefix test reads that as outside the target.
		const cwd = path.join(tmp, "..foo");
		await fs.mkdir(cwd);
		await expect(clearFrom(cwd, tmp)).rejects.toThrow(/current directory or one of its ancestors/);
	});

	it("refuses a plain parent of the cwd", async () => {
		await expect(clearFrom(path.join(tmp, "src"), tmp)).rejects.toThrow(/current directory or one of its ancestors/);
	});

	it("allows a sibling of the cwd", async () => {
		const cwd = path.join(tmp, "..foo");
		const target = path.join(tmp, "target");
		await fs.mkdir(cwd);
		await fs.mkdir(target);
		await expect(clearFrom(cwd, target)).resolves.toBe(await fs.realpath(target));
	});
});

describe("shellQuote", () => {
	it("leaves a plain path alone and quotes one a shell would split", () => {
		expect(shellQuote("my-app")).toBe("my-app");
		expect(shellQuote("../apps/@scope/x.y")).toBe("../apps/@scope/x.y");
		expect(shellQuote("my app")).toBe("'my app'");
		expect(shellQuote("it's $HOME")).toBe(`'it'\\''s $HOME'`);
	});
});
