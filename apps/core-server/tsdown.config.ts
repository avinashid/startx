import { defineConfig } from "tsdown";
import { baseConfig, runtimeDependencies } from "tsdown-config";

export default defineConfig({
	...baseConfig,
	platform: "node",
	// sharp is native, so it stays external, pinned in dist/package.json, which the Dockerfile installs.
	plugins: [runtimeDependencies(["sharp"])],
	inlineOnly: false,
	noExternal: [/(.*)/],
	clean: false,
	outputOptions: {
		codeSplitting: false,
		preserveModules: false,
		legalComments: "none",
	},
});
