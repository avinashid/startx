import type { WHITELIST_FILES } from "../types";

export const FileCheck: WHITELIST_FILES = {
	"startx.json": {
		tags: ["never"],
	},
	".npmignore": {
		tags: ["never"],
	},
	".npmrc": {
		tags: ["never"],
	},
	".prettier.js": {
		tags: ["prettier"],
	},
	".prettierignore": {
		tags: ["biome"],
	},
	"biome.json": {
		tags: ["biome"],
	},
	"pnpm-lock.yaml": {
		tags: ["never"],
	},
	"pnpm-workspace.yaml": {
		tags: ["root"],
	},
	"turbo.json": {
		tags: ["root"],
	},
	"LICENSE": {
		tags: ["never"],
	},
	".env": {
		tags: ["never"],
	},
	"tsdown.config.ts": {
		tags: ["tsdown"],
	},
	"eslint.config.ts": {
		tags: ["eslint", "node"],
	},
	"vitest.config.ts": {
		tags: ["vitest", "node"],
	},
	"package.json": {
		tags: ["never"],
	},
};
