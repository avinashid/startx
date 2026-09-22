import type { WHITELIST_FILES } from "../types";

export const FileCheck: WHITELIST_FILES = {
	"startx.json": {
		tags: ["never"],
	},
	".npmrc": {
		tags: ["never"],
	},
	".prettierrc.cjs": {
		tags: ["prettier"],
	},
	// Resolved by prettier ahead of `.prettierrc.cjs`, which is how a prettier + biome
	// workspace keeps prettier off the JS/TS files biome owns. It imports `.prettierrc.cjs`,
	// so it must never ship without it — hence both tags.
	".prettierrc.mjs": {
		tags: ["prettier", "biome"],
	},
	".prettierignore": {
		tags: ["prettier"],
	},
	"README.md": {
		tags: ["never"],
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
