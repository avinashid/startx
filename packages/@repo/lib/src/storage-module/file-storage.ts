import { ENV } from "@repo/env";
import { promises as fs } from "fs";
import path from "path";
import { FileMetadata, StorageProvider, UploadFile } from "./storage-provider.js";
import { __dirname } from "../utils.js";

export class FileStorage extends StorageProvider {
	private readonly baseUploadPath: string;
	private readonly baseUrl: string;

	constructor(config: { baseUploadPath: string; baseUrl?: string }) {
		super();
		this.baseUploadPath = config.baseUploadPath;
		this.baseUrl = (config.baseUrl ?? "").replace(/\/$/, "");
	}

	async uploadFile(file: UploadFile, relativePath: string): Promise<FileMetadata> {
		const fullPath = path.join(this.baseUploadPath, relativePath);
		await this.ensureDir(path.dirname(fullPath));
		await fs.writeFile(fullPath, file.data);

		return {
			url: this.getUrl(relativePath),
			relativePath,
			mimetype: file.mimetype,
			name: file.name,
		};
	}

	async deleteFile(relativePath: string): Promise<void> {
		const fullPath = path.join(this.baseUploadPath, relativePath);
		await fs.unlink(fullPath).catch((err) => {
			if (err.code !== "ENOENT") throw err;
		});
	}

	getUrl(relativePath: string): string {
		const normalizedPath = relativePath.replace(/\\/g, "/");
		return `${this.baseUrl}/${normalizedPath}`;
	}

	getRelativePathFromUrl(url: string): string {
		if (this.baseUrl && url.startsWith(this.baseUrl)) {
			return url.slice(this.baseUrl.length).replace(/^\//, "");
		}
		return url.replace(/^\//, "");
	}

	private async ensureDir(dir: string): Promise<void> {
		await fs.mkdir(dir, { recursive: true });
	}
}

export function createFileStorageFromEnv(): FileStorage {
	const cleanServerUrl = ENV.SERVER_URL.replace(/\/$/, "");

	return new FileStorage({
		baseUploadPath: path.join(__dirname(), ENV.FILE_STORAGE_PATH),
		baseUrl: `${cleanServerUrl}/storage`,
	});
}
