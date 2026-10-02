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
	// startx's own shadow of `.prettierrc.mjs` — repo-local only, see the file's own comment.
	".prettierrc.js": {
		tags: ["never"],
	},
	".prettierignore": {
		tags: ["prettier"],
	},
	"README.md": {
		tags: ["never"],
	},
	// Ships to the workspace root of every scaffold — it documents the monorepo conventions a
	// generated project inherits, not startx's own CLI — and with next-app, whose AGENTS.md holds the
	// block `next dev` would otherwise write into the app on its own (CLAUDE.md beside it imports it).
	"AGENTS.md": {
		tags: [],
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
	LICENSE: {
		tags: ["never"],
	},
	".env": {
		tags: ["never"],
	},
	// Every variable in it belongs to core-server / queue-worker (JWT, encryption, DB, Redis, SMTP).
	".env.example": {
		tags: ["backend"],
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
