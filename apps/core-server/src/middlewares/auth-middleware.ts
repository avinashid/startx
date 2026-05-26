import { TokenModule } from "@repo/lib/extra";
import { defaultUserSession } from "@repo/lib/session-module";
import type { NextFunction, Request, Response } from "express";

type ExpressHandler = (req: Request, res: Response, next: NextFunction) => Promise<void> | void;

function extractBearerToken(req: Request): string | null {
	const auth = req.headers.authorization;

	if (!auth) return null;

	const [scheme, token] = auth.split(" ");

	if (scheme !== "Bearer" || !token) {
		return null;
	}

	return token;
}

async function authenticateRequest(req: Request) {
	const accessToken = extractBearerToken(req);

	if (!accessToken) {
		return {
			ok: false as const,
			status: 401,
			message: "Access token missing",
		};
	}

	const payload = TokenModule.verifyAccessToken(accessToken);

	if (!payload?.sessionID) {
		return {
			ok: false as const,
			status: 401,
			message: "Invalid access token",
		};
	}

	const session = await defaultUserSession.validateSession(payload.sessionID);

	if (!session) {
		return {
			ok: false as const,
			status: 401,
			message: "Session expired or revoked",
		};
	}

	return {
		ok: true as const,
		user: session.user,
		session,
	};
}

export class AuthMiddlewares {
	static async validateActiveSession(req: Request, res: Response, next: NextFunction) {
		try {
			const auth = await authenticateRequest(req);

			if (!auth.ok) {
				res.status(auth.status).json({
					success: false,
					message: auth.message,
				});
				return;
			}

			req.user = auth.user;

			next();
		} catch (error) {
			next(error);
		}
	}
}

export function validateSession() {
	return function <T extends ExpressHandler>(
		_target: unknown,
		_propertyKey: string,
		descriptor: TypedPropertyDescriptor<T>
	): void {
		const originalMethod = descriptor.value;

		if (!originalMethod) return;

		descriptor.value = async function (this: unknown, req: Request, res: Response, next: NextFunction) {
			try {
				const auth = await authenticateRequest(req);

				if (!auth.ok) {
					res.status(auth.status).json({
						success: false,
						message: auth.message,
					});
					return;
				}

				req.user = auth.user;

				await originalMethod.call(this, req, res, next);
			} catch (error) {
				next(error);
			}
		} as T;
	};
}
