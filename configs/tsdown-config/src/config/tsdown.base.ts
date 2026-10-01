import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Rolldown } from "tsdown";
import { defineConfig } from "tsdown";

export const baseConfig = defineConfig({
	entry: ["./src/index.ts"],
	format: ["esm"],
	clean: true,
	target: "es2022",
	sourcemap: false,
	minify: true,
	treeshake: true,
	shims: true,
	unbundle: false,
	external: [/^@unrs\//],
});

/** Finds the package directory Node would load `name` from for `importer`, walking up `node_modules`. */
const findPackageDir = (name: string, importer: string): string | undefined => {
	let dir = dirname(importer);
	for (;;) {
		const candidate = join(dir, "node_modules", name);
		if (existsSync(join(candidate, "package.json"))) return candidate;
		const parent = dirname(dir);
		if (parent === dir) return undefined;
		dir = parent;
	}
};

/**
 * Keeps `names` out of the bundle and writes `package.json` next to it, pinning each one that the
 * bundle imports to the exact version the workspace resolved (i.e. the lockfile's). A runtime image
 * then installs from that manifest, so the externals it ships always match what was built and tested.
 *
 * Only names the bundle imports are written. A package that a listed one loads by itself comes in
 * through its dependencies or peers (`@bull-board/ui` is a peer of `@bull-board/api`), unless it
 * leaves it undeclared, as `@bull-board/api` does `bullmq`: list such a package too.
 */
export const runtimeDependencies = (names: string[]): Rolldown.Plugin => {
	const pinned = new Map<string, string>();
	return {
		name: "startx:runtime-dependencies",
		buildStart() {
			pinned.clear();
		},
		resolveId: {
			order: "pre",
			handler(source, importer) {
				const name = names.find((n) => source === n || source.startsWith(`${n}/`));
				if (!name) return null;
				if (importer) {
					const dir = findPackageDir(name, importer);
					if (!dir) this.error(`${name} is imported by ${importer} but is not installed`);
					const { version } = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string };
					const previous = pinned.get(name);
					if (previous && previous !== version) {
						this.error(`${name} resolves to both ${previous} and ${version}; the runtime image can only install one`);
					}
					pinned.set(name, version);
				}
				return { id: source, external: true };
			},
		},
		generateBundle(outputOptions) {
			// `node dist/index.mjs` inside the workspace (the app's `start`) resolves externals from the
			// app's own node_modules, not from the importer's. A package only a library depends on
			// would install in the image yet fail there, so require it to resolve here, at the same version.
			const entry = join(outputOptions.dir ?? "dist", "index.mjs");
			for (const [name, version] of pinned) {
				const dir = findPackageDir(name, entry);
				const found =
					dir && (JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as { version: string }).version;
				if (found !== version) {
					this.error(
						`${name}@${version} is external, but the app resolves ${found ? `${name}@${found}` : "no copy of it"}: add "${name}": "catalog:" to its dependencies`,
					);
				}
			}
			const dependencies = Object.fromEntries([...pinned].sort(([a], [b]) => a.localeCompare(b)));
			this.emitFile({
				type: "asset",
				fileName: "package.json",
				source: `${JSON.stringify({ private: true, type: "module", dependencies }, null, "\t")}\n`,
			});
		},
	};
};
