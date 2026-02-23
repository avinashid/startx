import * as jwt from "jsonwebtoken";
export type AuthTokenPayload = {
	userID: string;
	email: string;
};
const accessTokenSecret = process.env.ACCESS_TOKEN_SECRET;
const refreshTokenSecret = process.env.REFRESH_TOKEN_SECRET;

export class TokenModule {
	static signRefreshToken(payload: AuthTokenPayload) {
		return jwt.sign(payload, refreshTokenSecret, { expiresIn: "365d" });
	}
	static verifyRefreshToken(refreshToken: string) {
		try {
			const payload = jwt.verify(refreshToken, refreshTokenSecret) as AuthTokenPayload;
			return payload;
		} catch (error) {
			console.error(error)
			return null;
		}
	}
	static signAccessToken(payload: AuthTokenPayload) {
		const expiration = process.env.NODE_ENV === "development" ? "30d" : "1d";
		return jwt.sign(payload, accessTokenSecret, { expiresIn: expiration });
	}
	static verifyAccessToken(accessToken: string) {
		try {
			const payload = jwt.verify(accessToken, accessTokenSecret) as AuthTokenPayload;
			return payload;
		} catch (error) {
			console.error(error)
			return null;
		}
	}
}
