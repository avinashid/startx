import nextPlugin from "@next/eslint-plugin-next";
import { extend } from "eslint-config/extend";
import { frontendConfig } from "eslint-config/frontend";

export default extend(
	{ ignores: [".next/**", "next-env.d.ts", "postcss.config.mjs"] },
	frontendConfig,
	{
		plugins: { "@next/next": nextPlugin },
		rules: { ...nextPlugin.configs.recommended.rules, ...nextPlugin.configs["core-web-vitals"].rules },
	},
	{
		// Route handlers are named after the HTTP method they answer; Next requires it.
		files: ["src/app/**/route.ts"],
		rules: {
			"@typescript-eslint/naming-convention": [
				"warn",
				{ selector: "function", format: ["camelCase"] },
				{
					selector: "function",
					filter: { regex: "^(GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)$", match: true },
					format: null,
				},
			],
		},
	},
);
