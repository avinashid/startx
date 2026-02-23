import fs from "fs/promises";
import fsExists from "fs.promises.exists";
import path from "path";

import { __dirname } from "../utils.js";
export class FStool {
	root = __dirname();
	async writeFile({ file, content }: { file: string; content: string }) {
		await fs.writeFile(path.join(this.root, file), content);
	}
	async writeJSONFile({ file, content, dir }: { file: string; content: object; dir?: string }) {
		file = `${file}.json`;
		let destination = path.join(this.root, file);
		if (dir) {
			const dirPath = path.join(dir, file);
			destination = path.join(this.root, dir, file);
			await this.ensurePathExists({ dir: path.dirname(dirPath) });
		}
		await fs.writeFile(destination, JSON.stringify(content, null, 2));
	}
	async readFile({ file }: { file: string }) {
		return await fs.readFile(path.join(this.root, file), "utf-8");
	}
	async readJSONFile({ file, dir }: { file: string; dir?: string }) {
		try {
			file = `${file}.json`;
			return JSON.parse(await fs.readFile(path.join(this.root, dir || "", file), "utf-8")) as object;
		} catch (err) {
			console.error(err)
			return null;
		}
	}
	async ensurePathExists({ dir }: { dir: string }) {
		dir = path.join(this.root, dir);
		if (!(await fsExists(dir))) {
			await fs.mkdir(dir, { recursive: true });
		}
	}
	async avoidOverriding({ file }: { file: string }) {
		file = path.join(this.root, file);
		if (await fsExists(file)) {
			throw new Error(`File ${file} already exists`);
		}
	}
	async removeFile({ file }: { file: string }) {
		file = path.join(this.root, file);
		if (await fsExists(file)) {
			await fs.unlink(file);
		}
	}
	async removeDirectory({ dir, target }: { dir: string; target: string }) {
		dir = path.join(this.root, dir, target);
		if (await fsExists(dir)) {
			await fs.rm(dir, { recursive: true });
		}
	}

	async copyDirectory({ from, to, dir }: { from: string; to: string; dir: string }) {
		from = path.join(this.root, dir, from);
		to = path.join(this.root, dir, to);
		if (await fsExists(from)) {
			await fs.cp(from, to, { recursive: true });
		}
	}

	async listDirectories({ dir }: { dir: string }) {
		try {
			return await fs
				.readdir(path.join(this.root, dir), { withFileTypes: true })
				.then((files) => files.filter((file) => file.isDirectory()))
				.then((files) => files.map((file) => file.name));
		} catch (error) {
			console.warn(error);
			return [];
		}
	}
	async listFiles({ dir }: { dir: string }) {
		try {
			return await fs
				.readdir(path.join(this.root, dir), { withFileTypes: true })
				.then((files) => files.filter((file) => !file.isDirectory()))
				.then((files) => files.map((file) => file.name));
		} catch (error) {
			console.warn(error);
			return [];
		}
	}
}

export const fsTool = new FStool();
