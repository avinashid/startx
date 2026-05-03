import { SMTPMailService } from "@repo/lib/mail-module";
import { logger } from "@repo/logger";
import { BullQueue } from "@repo/queue";
export const bullWorker = () => {
	logger.info("Starting BullMQ worker...");

	BullQueue.registerWorker(
		"email-send",
		async data => {
			const message = await SMTPMailService.sendMail({
				subject: data.subject,
				text: data.text!,
				to: data.to,
				html: data.html,
			});
			return {
				messageId: message.messageId,
				success: true,
			};
		},
		{
			concurrency: 10,
		}
	);
};
