import type { RequestUser } from "@repo/common/types/users";

declare global {
	// eslint-disable-next-line @typescript-eslint/no-namespace
	namespace Express {
		export interface Request {
			user: RequestUser;
		}
	}
}

declare module "http" {
	interface IncomingMessage {
		user: RequestUser;
	}
}
