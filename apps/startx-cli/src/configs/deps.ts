import type { WHITELIST_DEPS } from "../types";

export const DepCheck: WHITELIST_DEPS = {
	"@biomejs/biome": {
		tags: ["node", "biome", "root"],
		version: "catalog:",
		isDevDependency: true,
	},
	"prettier": {
		tags: ["node", "prettier", "root"],
		version: "catalog:",
		isDevDependency: true,
	},
	"eslint": {
		tags: ["node", "eslint", "root"],
		version: "catalog:",
		isDevDependency: true,
	},
	"vitest": {
		tags: ["node", "vitest", "root"],
		version: "catalog:",
		isDevDependency: true,
	},
	"tsdown": {
		isDevDependency: true,
		tags: ["node", "tsdown", "root"],
		version: "catalog:",
	},
	"tsdown-config": {
		tags: ["node", "tsdown", "runnable"],
		version: "workspace:^",
		isDevDependency: true,
	},
	"@types/node": {
		tags: ["node", "root"],
		version: "catalog:",
		isDevDependency: true,
	},
	"typescript-config": {
		tags: ["node"],
		version: "workspace:^",
		isDevDependency: true,
	},
	"eslint-config": {
		tags: ["node", "eslint"],
		version: "workspace:^",
		isDevDependency: true,
	},
	"vitest-config": {
		tags: ["node", "vitest"],
		version: "workspace:^",
		isDevDependency: true,
	},
} as const;
