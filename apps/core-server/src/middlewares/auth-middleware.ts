import {  UserSession } from "@repo/lib";
import type { NextFunction, Request, Response } from "express";
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
	return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
		const originalMethod = descriptor.value;
		descriptor.value = async function (req: Request, res: Response, next: NextFunction) {
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
				return originalMethod.apply(this, [req, res, next]);
			} catch (error) {
				next(error);
			}
		};
	};
}
