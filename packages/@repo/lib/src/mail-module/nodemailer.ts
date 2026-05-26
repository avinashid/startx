import { defineEnv } from "@repo/env";
import { logger } from "@repo/logger";
import type { Transporter, SendMailOptions } from "nodemailer";
import * as nodemailer from "nodemailer";
import z from "zod";

const credentials = defineEnv({
	SMTP_HOST: z.string(),
	SMTP_PORT: z.coerce.number().default(465),
	SMTP_USER: z.string(),
	SMTP_PASSWORD: z.string(),
	SMTP_MAIL_ENCRYPTION: z.enum(["ssl", "tls", "starttls"]).default("ssl"),
	SMTP_SENDER_MAIL: z.string().email(),
	SMTP_SENDER_NAME: z.string().default("Startx"),
});

export type SMTPConfig = typeof credentials;

class SMTPMailService {
	private static transporters = new Map<string, Transporter>();

	private static getTransporter(config: SMTPConfig): Transporter {
		const cacheKey = `${config.SMTP_HOST}:${config.SMTP_USER}`;

		if (!this.transporters.has(cacheKey)) {
			const transporter = nodemailer.createTransport({
				host: config.SMTP_HOST,
				port: config.SMTP_PORT,
				secure: config.SMTP_MAIL_ENCRYPTION === "ssl",
				auth: {
					user: config.SMTP_USER,
					pass: config.SMTP_PASSWORD,
				},
			});
			this.transporters.set(cacheKey, transporter);
		}

		return this.transporters.get(cacheKey)!;
	}

	static async verifyConnection(customConfig?: SMTPConfig): Promise<boolean> {
		const config = customConfig || credentials;
		const transporter = this.getTransporter(config);

		try {
			await transporter.verify();
			logger.info(`SMTP Connection verified successfully for ${config.SMTP_HOST}`);
			return true;
		} catch (error) {
			logger.error(`SMTP Connection verification failed for ${config.SMTP_HOST}:`, error);
			return false;
		}
	}

	static async sendMail(
		props: { to: string; subject: string; text: string; html?: string },
		customConfig?: SMTPConfig
	) {
		const config = customConfig || credentials;
		const transporter = this.getTransporter(config);

		const mailOptions: SendMailOptions = {
			from: `"${config.SMTP_SENDER_NAME}" <${config.SMTP_SENDER_MAIL}>`,
			to: props.to,
			subject: props.subject,
			text: props.text,
			html: props.html,
		};

		try {
			const info = (await transporter.sendMail(mailOptions)) as { messageId: string };
			logger.info(`Email sent successfully: ${info.messageId}`);
			return info;
		} catch (error) {
			logger.error("Error sending email:", error);
			throw new Error("Failed to send email", { cause: error });
		}
	}
}

export { SMTPMailService };
