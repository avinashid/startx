import { defineEnv, envSecret } from "@repo/env";
import crypto from "crypto";

const env = defineEnv({
	// 64 hex characters = 32 bytes for AES-256-GCM.
	INTEGRATION_ENCRYPTION_KEY: envSecret({ length: 64, hex: true }),
});

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * @description Symmetric AES-256-GCM encryption for at-rest secrets (OAuth tokens, SMTP passwords, etc.)
 */
export class EncryptionModule {
	private static getKey(): Buffer {
		return Buffer.from(env.INTEGRATION_ENCRYPTION_KEY, "hex");
	}

	static encrypt(plainText: string): string {
		const iv = crypto.randomBytes(IV_LENGTH);
		const cipher = crypto.createCipheriv(ALGORITHM, this.getKey(), iv);
		const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
		const authTag = cipher.getAuthTag();

		return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
	}

	static decrypt(cipherText: string): string {
		const [ivHex, authTagHex, dataHex] = cipherText.split(":");

		if (!ivHex || !authTagHex || !dataHex) {
			throw new Error("Invalid encrypted payload");
		}

		const decipher = crypto.createDecipheriv(ALGORITHM, this.getKey(), Buffer.from(ivHex, "hex"));
		decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

		return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
	}
}
