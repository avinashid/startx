import type { PackageJson } from "type-fest";

export type TAGS =
	| "required"
	| "common"
	| "app"
	| "biome"
	| "prettier"
	| "vitest"
	| "eslint"
	| "node"
	| "backend"
	| "frontend"
	| "react"
	| "extra";

export type SCRIPT = Record<string, Array<{ script: string; tags: TAGS[] }>>;

export type PackageDef<T extends string> = {
	source: string;
	dependencies?: T[];
	devDependencies?: T[];
	optional?: T[];
	dir?: string[];
	file?: string[];
	files?: string[];
	tags: TAGS[];
};

type NoInfer<T> = [T][T extends unknown ? 0 : never];

export const Packages = <T extends string>(config: Record<T, PackageDef<NoInfer<T>>>) => config;

export type PnpmWorkspace = {
	packages: string[];
	catalog?: Record<string, string>;
	catalogs?: Record<string, Record<string, string>>;
};

export type StartXPackageJson = PackageJson & {
	startx?: {
		tags?: TAGS[];
		required?: string[];
		isDev?: boolean;
	};
};
