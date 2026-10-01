import type { ZodTypeAny } from "zod";
import { z } from "zod";

// Schemas that must see a blank value as-is. defineEnv otherwise treats `VAR=` as unset and
// falls back to the default, which is right for strings but would make `envBool` read "" as false.
export const blankRejecting = new WeakSet<ZodTypeAny>();

// NOT z.coerce.boolean(): that is Boolean(value), so the string "false" would coerce to true.
// "" is deliberately not accepted — an explicitly blank var is a misconfiguration, and silently
// reading it as false is how a cluster-mode deployment quietly connects to a single node.
export const envBool = (def = false) => {
	const schema = z
		.enum(["true", "false", "1", "0"])
		.default(def ? "true" : "false")
		.transform((v) => v === "true" || v === "1");
	blankRejecting.add(schema);
	return schema;
};
