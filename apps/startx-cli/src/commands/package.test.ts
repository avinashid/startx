import path from "node:path";
import { describe, expect, it } from "vitest";

import { PackageCommand } from "./package";

type Internals = { assertInsideWorkspace: (workspace: string, target: string, label: string) => string };
const { assertInsideWorkspace } = PackageCommand as unknown as Internals;
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
