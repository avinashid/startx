import { z } from "zod";
import { defineQueue } from "../types.js";

export const emailQueue = defineQueue({
	"email-send": {
		params: z.object({
			to: z.string().email(),
			subject: z.string().min(1),
			text: z.string().optional(),
			html: z.string().optional(),
		}),
		result: z.object({
			messageId: z.string(),
			success: z.boolean(),
		}),
	},
	"email-bounce": {
		params: z.object({
			emailId: z.string(),
			reason: z.string(),
		}),
	},
});
