import type { SessionUser } from "@repo/lib/session-module";

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		export interface Request {
			user: SessionUser;
		}
	}
}

declare module "http" {
	interface IncomingMessage {
		user: SessionUser;
	}
}
