/* eslint-disable @typescript-eslint/naming-convention */
import type { PackageJson } from "type-fest";

export type TAGS =
	// Always installs
	| "common"
	// Used for apps
	| "runnable"
	// Formatter tags
	| "biome"
	| "prettier"
	| "eslint"
	// Testing tags
	| "vitest"
	// Build tags
	| "tsdown"
	// Backend tags
	| "node"
	| "backend"
	| "express"
	// Frontend tags
	| "frontend"
	| "react"
	// Cli tags
	| "cli"
	| "commander"
	// Mail
	| "mail"
	// Never installs or ignore
	| "never"
	// For handling workspace only files and scripts
	| "root"
	// Database tags
	| "db"
	| "drizzle";

export type SCRIPT = Record<string, Array<{ script: string; tags: TAGS[] }>>;

export type WHITELIST_DEPS = Record<
	string,
	{ tags: TAGS[]; version: string; isDevDependency?: boolean }
>;
export type WHITELIST_FILES = Record<string, { tags: TAGS[] }>;

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
		mode?: "silent" | "standalone";
		tags?: TAGS[]; // self tags (can be used to identify this package)
		iTags?: TAGS[]; // install tags (must be available to install packages)
		gTags?: TAGS[]; // global tags (to be pushed globally if installed)
		requiredDeps?: string[];
		requiredDevDeps?: string[];
		ignore?: string[];
	};
};
