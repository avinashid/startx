import { defineConfig } from "tsdown";
import { baseConfig, runtimeDependencies } from "tsdown-config";

export default defineConfig({
	...baseConfig,
	platform: "node",
	// @bull-board/api locates @bull-board/ui with an eval'd require.resolve, which an ESM bundle
	// cannot satisfy (B68), and its BullMQ adapter requires bullmq without declaring it, so bullmq
	// must be a real package next to it. sharp is native. All stay external, pinned in
	// dist/package.json, which the Dockerfile installs into the runtime image.
	plugins: [runtimeDependencies(["sharp", "bullmq", "@bull-board/api", "@bull-board/express"])],
	inlineOnly: false,
	noExternal: [/(.*)/],
	clean: false,
	outputOptions: {
		codeSplitting: false,
		preserveModules: false,
		legalComments: "none",
	},
});
