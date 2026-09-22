import { defineConfig } from "tsdown";
import { baseConfig } from "tsdown-config";

export default defineConfig({
	...baseConfig,
	// The published binary lives outside dist/ on purpose: the root package.json
	// `files` allowlist excludes every build directory, and re-including one file
	// from inside an excluded directory behaves differently on npm 8, npm >=9 and
	// pnpm. `bin/` is matched by the plain "apps/" entry, so no packer-specific
	// re-include or bin force-include is involved.
	outDir: "bin",
	platform: "node",
	external: ["sharp"],
	inlineOnly: false,
	noExternal: [/(.*)/],
	outputOptions: {
		codeSplitting: false,
		preserveModules: false,
		legalComments: "none",
	},
	define: {
		"process.env.NODE_ENV": JSON.stringify("production"),
	},
});
