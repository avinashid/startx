import { defineConfig } from "eslint/config";
import { baseConfig } from "eslint-config/base";

export default defineConfig(
	baseConfig,
	{
		rules: {
			"unicorn/filename-case": ["error", { case: "kebabCase" }],
			"local-rules/no-unneeded-backticks": "off",
		},
	},
	{
		files: ["**/*.test.ts"],
		rules: {
			"@typescript-eslint/no-unused-expressions": "warn",
			"@typescript-eslint/no-unsafe-assignment": "warn",
			"@typescript-eslint/unbound-method": "warn",
			"import-x/no-duplicates": "warn",
		},
	},
);
