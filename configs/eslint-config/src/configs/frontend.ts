import { fixupPluginRules } from "@eslint/compat";
import eslintConfigPrettier from "eslint-config-prettier";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import reactPlugin from "eslint-plugin-react";
// eslint-plugin-react-hooks@5 is CJS with no `default` key; esModuleInterop resolves it at runtime.
// eslint-disable-next-line import-x/default
import reactHooksPlugin from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

import { baseConfig } from "./base.js";

const baseWithoutPrettier = baseConfig.filter((config) => config !== eslintConfigPrettier);

// The second lint pass for frontend packages. oxlint runs `src/oxlint/frontend.json` first, which
// carries the React, hooks and accessibility rules. See base.ts for how the two passes split.
export const frontendConfig = tseslint.config(
	...baseWithoutPrettier,

	// 1. Frontend Ignores
	{
		ignores: ["**/coverage/**", "**/storybook-static/**", "**/*.snap", "**/*.d.ts", "**/.react-router/**"],
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

	// 3. React rules from the recommended set that oxlint does not implement. jsx-uses-vars lets
	// unused-imports see a variable that is only used in JSX.
	{
		plugins: {
			react: reactPlugin,
			"react-hooks": fixupPluginRules(reactHooksPlugin as any),
			"jsx-a11y": fixupPluginRules(jsxA11yPlugin),
		},
		rules: {
			"react/jsx-uses-vars": "error",
			"react/no-deprecated": "error",
			"react/require-render-return": "error",
		},
	},

	// 4. Components
	{
		files: ["**/*.tsx", "**/*.jsx"],
		rules: {
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

			"react/jsx-no-leaked-render": ["error", { validStrategies: ["ternary", "coerce"] }],
		},
	},

	// Emails render with the classic runtime, so React must count as used where JSX appears.
	{
		files: ["**/emails/**/*.tsx", "**/emails/**/*.jsx"],
		rules: {
			"react/jsx-uses-react": "error",
		},
	},

	eslintConfigPrettier,
);
