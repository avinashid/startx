import { encode } from "blurhash";
import sharp from "sharp";

export type UploadFile = {
	name: string;
	mimetype: string;
	data: Buffer;
};

export type FileMetadata = {
	url: string;
	relativePath: string;
	mimetype: string;
	name: string;
};

export type ImageMetadata = FileMetadata & {
	blurhash: string;
};

export type ImageTransformOptions = {
	width?: number;
	height?: number;
	quality?: number;
	format?: "jpeg" | "png" | "webp" | "avif";
	fit?: "cover" | "contain" | "fill" | "inside" | "outside";
	blurhashComponents?: { x: number; y: number };
};

export abstract class StorageProvider {
	abstract uploadFile(file: UploadFile, relativePath: string): Promise<FileMetadata>;
	abstract deleteFile(relativePath: string): Promise<void>;
	abstract getUrl(relativePath: string): string;
	abstract getRelativePathFromUrl(url: string): string;

	async uploadFiles(files: UploadFile[], basePath: string): Promise<FileMetadata[]> {
		return await Promise.all(files.map((file) => this.uploadFile(file, `${basePath}/${file.name}`)));
	}

	async uploadImage(file: UploadFile, relativePath: string, options?: ImageTransformOptions): Promise<ImageMetadata> {
		if (!file.mimetype.startsWith("image/")) {
			throw new Error("uploadImage requires an image file");
		}

		let pipeline = sharp(file.data);

		if (options?.width || options?.height) {
			pipeline = pipeline.resize({
				width: options?.width,
				height: options?.height,
				fit: options?.fit || "cover",
			});
		}

		const blurhashPipeline = sharp(file.data)
			.resize({ width: 32, height: 32, fit: "inside" })
			.raw()
			.ensureAlpha()
			.toBuffer({ resolveWithObject: true });

		if (options?.format) {
			const isAvif = options.format === "avif";
			pipeline = pipeline.toFormat(options.format, {
				quality: options.quality || 80,
				effort: isAvif ? 4 : undefined,
			});

			file.mimetype = `image/${options.format}`;
			file.name = file.name.replace(/\.[^/.]+$/, "") + `.${options.format}`;
		} else if (options?.quality) {
			pipeline = pipeline
				.jpeg({ quality: options.quality, force: false })
				.png({ quality: options.quality, force: false })
				.webp({ quality: options.quality, force: false })
				.avif({ quality: options.quality, effort: 4, force: false });
		}

		const [rawResult, compressedBuffer] = await Promise.all([blurhashPipeline, pipeline.toBuffer()]);

		let blurhash: string;
		try {
			const clamped = new Uint8ClampedArray(rawResult.data);
			const compX = options?.blurhashComponents?.x || 9;
			const compY = options?.blurhashComponents?.y || 9;
			blurhash = encode(clamped, rawResult.info.width, rawResult.info.height, compX, compY);
		} catch (error) {
			throw new Error(`Failed to generate BlurHash: ${(error as Error).message}`);
		}

		file.data = compressedBuffer;

		const metadata = await this.uploadFile(file, relativePath);

		return { ...metadata, blurhash };
	}
}
