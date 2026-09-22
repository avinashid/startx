import base from "./.prettierrc.cjs";

/**
 * Only copied into workspaces that chose "prettier + biome". Prettier resolves `.prettierrc.mjs`
 * ahead of `.prettierrc.cjs`, so this file wins there and hands every JS/TS file to biome:
 * `requirePragma` makes prettier skip files without an explicit `@format` comment, which keeps
 * the editor and a manual `prettier --write .` off biome's turf. Everything else — JSON, CSS,
 * markdown — is still formatted by prettier, and the shared options stay in `.prettierrc.cjs`.
 */
export default {
	...base,
	overrides: [
		{
			files: ["**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}"],
			options: { requirePragma: true },
		},
	],
};
