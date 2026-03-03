import { ZodError, ZodTypeAny, z } from "zod";
import { loadDotenv } from "./utils.js";

loadDotenv();
type SpecEntry =
	| ZodTypeAny
	| {
			schema: ZodTypeAny;
			default?: unknown;
			env?: string;
			description?: string;
	  };

type Spec = Record<string, SpecEntry>;

type InferSpec<S extends Spec> = {
	[K in keyof S]: S[K] extends ZodTypeAny
		? z.infer<S[K]>
		: S[K] extends { schema: ZodTypeAny }
			? z.infer<S[K]["schema"]>
			: never;
};

function isZod(v: unknown): v is ZodTypeAny {
	return Boolean(v && typeof (v as any).parse === "function");
}

export function defineEnv<S extends Spec>(spec: S): InferSpec<S> {
	const result: any = {};

	for (const key of Object.keys(spec) as Array<keyof S>) {
		const entry = spec[key];

		const normalized = isZod(entry)
			? { schema: entry, default: undefined, env: key as string }
			: {
					schema: entry.schema,
					default: entry.default,
					env: entry.env ?? (key as string),
				};

		const raw = process.env[normalized.env];
		const value = raw === undefined ? normalized.default : raw;
		try {
			result[key] = normalized.schema.parse(value);
		} catch (err) {
			if (err instanceof ZodError) {
				const message = err.issues.map(e => `${String(key)}: ${e.message}`).join("; ");
				throw new Error(`Invalid environment variable → ${message}`);
			}
			throw err;
		}
	}

	return result as InferSpec<S>;
}
