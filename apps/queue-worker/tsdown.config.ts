import { defineConfig } from "tsdown";
import { baseConfig } from "tsdown-config";

export default defineConfig({
	...baseConfig,
	platform: "node",
	// @bull-board/api locates @bull-board/ui with an eval'd require.resolve, which an ESM bundle
	// cannot satisfy (B68). Keep it external; the Dockerfile installs it into the runtime image.
	external: ["sharp", /^@bull-board\//],
	inlineOnly: false,
	noExternal: [/(.*)/],
	clean: false,
	outputOptions: {
		codeSplitting: false,
		preserveModules: false,
		legalComments: "none",
	},
});
