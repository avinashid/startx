import type { WorkerOptions } from "bullmq";
import type { JobRegistry } from "./registry.js";
import type { JobOptions, JobHandler } from "./types.js";
export interface RegisterCronConfig<K extends keyof JobRegistry> {
	queueName: K;
	schedulerId: string;
	cronExpression: string;
	params: JobRegistry[K]["params"];
	handler: JobHandler<JobRegistry[K]["params"], JobRegistry[K]["result"]>;
	options?: Omit<JobOptions, "delay" | "jobId"> & Omit<WorkerOptions, "connection">;
}
export interface IQueueProvider {
	enqueue<K extends keyof JobRegistry>(
		queueName: K,
		params: JobRegistry[K]["params"],
		options?: JobOptions
	): Promise<string>;

	enqueueMany<K extends keyof JobRegistry>(
		queueName: K,
		paramsList: Array<JobRegistry[K]["params"]>,
		options?: JobOptions
	): Promise<string[]>;

	registerWorker<K extends keyof JobRegistry>(
		queueName: K,
		handler: JobHandler<JobRegistry[K]["params"], JobRegistry[K]["result"]>,
		options?: unknown
	): void;
	registerCron<K extends keyof JobRegistry>(config: RegisterCronConfig<K>): Promise<void>;
	removeCron<K extends keyof JobRegistry>(queueName: K, schedulerId: string): Promise<boolean>;
	onJobComplete<K extends keyof JobRegistry>(
		queueName: K,
		callback: (jobId: string, result: JobRegistry[K]["result"]) => void
	): void;

	onJobFailed<K extends keyof JobRegistry>(queueName: K, callback: (jobId: string, error: Error) => void): void;

	close(): Promise<void>;
}
