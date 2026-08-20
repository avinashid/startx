import jwt from "jsonwebtoken";

export class ITokenModule<T extends object | string = Record<string, unknown>> {
	private signingKey: string;
	private options: jwt.SignOptions;
	constructor(opts: {
		signingKey: string;
		options: jwt.SignOptions;
	}) {
		this.signingKey = opts.signingKey;
		this.options = opts.options;
	}
	public generateToken(payload: T) {
		return jwt.sign(payload, this.signingKey, this.options);
	}
	public verifyToken(token: string) {
		return jwt.verify(token, this.signingKey) as T;
	}
}
