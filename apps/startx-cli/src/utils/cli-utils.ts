import { defineEnv } from "@repo/env";
import { fsTool } from "@repo/lib/file-system-module";
import path from "path";
import { fileURLToPath } from "url";
import z from "zod";

import type { PnpmWorkspace, StartXPackageJson } from "../types";

export type PackageItem = {
	type: "apps" | "configs" | "packages";
	path: string;
	relativePath: string;
	name: string;
	packageJson: StartXPackageJson;
};

const ENV = defineEnv({
	STARTX_ENV: z.enum(["development", "production", "test", "staging"]).default("production"),
});

export class CliUtils {
	static getDirectory() {
		const __filename = fileURLToPath(import.meta.url);
		let template = path.dirname(__filename);
		const workspace = process.cwd();

		if (ENV.STARTX_ENV === "development") {
			template = path.resolve(template, "../../../../");
		} else {
			template = path.resolve(template, "../../../");
		}

		return {
			template,
			workspace,
		};
	}

	static async getPackageList(): Promise<PackageItem[]> {
		const cliDirectory = this.getDirectory().template;

		const fetchPackages = async (
			subPath: string,
			type: "apps" | "configs" | "packages",
			namePrefix = "",
			filterFn?: (name: string) => boolean
		): Promise<PackageItem[]> => {
			const dirPath = path.join(cliDirectory, ...subPath.split("/"));

			try {
				let names = await fsTool.listDirectories({ dir: dirPath });
				if (filterFn) names = names.filter(filterFn);

				const packages = await Promise.all(
					names.map(async name => {
						const pkgPath = path.join(dirPath, name);
						const relativePath = path.relative(cliDirectory, pkgPath);
						const pkgName = namePrefix ? `${namePrefix}${name}` : name;
						let packageJson;

						try {
							packageJson = await this.parsePackageJson({ dir: pkgPath });
						} catch {
							packageJson = null;
						}

						if (!packageJson) {
							console.error(`Ignoring this package failed to read package.json: ${pkgName}`);
							return null;
						}

						return {
							type,
							path: pkgPath,
							relativePath,
							name: pkgName,
							packageJson,
						};
					})
				);

				return packages.filter((pkg): pkg is PackageItem => pkg !== null);
			} catch (error) {
				console.error(`Error reading directory ${dirPath}:`, error);
				return [];
			}
		};

		const extraPackages = ["@repo", "@db"];
		const results = await Promise.all([
			fetchPackages("apps", "apps"),
			fetchPackages("configs", "configs"),
			fetchPackages("packages", "packages", "", name => !extraPackages.includes(name)),
			fetchPackages("packages/@repo", "packages", "@repo/"),
			fetchPackages("packages/@db", "packages", "@db/"),
		]);

		return results.flat();
	}

	static async parsePackageJson({ dir, file = "package" }: { dir: string; file?: string }) {
		const packageJson = await fsTool.readJSONFile<StartXPackageJson>({
			dir,
			file,
		});
		return packageJson;
	}

	static async parsePnpmWorkspace({ dir }: { dir: string }) {
		const yaml = await fsTool.readYamlFile({
			file: "pnpm-workspace",
			dir,
		});

		return yaml?.toJSON() as PnpmWorkspace;
	}
}
