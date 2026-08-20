import { createFileStorageFromEnv, FileStorage } from "./file-storage.js";
import { createS3StorageFromEnv, S3Storage } from "./s3-storage.js";
import { StorageProvider } from "./storage-provider.js";

/**
 * Returns a ready-to-use storage provider based on type.
 *
 * @param type - 's3' | 'local' (or 'file' as alias)
 * @returns StorageProvider instance
 *
 * @example
 * const bucket = storage('s3');
 * const meta = await bucket.uploadFile(file, 'photos/123.jpg');
 *
 * // or local
 * const local = storage('local');
 * const img = await local.uploadImage(imgFile, 'avatars/456.webp');
 */
export function storage(type: "s3" | "local" | "file" = "local"): StorageProvider {
	switch (type) {
		case "s3":
			return createS3StorageFromEnv();
		case "local":
		case "file":
			return createFileStorageFromEnv();
		default:
			throw new Error(`Unsupported storage type: ${type as string}`);
	}
}

export const defaultStorage = storage("s3");

export { FileStorage, S3Storage };
export type { FileMetadata, UploadFile } from "./storage-provider.js";
