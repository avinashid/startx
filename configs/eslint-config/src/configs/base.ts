import { fixupPluginRules } from "@eslint/compat";
import eslintConfigPrettier from "eslint-config-prettier";
import { createTypeScriptImportResolver } from "eslint-import-resolver-typescript";
import importPlugin, { createNodeResolver } from "eslint-plugin-import-x";
import lodashPlugin from "eslint-plugin-lodash";
import unicornPlugin from "eslint-plugin-unicorn";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";
import { localRulesPlugin } from "../plugin.js";

// Linting is two passes. oxlint runs first, with `src/oxlint/base.json`: every rule it implements,
// the type-aware ones included (on TypeScript 7, through oxlint-tsgolint). This config is the second
// pass and holds only the rules oxlint does not implement. None of them needs type information, so
// the parser builds no TypeScript program, which is where ESLint's time went.
//
// Every plugin stays registered even when none of its rules run here: oxlint honours
// `eslint-disable` comments, and a comment naming a rule from an unregistered plugin is an error.
export const baseConfig = tseslint.config(
	// 1. Global Ignores
	{
		ignores: [
			"**/node_modules/**",
			"**/dist/**",
			"**/build/**",
			"**/.next/**",
			"eslint.config.ts",
			"tsup.config.ts",
			"jest.config.js",
			"cypress.config.js",
			"vite.config.ts",
			"vitest.config.ts",
			"tsdown.config.ts",
			"drizzle.config.ts",
		],
	},

	// 2. Parser and plugins, without any preset's rules. ESLint only lints a file some entry names in
	// `files`, and its defaults cover JS alone; the recommended preset used to name the TS extensions.
	tseslint.configs.base,
	{ files: ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"] },

	// 3. Main Configuration
	{
		plugins: {
			"import-x": importPlugin,
			"unused-imports": fixupPluginRules(unusedImportsPlugin),
			lodash: fixupPluginRules(lodashPlugin),
			unicorn: unicornPlugin,
			"local-rules": localRulesPlugin,
		},
		linterOptions: {
			// A disable comment for a rule oxlint runs suppresses nothing in this pass, so this pass
			// cannot tell whether it is unused.
			reportUnusedDisableDirectives: "off",
		},
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.node,
				...globals.es2021,
			},
		},
		settings: {
			...importPlugin.flatConfigs.typescript.settings,
			// The v3 resolver interface: the resolvers are built once here, instead of being looked up by
			// hashing their options on every import.
			"import-x/resolver": undefined,
			"import-x/resolver-next": [createTypeScriptImportResolver({ alwaysTryTypes: true }), createNodeResolver()],
		},
		rules: {
			// Naming Conventions (Relaxed for APIs and strict for standard code). oxlint has no equivalent.
			"@typescript-eslint/naming-convention": [
				"warn",
				{ selector: "default", format: ["camelCase"] },
				{ selector: "import", format: ["camelCase", "PascalCase"] },
				{
					selector: "variable",
					format: ["camelCase", "snake_case", "UPPER_CASE", "PascalCase"],
					leadingUnderscore: "allow",
				},
				{
					selector: "parameter",
					format: ["camelCase"],
					leadingUnderscore: "allow",
				},
				{
					selector: "classProperty",
					format: ["camelCase"],
					leadingUnderscore: "allow",
				},
				{ selector: "typeLike", format: ["PascalCase"] },
				{
					selector: ["objectLiteralProperty", "typeProperty"],
					format: null,
				},
			],

			// Unused imports and variables, with the autofix that removes unused imports.
			"unused-imports/no-unused-imports": "warn",
			"unused-imports/no-unused-vars": [
				"warn",
				{
					vars: "all",
					varsIgnorePattern: "^_",
					args: "after-used",
					argsIgnorePattern: "^_",
				},
			],

			// Imports. oxlint has no `order`, and its `default` lets `import React from "react"` through,
			// which B45 requires to fail. typecheck covers what `namespace`, `export` and `no-unresolved`
			// would report.
			"import-x/default": "error",
			"import-x/order": [
				"warn",
				{
					alphabetize: { order: "asc", caseInsensitive: true },
					groups: [["builtin", "external"], "internal", ["parent", "index", "sibling"], "object"],
					// "newlines-between": "always",
				},
			],

			// Plugins oxlint can only load as alpha JS plugins.
			"lodash/path-style": ["warn", "as-needed"],
			"lodash/import-scope": ["warn", "method"],
		},
	},

	// 4. Test Overrides
	{
		files: ["test/**/*.ts", "**/__tests__/*.ts", "**/*.test.ts", "**/*.cy.ts", "**/*.spec.ts"],
		rules: {
			"local-rules/no-plain-errors": "off",
		},
	},

	// 5. Prettier (Must be absolutely last)
	eslintConfigPrettier,
);
