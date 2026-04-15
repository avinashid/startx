import { fixupPluginRules } from "@eslint/compat";
import eslintConfigPrettier from "eslint-config-prettier";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

import { baseConfig } from "./base.js";

const baseWithoutPrettier = baseConfig.filter(config => config !== eslintConfigPrettier);

export const frontendConfig = tseslint.config(
	...baseWithoutPrettier,

	// 1. Frontend Ignores
	{
		ignores: ["**/coverage/**", "**/storybook-static/**", "**/*.snap", "**/*.d.ts"],
	},

	// 2. Browser/React Globals & Settings
	{
		files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
		languageOptions: {
			globals: {
				...globals.browser,
				...globals.serviceworker,
			},
		},
		settings: {
			react: {
				version: "detect",
			},
		},
	},

	// 3. React Recommended Configs
	reactPlugin.configs.flat.recommended as any,
	reactPlugin.configs.flat["jsx-runtime"] as any,

	// 4. React, Hooks, and Accessibility Rules
	{
		files: ["**/*.tsx", "**/*.jsx"],
		plugins: {
			"react-hooks": fixupPluginRules(reactHooksPlugin as any),
			"jsx-a11y": fixupPluginRules(jsxA11yPlugin),
		},
		rules: {
			...reactHooksPlugin.configs.recommended.rules,
			...jsxA11yPlugin.configs.recommended.rules,

			// --- Naming Convention Override for React ---
			// Allows PascalCase for functional components while keeping variables camelCase
			"@typescript-eslint/naming-convention": [
				"warn",
				{ selector: "default", format: ["camelCase"] },
				{ selector: "function", format: ["camelCase", "PascalCase"] },
				{ selector: "import", format: ["camelCase", "PascalCase"] },
				{
					selector: "variable",
					format: ["camelCase", "snake_case", "UPPER_CASE", "PascalCase"],
					leadingUnderscore: "allow",
				},
				{ selector: "typeLike", format: ["PascalCase"] },
			],

			// --- React Specifics ---
			"react/prop-types": "off", // Using TS interfaces instead
			"react/react-in-jsx-scope": "off", // Not needed for React 17+
			"react/jsx-uses-react": "off", // Not needed for React 17+
			"react/display-name": "warn",
			"react/no-unescaped-entities": "warn",
			"react/jsx-no-leaked-render": ["error", { validStrategies: ["ternary", "coerce"] }],

			// --- React Hooks Specifics ---
			"react-hooks/rules-of-hooks": "error",
			"react-hooks/exhaustive-deps": "warn",

			// --- Accessibility (a11y) Specifics ---
			"jsx-a11y/no-autofocus": "warn",
			"jsx-a11y/click-events-have-key-events": "warn",
			"jsx-a11y/no-static-element-interactions": "warn",
			"jsx-a11y/anchor-is-valid": "warn",
			"jsx-a11y/no-onchange": "off", // Deprecated rule, fine to turn off
		},
	},

	{
		files: ["**/emails/**/*.tsx", "**/emails/**/*.jsx"],
		rules: {
			"react/react-in-jsx-scope": "error",
			"react/jsx-uses-react": "error",
		},
	},

	eslintConfigPrettier
);
