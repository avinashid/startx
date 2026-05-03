import type { z } from "zod";

export interface JobOptions {
	jobId?: string;
	delay?: number;
	attempts?: number;

	backoff?: {
		type: "fixed" | "exponential";
		delay: number;
	};
}

export interface JobContext {
	jobId: string;
	attemptsMade: number;
}

export type JobHandler<TParams, TResult> = (params: TParams, context: JobContext) => Promise<TResult> | TResult;

export type QueueDefinition = Record<string, { params: z.ZodTypeAny; result?: z.ZodTypeAny }>;
export function defineQueue<T extends QueueDefinition>(definition: T): T {
	return definition;
}
