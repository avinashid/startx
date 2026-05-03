import { logger } from "@repo/logger";
import { Queue, Worker, QueueEvents, type ConnectionOptions, type JobsOptions } from "bullmq";
import type { IQueueProvider } from "../queue-interface.js";
import { JobSchemas, type JobRegistry } from "../registry.js";
import type { JobOptions, JobHandler, JobContext } from "../types.js";

export class BullMQProvider implements IQueueProvider {
	private queues: Map<string, Queue> = new Map();
	private workers: Worker[] = [];
	private events: Map<string, QueueEvents> = new Map();

	constructor(private connection: ConnectionOptions = { host: "localhost", port: 6379 }) {}

	private mapOptions(options?: JobOptions): JobsOptions {
		if (!options) return {};
		return {
			jobId: options.jobId,
			delay: options.delay,
			attempts: options.attempts,
			backoff: options.backoff,
		};
	}

	private getQueue(queueName: string): Queue {
		if (!this.queues.has(queueName)) {
			this.queues.set(queueName, new Queue(queueName, { connection: this.connection }));
		}
		return this.queues.get(queueName)!;
	}

	async enqueue<K extends keyof JobRegistry>(
		queueName: K,
		params: JobRegistry[K]["params"],
		options?: JobOptions
	): Promise<string> {
		const validated = JobSchemas[queueName].params.parse(params);
		const queue = this.getQueue(queueName as string);
		const job = await queue.add("job", validated, this.mapOptions(options));
		return job.id!;
	}

	async enqueueMany<K extends keyof JobRegistry>(
		queueName: K,
		paramsList: Array<JobRegistry[K]["params"]>,
		options?: JobOptions
	): Promise<string[]> {
		const queue = this.getQueue(queueName as string);
		const bullOptions = this.mapOptions(options);

		const jobsToPush = paramsList.map(params => ({
			name: "job",
			data: JobSchemas[queueName].params.parse(params) as JobRegistry[K]["params"],
			opts: bullOptions,
		}));

		const jobs = await queue.addBulk(jobsToPush);
		return jobs.map(j => j.id!);
	}

	registerWorker<K extends keyof JobRegistry>(
		queueName: K,
		handler: JobHandler<JobRegistry[K]["params"], JobRegistry[K]["result"]>,
		options: {
			concurrency?: number;
		}
	): void {
		logger.info(
			`Registering worker for queue ${queueName} with options ${Object.entries(options)
				.map(([k, v]) => `${k}: ${v}`)
				.join(", ")}`
		);
		const worker = new Worker(
			queueName as string,
			async job => {
				const validData = JobSchemas[queueName].params.parse(job.data) as JobRegistry[K]["params"];

				const context: JobContext = {
					jobId: job.id!,
					attemptsMade: job.attemptsMade,
				};

				const result = await handler(validData, context);
				return result;
			},
			{ connection: this.connection, concurrency: options.concurrency }
		);
		this.workers.push(worker);
	}

	private getQueueEvents(queueName: string): QueueEvents {
		if (!this.events.has(queueName)) {
			this.events.set(queueName, new QueueEvents(queueName, { connection: this.connection }));
		}
		return this.events.get(queueName)!;
	}

	onJobComplete<K extends keyof JobRegistry>(
		queueName: K,
		callback: (jobId: string, result: JobRegistry[K]["result"]) => void
	): void {
		const events = this.getQueueEvents(queueName as string);
		events.on("completed", ({ jobId, returnvalue }) => {
			// Cast the Redis returnvalue to our strongly typed result
			callback(jobId, returnvalue as JobRegistry[K]["result"]);
		});
	}

	onJobFailed<K extends keyof JobRegistry>(queueName: K, callback: (jobId: string, error: Error) => void): void {
		const events = this.getQueueEvents(queueName as string);
		events.on("failed", ({ jobId, failedReason }) => callback(jobId, new Error(failedReason)));
	}

	async close(): Promise<void> {
		logger.warn("Shutting down queue system...");

		await Promise.all(this.workers.map(w => w.close()));
		await Promise.all(Array.from(this.events.values()).map(e => e.close()));
		await Promise.all(Array.from(this.queues.values()).map(q => q.close()));

		logger.warn("Queue system shut down safely.");
	}
}
