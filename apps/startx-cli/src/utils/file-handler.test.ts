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

	// The tags init gives next-app in a workspace that also has core-server: tsdown is global then,
	// and the generic tsdown build / node start entries match too. First match wins, so the next
	// entries have to come before them.
	it("gives a Next.js app the next scripts, not the tsdown or node ones", () => {
		const { packageJson } = FileHandler.handlePackageJson({
			app: { name: "next-app", startx: { tags: ["nextjs"] } },
			tags: [
				"common",
				"node",
				"react",
				"frontend",
				"backend",
				"tsdown",
				"eslint",
				"vitest",
				"biome",
				"prettier",
				"runnable",
				"nextjs",
			],
		});

		expect(packageJson.scripts).toMatchObject({
			dev: "next dev --port 3001",
			build: "next build",
			start: "next start --port 3001",
			typecheck: "next typegen && tsc --noEmit",
			clean: "rimraf .next .turbo",
			"deep:clean": "rimraf node_modules .next .turbo",
			lint: "eslint .",
			test: "vitest run",
			"format:check": "biome ci .",
		});
	});

	it("leaves a backend app's scripts alone when nextjs is in the workspace", () => {
		const { packageJson } = FileHandler.handlePackageJson({
			app: { name: "core-server", startx: { tags: ["express"] } },
			tags: ["common", "node", "react", "frontend", "backend", "tsdown", "runnable", "express"],
		});

		expect(packageJson.scripts).toMatchObject({
			build: "tsdown --config-loader unrun",
			start: "node dist/index.mjs",
			typecheck: "tsc --noEmit",
			clean: "rimraf dist build .turbo",
		});
	});
});
