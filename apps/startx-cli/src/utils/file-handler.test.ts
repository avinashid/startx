import { describe, expect, it } from "vitest";

import { FileHandler } from "./file-handler";

describe("FileHandler.handlePackageJson", () => {
	it("strips script names listed in startx.ignore (B48)", () => {
		const { packageJson } = FileHandler.handlePackageJson({
			app: { name: "typescript-config", startx: { ignore: ["typecheck"] } },
			tags: ["node", "common"],
		});

		const scripts = packageJson.scripts as Record<string, string>;
		expect(scripts.typecheck).toBeUndefined();
		expect(scripts.clean).toBeDefined();
	});

	it("keeps typecheck when it is not ignored", () => {
		const { packageJson } = FileHandler.handlePackageJson({
			app: { name: "tsdown-config", startx: { ignore: ["eslint-config"] } },
			tags: ["node", "common"],
		});

		expect((packageJson.scripts as Record<string, string>).typecheck).toBe("tsc --noEmit");
	});
});
