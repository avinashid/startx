/* eslint-disable @typescript-eslint/naming-convention */

import { Packages } from "../types";

export const packages = Packages({
	"eslint-config": {
		source: "./configs/eslint-config",
		dependencies: [],
		devDependencies: ["typescript-config"],
		optional: ["vitest-config"],
		dir: ["src"],
		file: ["plugins.d.ts"],
		tags: ["common"],
	},
	"typescript-config": {
		source: "./configs/typescript-config",
		dependencies: [],
		devDependencies: [],
		dir: [],
		files: ["tsconfig.common.json", "tsconfig.frontend.json", "tsconfig.node.json"],
		tags: ["required"],
	},
	"vitest-config": {
		source: "./configs/vitest-config",
		dependencies: ["typescript-config"],
		devDependencies: ["eslint-config"],
		dir: [],
		tags: ["required"],
	},
	"@repo/ui": {
		source: "./packages/ui",
		dependencies: [],
		devDependencies: ["typescript-config"],
		optional: ["eslint-config"],
		dir: [
			"src/components/lib",
			"src/components/util",
			"src/components/ilb",
			"src/components/util",
			"src/components/custom",
			"src/components/extensions",
			"src/components/hooks",
			"src/components/ui",
		],
		files: [
			"components.json",
			"tailwind.config.ts",
			"postcss.config.ts",
			"src/globals.css",
			"src/lucide.ts",
		],
		tags: ["common", "react"],
	},
	"@repo/constants": {
		source: "./packages/@repo/constants",
		dependencies: [],
		devDependencies: ["typescript-config"],
		optional: ["eslint-config"],
		dir: ["src"],
		tags: ["common"],
	},
	"@repo/env": {
		source: "./packages/@repo/env",
		dependencies: [],
		devDependencies: ["typescript-config"],
		optional: ["eslint-config", "vitest-config"],
		dir: ["src"],
		tags: ["common", "node"],
	},
	"@repo/db": {
		source: "./packages/@repo/db",
		dependencies: ["@repo/env"],
		devDependencies: ["typescript-config"],
		optional: ["eslint-config"],
		dir: ["src"],
		tags: ["common", "node"],
	},

	"@repo/lib": {
		source: "./packages/@repo/lib",
		dependencies: ["@repo/env", "@repo/mail", "@repo/db"],
		devDependencies: ["typescript-config"],
		optional: ["eslint-config", "vitest-config"],
		dir: ["src"],
		tags: ["common", "node"],
	},

	"@repo/mail": {
		source: "./packages/@repo/mail",
		dependencies: [],
		devDependencies: ["typescript-config"],
		optional: ["eslint-config"],
		dir: ["src"],
		tags: ["common", "node"],
	},
	"@repo/redis": {
		source: "./packages/@repo/redis",
		dependencies: [],
		devDependencies: ["typescript-config"],
		optional: ["eslint-config"],
		dir: ["src"],
		tags: ["common", "node", "extra"],
	},
});
