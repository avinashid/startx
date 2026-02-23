import { defineConfig } from "tsdown";
import { baseConfig } from "tsdown-config";

export default defineConfig({
  ...baseConfig,
	platform: "node",
	external: ["sharp"],
  noExternal: [/(.*)/],
	outputOptions: {
		codeSplitting: false,
		preserveModules: false,
		legalComments: "none"
	},
});
