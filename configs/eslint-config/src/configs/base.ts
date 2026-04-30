import { fixupPluginRules } from "@eslint/compat";
import eslintConfigPrettier from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import-x";
import lodashPlugin from "eslint-plugin-lodash";
import unicornPlugin from "eslint-plugin-unicorn";
import unusedImportsPlugin from "eslint-plugin-unused-imports";
import globals from "globals";
import tseslint from "typescript-eslint";
import { localRulesPlugin } from "../plugin.js";

// Exported as a standard array for Flat Config
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

	// 2. Base Configurations
	...tseslint.configs.recommended,
	...tseslint.configs.recommendedTypeChecked,
	importPlugin.flatConfigs.recommended as any,
	importPlugin.flatConfigs.typescript as any,

	// 3. Main Configuration
	{
		plugins: {
			"unused-imports": fixupPluginRules(unusedImportsPlugin),
			lodash: fixupPluginRules(lodashPlugin),
			unicorn: unicornPlugin,
			"local-rules": localRulesPlugin,
		},
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: {
				...globals.node,
				...globals.es2021,
			},
			parserOptions: {
				projectService: true,
				tsconfigRootDir: import.meta.dirname,
			},
		},
		// ADDED: Settings block to correctly resolve TypeScript imports
		settings: {
			"import-x/resolver": {
				typescript: {
					alwaysTryTypes: true,
					project: true,
				},
				node: true,
			},
		},
		rules: {
			// Core Rules
			"no-void": ["error", { allowAsStatement: true }],
			"no-constant-binary-expression": "error",
			"no-console": ["warn", { allow: ["warn", "error", "info"] }], // Allowed info for debugging
			eqeqeq: ["warn", "always", { null: "ignore" }],
			"object-shorthand": "warn",
			"prefer-const": "warn",

			// TypeScript Quality of Life
			"@typescript-eslint/await-thenable": "error",
			"@typescript-eslint/no-floating-promises": ["error", { ignoreVoid: true }],
			"@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: false }],
			"@typescript-eslint/only-throw-error": "error",
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/no-unsafe-assignment": "warn",
			"@typescript-eslint/no-unsafe-argument": "warn",
			"@typescript-eslint/no-unsafe-call": "warn",
			"@typescript-eslint/no-unsafe-return": "off",
			"@typescript-eslint/no-unsafe-member-access": ["warn", { allowOptionalChaining: true }],
			"@typescript-eslint/array-type": ["warn", { default: "array-simple" }],
			"@typescript-eslint/return-await": ["warn", "always"],
			"@typescript-eslint/no-empty-object-type": ["warn"],

			// Naming Conventions (Relaxed for APIs and strict for standard code)
			"@typescript-eslint/naming-convention": [
				"warn",
				{ "selector": "default", "format": ["camelCase"] },
				{ "selector": "import", "format": ["camelCase", "PascalCase"] },
				{
					"selector": "variable",
					"format": ["camelCase", "snake_case", "UPPER_CASE", "PascalCase"],
					"leadingUnderscore": "allow",
				},
				{
					"selector": "parameter",
					"format": ["camelCase"],
					"leadingUnderscore": "allow",
				},
				{
					"selector": "classProperty",
					"format": ["camelCase"],
					"leadingUnderscore": "allow",
				},
				{ "selector": "typeLike", "format": ["PascalCase"] },
				{
					"selector": ["objectLiteralProperty", "typeProperty"],
					"format": null,
				},
			],

			// Handled entirely by unused-imports
			"@typescript-eslint/no-unused-vars": "off",
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

			// Imports
			"import-x/no-cycle": "off",
			"import-x/no-named-as-default": "off",
			"import-x/no-duplicates": "warn",
			"import-x/order": [
				"warn",
				{
					alphabetize: { order: "asc", caseInsensitive: true },
					groups: [["builtin", "external"], "internal", ["parent", "index", "sibling"], "object"],
					// "newlines-between": "always",
				},
			],

			// Plugins
			"unicorn/no-unnecessary-await": "warn",
			"unicorn/no-useless-promise-resolve-reject": "warn",
			"lodash/path-style": ["warn", "as-needed"],
			"lodash/import-scope": ["warn", "method"],
		},
	},

	// 4. Test Overrides
	{
		files: ["test/**/*.ts", "**/__tests__/*.ts", "**/*.test.ts", "**/*.cy.ts", "**/*.spec.ts"],
		rules: {
			"local-rules/no-plain-errors": "off",
			"@typescript-eslint/unbound-method": "off",
			"@typescript-eslint/no-unsafe-call": "off",
			"@typescript-eslint/no-unsafe-member-access": "off",
		},
	},

	// 5. Prettier (Must be absolutely last)
	eslintConfigPrettier
);
