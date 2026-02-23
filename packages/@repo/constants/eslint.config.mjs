import { baseConfig } from "eslint-config/base";

/** @type {import('eslint').Linter.Config[]} */
export default [
	// Spread the base config array
	...baseConfig,
	{
		rules: {
			"unicorn/filename-case": ["error", { case: "kebabCase" }],
		},
		// Note: basePath belongs inside languageOptions or simply isn't standard in flat config
		// unless defined by a specific plugin, so I omitted it here to avoid future errors.
	},
	// Add this block to disable the rule for config files
	{
		files: ["./src/**/*.ts"],
		rules: {
			"import-x/no-default-export": "off",
		},
	},
];
