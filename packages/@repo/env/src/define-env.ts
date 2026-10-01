import type { ZodTypeAny } from "zod";
import { ZodError, z } from "zod";

import { blankRejecting } from "./env-bool.js";
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

function isZod(v: SpecEntry): v is ZodTypeAny {
	return typeof v === "object" && v !== null && "parse" in v;
}

export function defineEnv<S extends Spec>(spec: S): InferSpec<S> {
	const rawEnv: Record<string, unknown> = {};
	const zodShape: Record<string, ZodTypeAny> = {};

	for (const key of Object.keys(spec) as Array<keyof S>) {
		const entry = spec[key];

		const normalized = isZod(entry)
			? { schema: entry, default: undefined, env: key as string }
			: {
					schema: entry.schema,
					default: entry.default,
					env: entry.env ?? (key as string),
				};

		// Read only — never mutate process.env. Deleting keys here (NODE_ENV, PORT, ...) makes
		// every library that reads process.env directly take its development path.
		const raw = process.env[normalized.env];

		// A blank value counts as unset, except for schemas that reject it on purpose (envBool).
		const unset = raw === undefined || (raw === "" && !blankRejecting.has(normalized.schema));
		rawEnv[key as string] = unset ? normalized.default : raw;

		zodShape[key as string] = normalized.schema;
	}

	try {
		const result = z.object(zodShape).parse(rawEnv);
		return result as InferSpec<S>;
	} catch (err: unknown) {
		if (err instanceof ZodError) {
			const messages = err.issues.map((e) => `${e.path.join(".")}: ${e.message}`);

			throw new Error(`Invalid environment variables:\n  ❌ ${messages.join("\n  ❌ ")}`);
		}
		throw err;
	}
}
