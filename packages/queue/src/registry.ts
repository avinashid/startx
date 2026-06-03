import { z } from "zod";
import { commonQueue } from "./common/index.js";

export const JobSchemas = {
	...commonQueue,
} as const;

export type JobRegistry = {
	[K in keyof typeof JobSchemas]: {
		params: z.infer<(typeof JobSchemas)[K]["params"]>;
		result: (typeof JobSchemas)[K] extends { result: infer R extends z.ZodTypeAny } ? z.infer<R> : undefined;
	};
};
