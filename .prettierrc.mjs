import base from "./.prettierrc.cjs";

/**
 * Only copied into workspaces that chose "prettier + biome". Prettier resolves `.prettierrc.mjs`
 * ahead of `.prettierrc.cjs`, so this file wins there and hands every JS/TS file to biome:
 * `requirePragma` makes prettier skip files without an explicit `@format` comment, which keeps
 * the editor and a manual `prettier --write .` off biome's turf. Everything else — JSON, CSS,
 * markdown — is still formatted by prettier, and the shared options stay in `.prettierrc.cjs`.
 *
 * This repo is itself the template source, so `.prettierrc.js` shadows this file here (prettier
 * resolves it first) to keep `requirePragma` out of startx's own `format` / `format:check`.
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
