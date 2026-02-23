import type { Transporter } from "nodemailer";
import * as nodemailer from "nodemailer";

import { logger } from "../logger-module/logger";

class SMTPMailService {
	private static transporter: Transporter;

	// Initialize the transporter only once
	private static initializeTransporter() {
		if (!this.transporter) {
			this.transporter = nodemailer.createTransport({
				host: process.env.SMTP_HOST,
				port: Number.parseInt(process.env.SMTP_PORT) ?? 587,
				secure: process.env.SMTP_MAIL_ENCRYPTION === "ssl",
				auth: {
					user: process.env.SMTP_USER,
					pass: process.env.SMTP_PASSWORD,
				},
			});
		}
	}

	static async sendMail(to: string, subject: string, text: string, html?: string): Promise<void> {
		this.initializeTransporter();

		const mailOptions = {
			from: `Bemyguest <${process.env.SENDER_MAIL}>`,
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
