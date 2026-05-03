import { defineEnv } from "@repo/env";
import { logger } from "@repo/logger";
import type { Transporter, SendMailOptions } from "nodemailer";
import * as nodemailer from "nodemailer";
import z from "zod";

const credentials = defineEnv({
	SMTP_HOST: z.string(),
	SMTP_PORT: z.coerce.number().default(587),
	SMTP_USER: z.string(),
	SMTP_PASSWORD: z.string(),
	SMTP_MAIL_ENCRYPTION: z.string().default("tls"),
	SMTP_SENDER_MAIL: z.string().email(),
	SMTP_SENDER_NAME: z.string().default("Startx"),
});

class SMTPMailService {
	private static transporter: Transporter | null = null;

	private static initializeTransporter(): Transporter {
		if (!this.transporter) {
			this.transporter = nodemailer.createTransport({
				host: credentials.SMTP_HOST,
				port: credentials.SMTP_PORT,
				secure: credentials.SMTP_MAIL_ENCRYPTION === "ssl",
				auth: {
					user: credentials.SMTP_USER,
					pass: credentials.SMTP_PASSWORD,
				},
			});
		}
		return this.transporter;
	}

	static async verifyConnection(): Promise<void> {
		const transporter = this.initializeTransporter();
		try {
			await transporter.verify();
			logger.info("SMTP Connection verified successfully.");
		} catch (error) {
			logger.error("SMTP Connection verification failed:", error);
			throw error;
		}
	}

	static async sendMail(props: { to: string; subject: string; text: string; html?: string }) {
		const transporter = this.initializeTransporter();

		const mailOptions: SendMailOptions = {
			from: `"${credentials.SMTP_SENDER_NAME}" <${credentials.SMTP_SENDER_MAIL}>`,
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
			// Retain the original error context for debugging
			throw new Error("Failed to send email", { cause: error });
		}
	}
}

export { SMTPMailService };
