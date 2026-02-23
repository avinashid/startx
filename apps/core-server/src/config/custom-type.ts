/* eslint-disable @typescript-eslint/no-namespace */
import type { SessionUser } from "@repo/lib";

declare global {
	namespace NodeJS {
		export interface ProcessEnv {
			// from .env
			COOKIE_DOMAIN: string;
			NODE_ENV: "development" | "staging" | "production" | "test";
			DATABASE_URL: string;
			DATABASE_AUTH_TOKEN: string;
			ACCESS_TOKEN_SECRET: string;
			REFRESH_TOKEN_SECRET: string;
			OAUTH_STATE_TOKEN_SECRET: string;
			SUPPORT_MAIL: string;
			AWS_ACCESS_KEY_ID: string;
			AWS_SECRET_ACCESS_KEY: string;
			AWS_REGION: string;
			AWS_BUCKET: string;
			GOOGLE_CLIENT_ID: string;
			GOOGLE_CLIENT_SECRET: string;
			GOOGLE_REDIRECT_URI: string;

			CLIENT_URL: string;
			SERVER_URL: string;
			REDIS_URI: string;
			REDIS_PORT: string;
			REDIS_USERNAME: string;
			REDIS_PASSWORD: string;
			FIREBASE_PROJECT_ID: string;
			STRIPE_WEBHOOK_SECRET: string;
			STRIPE_SECRET_KEY: string;

			SMTP_HOST: string;
			SMTP_PORT: string;
			SMTP_USER: string;
			SMTP_PASSWORD: string;
			SENDER_MAIL: string;
		}
	}

	namespace Express {
		export interface Request {
			user: SessionUser;
		}
	}
}

declare module "http" {
	interface IncomingMessage {
		user: SessionUser;
		body: any;
	}
}
