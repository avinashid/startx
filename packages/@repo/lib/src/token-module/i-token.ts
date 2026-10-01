import jwt from "jsonwebtoken";

type ITokenOptions = { signingKey: string; options: jwt.SignOptions };

export class ITokenModule<T extends object | string = Record<string, unknown>> {
	private signingKey: string;
	private options: jwt.SignOptions;
	constructor(opts: ITokenOptions) {
		this.signingKey = opts.signingKey;
		this.options = opts.options;
	}
	public generateToken(payload: T) {
		return jwt.sign(payload, this.signingKey, this.options);
	}
	public verifyToken(token: string) {
		// Pin the algorithm the token was signed with. Without it jsonwebtoken accepts whatever the
		// token's own header claims, within the family the key type allows.
		return jwt.verify(token, this.signingKey, { algorithms: [this.options.algorithm ?? "HS256"] }) as T;
	}
}
