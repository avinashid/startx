import { defineEnv } from "@repo/env";
import { fsTool } from "@repo/lib/file-system-module";
import path from "path";
import { fileURLToPath } from "url";
import z from "zod";

import type { PnpmWorkspace, StartXPackageJson } from "../types";

export type RawPackageItem = {
	type: "apps" | "configs" | "packages";
	path: string;
	name: string;
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
		} else template = path.resolve(template, "../../../");

		return {
			template,
			workspace,
		};
	}
	static async getPackageList() {
		const packages: RawPackageItem[] = [];
		const cliDirectory = this.getDirectory().template;
		const safeListDir = async (dir: string): Promise<string[]> => {
			try {
				return await fsTool.listDirectories({ dir });
			} catch (error) {
				console.error("Error listing directory:", error);
				return [];
			}
		};

		const [availableApps, availableConfigs, availablePackages, availableRepoPackages] =
			await Promise.all([
				safeListDir(path.join(cliDirectory, "apps")),
				safeListDir(path.join(cliDirectory, "configs")),
				safeListDir(path.join(cliDirectory, "packages")),
				safeListDir(path.join(cliDirectory, "packages", "@repo")),
			]);

		// 2. Map Apps
		availableApps.forEach(name => {
			packages.push({
				type: "apps",
				path: path.join(cliDirectory, "apps", name),
				name,
			});
		});

		availableConfigs.forEach(name => {
			packages.push({
				type: "configs",
				path: path.join(cliDirectory, "configs", name),
				name,
			});
		});

		availablePackages.forEach(name => {
			if (name === "@repo") return;
			packages.push({
				type: "packages",
				path: path.join(cliDirectory, "packages", name),
				name,
			});
		});

		availableRepoPackages.forEach(name => {
			packages.push({
				type: "packages",
				path: path.join(cliDirectory, "packages", "@repo", name),
				name: `@repo/${name}`,
			});
		});

		return packages;
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
