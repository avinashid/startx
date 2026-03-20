import type { WHITELIST_DEPS } from "../types";

/* eslint-disable @typescript-eslint/naming-convention */
export const DepCheck: WHITELIST_DEPS = {
	"@biomejs/biome": {
		tags: ["common", "biome", "root"],
		version: "catalog:",
	},
	"prettier": {
		tags: ["common", "prettier", "root"],
		version: "catalog:",
	},
	"vitest": {
		tags: ["common", "vitest", "root"],
		version: "catalog:",
	},
	"tsdown": {
		tags: ["common", "tsdown", "root"],
		version: "catalog:",
	},
	"@types/node": {
		tags: ["common", "node", "root"],
		version: "catalog:",
		isDevDependency: true,
	},
	"typescript-config": {
		tags: ["common"],
		version: "workspace:^",
		isDevDependency: true,
	},
	"eslint-config": {
		tags: ["common", "eslint"],
		version: "workspace:^",
		isDevDependency: true,
	},
	"vitest-config": {
		tags: ["common", "vitest"],
		version: "workspace:^",
		isDevDependency: true,
	},
} as const;
