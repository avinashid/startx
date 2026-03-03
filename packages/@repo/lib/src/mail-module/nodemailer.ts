import type { Transporter } from "nodemailer";
import * as nodemailer from "nodemailer";
import z from "zod";
import { defineEnv } from "../env-module/define-env.js";
import { logger } from "../logger-module/logger.js";

const credentials = defineEnv({
	SMTP_HOST: z.string(),
	SMTP_PORT: z.string(),
	SMTP_USER: z.string(),
	SMTP_PASSWORD: z.string(),
	SMTP_MAIL_ENCRYPTION: z.string().default("tls"),
	SENDER_MAIL: z.string(),
});
class SMTPMailService {
	private static transporter: Transporter;

	// Initialize the transporter only once
	private static initializeTransporter() {
		if (!this.transporter) {
			this.transporter = nodemailer.createTransport({
				host: credentials.SMTP_HOST,
				port: Number.parseInt(credentials.SMTP_PORT) ?? 587,
				secure: credentials.SMTP_MAIL_ENCRYPTION === "ssl",
				auth: {
					user: credentials.SMTP_USER,
					pass: credentials.SMTP_PASSWORD,
				},
			});
		}
	}

	static async sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
		this.initializeTransporter();

		const mailOptions = {
			from: `Bemyguest <${credentials.SENDER_MAIL}>`,
			to,
			subject,
			text,
			html,
		};

		try {
			const info = (await this.transporter.sendMail(mailOptions)) as { messageId: string };
			logger.info(`Email sent: ${info.messageId}`);
		} catch (error) {
			logger.error("Error sending email:", error);
			throw new Error("Failed to send email");
		}
	}
}

export { SMTPMailService };
