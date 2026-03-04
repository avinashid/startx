import { UserSession } from "@repo/lib/session-module";
import type { NextFunction, Request, Response } from "express";

type ExpressHandler = (req: Request, res: Response, next: NextFunction) => unknown;

export class AuthMiddlewares {
	static async validateActiveSession(req: Request, res: Response, next: NextFunction) {
		try {
			const accessToken = req.headers["authorization"]?.split(" ")[1];
			if (!accessToken) {
				res.status(401).json({ message: "access token missing" });
				return;
			}

			const payload = await UserSession.getSessionUser(accessToken);

			if (!payload) {
				res.status(401).json({ message: "invalid access token" });
				return;
			}
			req.user = payload;
			return next();
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

		descriptor.value = async function (
			this: unknown,
			req: Request,
			res: Response,
			next: NextFunction
		) {
			try {
				const accessToken = req.headers.authorization?.split(" ")[1];

				if (!accessToken) {
					res.status(401).json({ message: "access token missing" });
					return;
				}

				const payload = await UserSession.getSessionUser(accessToken);

				if (!payload) {
					res.status(401).json({ message: "invalid access token" });
					return;
				}

				req.user = payload;

				return originalMethod.call(this, req, res, next);
			} catch (error) {
				next(error);
			}
		} as T;
	};
}
