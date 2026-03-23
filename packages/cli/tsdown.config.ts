import { defineConfig } from "tsdown";
import { baseConfig } from "tsdown-config";

export default defineConfig({
	...baseConfig,
	platform: "node",
	external: ["sharp"],
	noExternal: [/(.*)/],
	inlineOnly: false,
	outputOptions: {
		codeSplitting: false,
		preserveModules: false,
		legalComments: "none",
	},
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
});
