import { DeleteObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { defineEnv } from "@repo/env";
import { z } from "zod";

import { type FileMetadata, StorageProvider, type UploadFile } from "./storage-provider.js";
export interface S3StorageConfig {
	accessKeyId: string;
	secretAccessKey: string;
	region: string;
	bucket: string;
	endpoint?: string;
	publicBaseUrl?: string;
}

export class S3Storage extends StorageProvider {
	private readonly client: S3Client;
	private readonly bucket: string;
	private readonly region: string;
	private readonly endpoint?: string;
	private readonly publicBaseUrl?: string;

	constructor(config: S3StorageConfig) {
		super();
		this.bucket = config.bucket;
		this.region = config.region;
		this.endpoint = config.endpoint;
		this.publicBaseUrl = config.publicBaseUrl;

		this.client = new S3Client({
			credentials: {
				accessKeyId: config.accessKeyId,
				secretAccessKey: config.secretAccessKey,
			},
			region: config.region,
			endpoint: config.endpoint,
		});
	}

	async uploadFile(file: UploadFile, relativePath: string): Promise<FileMetadata> {
		const command = new PutObjectCommand({
			Bucket: this.bucket,
			Key: relativePath,
			Body: file.data,
			ContentType: file.mimetype,
		});

		await this.client.send(command);

		return {
			url: this.getUrl(relativePath),
			relativePath,
			mimetype: file.mimetype,
			name: file.name,
		};
	}

	async deleteFile(relativePath: string): Promise<void> {
		await this.client.send(
			new DeleteObjectCommand({
				Bucket: this.bucket,
				Key: relativePath,
			}),
		);
	}

	/**
	 * Build public URL. Priority:
	 * 1. Explicit `publicBaseUrl`
	 * 2. If `endpoint` is set, use `${endpoint}/${bucket}/${relativePath}`
	 * 3. Fallback to standard S3 URL pattern
	 */
	getUrl(relativePath: string): string {
		if (this.publicBaseUrl) {
			return `${this.publicBaseUrl.replace(/\/$/, "")}/${relativePath}`;
		}

		if (this.endpoint) {
			const base = this.endpoint.replace(/\/$/, "");
			return `${base}/${this.bucket}/${relativePath}`;
		}

		return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${relativePath}`;
	}

	getRelativePathFromUrl(url: string): string {
		// Compute base used in getUrl()
		let base: string;
		if (this.publicBaseUrl) {
			base = this.publicBaseUrl.replace(/\/$/, "");
		} else if (this.endpoint) {
			base = `${this.endpoint.replace(/\/$/, "")}/${this.bucket}`;
		} else {
			base = `https://${this.bucket}.s3.${this.region}.amazonaws.com`;
		}
		return url.replace(`${base}/`, "");
	}
}
export function createS3StorageFromEnv(): S3Storage {
	const env = defineEnv({
		AWS_ACCESS_KEY_ID: z.string(),
		AWS_SECRET_ACCESS_KEY: z.string(),
		AWS_REGION: z.string().default("us-east-1"),
		AWS_BUCKET: z.string(),
		S3_ENDPOINT: z.string().optional(),
		S3_PUBLIC_BASE_URL: z.string().optional(),
	});

	return new S3Storage({
		accessKeyId: env.AWS_ACCESS_KEY_ID,
		secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
		region: env.AWS_REGION,
		bucket: env.AWS_BUCKET,
		endpoint: env.S3_ENDPOINT,
		publicBaseUrl: env.S3_PUBLIC_BASE_URL,
	});
}
