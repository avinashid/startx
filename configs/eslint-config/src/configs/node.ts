import globals from "globals";
import tseslint from "typescript-eslint";

import { baseConfig } from "./base.js";

export const nodeConfig = tseslint.config(
	...baseConfig,

	// 1. Backend/Node Specific Globals & Environments
	{
		files: ["**/*.ts", "**/*.js", "**/*.cjs", "**/*.mjs"],
		languageOptions: {
			// "latest" perfectly aligns with Node 20+ (ES2023/ES2024 features)
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.node,
				...globals.nodeBuiltin, // Explicitly adds modern Node built-ins (like fetch, structuredClone)
			},
		},
	},

	// 2. Node-Specific Overrides & Best Practices
	{
		files: ["**/*.ts", "**/*.js"],
		rules: {
			// Enforce the 'node:' protocol for built-ins (e.g., `import fs from 'node:fs'`)
			// This is a modern Node.js standard that improves performance and security
			"unicorn/prefer-node-protocol": "error",

			// Prevent accidental use of obscure browser globals that sometimes slip through
			"no-restricted-globals": [
				"error",
				{
					name: "name",
					message: "Global 'name' is deprecated. Did you mean to declare a local variable?",
				},
				{
					name: "event",
					message: "Global 'event' is a browser feature. Do not use it in Node.js.",
				},
			],

			// In Node apps, developers often accidentally leave floating promises
			// which can cause unhandled promise rejections crashing the server.
			// (This inherits from baseConfig, but I am noting it here as a critical backend safeguard).
			// "@typescript-eslint/no-floating-promises": "error",
		},
	}
);
