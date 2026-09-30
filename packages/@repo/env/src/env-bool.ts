import { z } from "zod";

// NOT z.coerce.boolean(): that is Boolean(value), so the string "false" would coerce to true.
// "" is deliberately not accepted — an explicitly blank var is a misconfiguration, and silently
// reading it as false is how a cluster-mode deployment quietly connects to a single node.
export const envBool = (def = false) =>
	z
		.enum(["true", "false", "1", "0"])
		.default(def ? "true" : "false")
		.transform((v) => v === "true" || v === "1");
