import fs from "fs/promises";
import path from "path";

import { __dirname } from "../utils.js";

export class FStool {
	root = __dirname();

	private async pathExists(target: string) {
		try {
			await fs.access(target);
			return true;
		} catch {
			return false;
		}
	}

	async writeFile({ file, content }: { file: string; content: string }) {
		await fs.writeFile(path.join(this.root, file), content);
	}

	async writeJSONFile({ file, content, dir }: { file: string; content: object; dir?: string }) {
		file = `${file}.json`;

		let destination = path.join(this.root, file);

		if (dir) {
			const dirPath = path.join(this.root, dir);
			await this.ensurePathExists({ dir });
			destination = path.join(dirPath, file);
		}

		await fs.writeFile(destination, JSON.stringify(content, null, 2));
	}

	async readFile({ file }: { file: string }) {
		return fs.readFile(path.join(this.root, file), "utf-8");
	}

	async readJSONFile({ file, dir }: { file: string; dir?: string }) {
		try {
			file = `${file}.json`;
			const fullPath = path.join(this.root, dir ?? "", file);
			const data = await fs.readFile(fullPath, "utf-8");
			return JSON.parse(data) as object;
		} catch {
			return null;
		}
	}

	async ensurePathExists({ dir }: { dir: string }) {
		const fullPath = path.join(this.root, dir);
		if (!(await this.pathExists(fullPath))) {
			await fs.mkdir(fullPath, { recursive: true });
		}
	}

	async avoidOverriding({ file }: { file: string }) {
		const fullPath = path.join(this.root, file);
		if (await this.pathExists(fullPath)) {
			throw new Error(`File ${fullPath} already exists`);
		}
	}

	async removeFile({ file }: { file: string }) {
		const fullPath = path.join(this.root, file);
		if (await this.pathExists(fullPath)) {
			await fs.unlink(fullPath);
		}
	}

	async removeDirectory({ dir, target }: { dir: string; target: string }) {
		const fullPath = path.join(this.root, dir, target);
		if (await this.pathExists(fullPath)) {
			await fs.rm(fullPath, { recursive: true, force: true });
		}
	}

	async copyDirectory({ from, to, dir }: { from: string; to: string; dir: string }) {
		const source = path.join(this.root, dir, from);
		const destination = path.join(this.root, dir, to);

		if (await this.pathExists(source)) {
			await fs.cp(source, destination, { recursive: true });
		}
	}

	async listDirectories({ dir }: { dir: string }) {
		try {
			const entries = await fs.readdir(path.join(this.root, dir), {
				withFileTypes: true,
			});
			return entries.filter(e => e.isDirectory()).map(e => e.name);
		} catch {
			return [];
		}
	}

	async listFiles({ dir }: { dir: string }) {
		try {
			const entries = await fs.readdir(path.join(this.root, dir), {
				withFileTypes: true,
			});
			return entries.filter(e => e.isFile()).map(e => e.name);
		} catch {
			return [];
		}
	}
}

export const fsTool = new FStool();
