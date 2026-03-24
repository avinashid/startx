import type { WHITELIST_DEPS } from "../types";

/* eslint-disable @typescript-eslint/naming-convention */
export const DepCheck: WHITELIST_DEPS = {
	"@biomejs/biome": {
		tags: ["node", "biome", "root"],
		version: "catalog:",
	},
	"prettier": {
		tags: ["node", "prettier", "root"],
		version: "catalog:",
	},
	"eslint": {
		tags: ["node", "eslint", "root"],
		version: "catalog:",
	},
	"vitest": {
		tags: ["node", "vitest", "root"],
		version: "catalog:",
	},
	"tsdown": {
		tags: ["node", "tsdown", "root"],
		version: "catalog:",
	},
	"tsdown-config": {
		tags: ["node", "tsdown", "runnable"],
		version: "catalog:",
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
