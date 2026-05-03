import type { JobRegistry } from "./registry.js";
import type { JobOptions, JobHandler } from "./types.js";

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
		options: {
			concurrency?: number;
		}
	): void;

	onJobComplete<K extends keyof JobRegistry>(
		queueName: K,
		callback: (jobId: string, result: JobRegistry[K]["result"]) => void
	): void;

	onJobFailed<K extends keyof JobRegistry>(queueName: K, callback: (jobId: string, error: Error) => void): void;

	close(): Promise<void>;
}
