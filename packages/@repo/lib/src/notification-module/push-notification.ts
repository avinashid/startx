import firebaseAdmin from "firebase-admin";
import path from "path";

import { logger } from "../logger-module/logger.js";
import { __dirname } from "../utils.js";

export type FcmPayload = {
	notification?: {
		title: string;
		body?: string;
	};
	data?: Record<string, any>;
	token: string;
};

type InitOptions =
	| {
			type: "file";
	  }
	| {
			type: "env";
	  };

export class PushNotificationManager {
	private static initialized = false;

	static initialize(options: InitOptions) {
		if (this.initialized) return;

		try {
			let credential: firebaseAdmin.credential.Credential;

			if (options.type === "file") {
				credential = firebaseAdmin.credential.cert(
					path.join(__dirname(), "/keys/firebase-messaging-secret.json"),
				);
			} else if (options.type === "env") {
				credential = firebaseAdmin.credential.cert({
					projectId: process.env.FIREBASE_PROJECT_ID,
					clientEmail: process.env.FIREBASE_CLIENT_EMAIL!,
					privateKey: process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, "\n"),
				});
			} else {
				throw new Error("Invalid initialization options");
			}

			firebaseAdmin.initializeApp({ credential });
			this.initialized = true;
			logger.info("Firebase Admin initialized");
		} catch (error) {
			logger.error("Firebase initialization error:", error);
		}
	}

	static async sendNotification(payload: FcmPayload[]) {
		if (!this.initialized) {
			logger.warn("PushNotificationManager not initialized. Skipping notification.");
			return;
		}

		const formattedPayload = payload.map((item) => {
			const data: Record<string, string> = {};

			for (const key in item.data) {
				const value = item.data[key] as string;
				if (value !== null) {
					data[key] = typeof value === "string" ? value : String(value);
				}
			}

			return {
				notification: item.notification
					? {
							title: item.notification.title,
							body: item.notification.body,
						}
					: undefined,
				data,
				token: item.token,
			};
		});

		try {
			const response = await firebaseAdmin.messaging().sendEach(formattedPayload);
			logger.info("Successfully sent message:", response.responses);
		} catch (error) {
			logger.error("Error sending message:", error);
		}
	}
}
