import { logger } from "@repo/logger";
import { Queue, Worker, QueueEvents, type ConnectionOptions, type JobsOptions, type WorkerOptions } from "bullmq";

import type { IQueueProvider, RegisterCronConfig } from "../queue-interface.js";
import { JobSchemas, type JobRegistry } from "../registry.js";
import type { JobContext, JobHandler, JobOptions } from "../types.js";

export class BullMQProvider implements IQueueProvider {
	private queues: Map<string, Queue> = new Map();
	private workers: Map<string, Worker> = new Map();
	private events: Map<string, QueueEvents> = new Map();

	constructor(
		private connection: ConnectionOptions = {
			host: "localhost",
			port: 6379,
		}
	) {}

	private mapOptions(options?: JobOptions): JobsOptions {
		if (!options) return {};

		return {
			jobId: options.jobId,
			delay: options.delay,
			attempts: options.attempts,
			backoff: options.backoff,
		};
	}

	getQueue(queueName: string): Queue {
		if (!this.queues.has(queueName)) {
			const queue = new Queue(queueName, {
				connection: this.connection,
			});

			this.queues.set(queueName, queue);
		}

		return this.queues.get(queueName)!;
	}

	async enqueue<K extends keyof JobRegistry>(
		queueName: K,
		params: JobRegistry[K]["params"],
		options?: JobOptions
	): Promise<string> {
		const validated = JobSchemas[queueName].params.parse(params);
		const queue = this.getQueue(queueName);
		const job = await queue.add("job", validated, this.mapOptions(options));

		return String(job.id);
	}

	async enqueueMany<K extends keyof JobRegistry>(
		queueName: K,
		paramsList: Array<JobRegistry[K]["params"]>,
		options?: JobOptions
	): Promise<string[]> {
		if (options?.jobId && paramsList.length > 1) {
			throw new Error("`jobId` cannot be shared across multiple jobs in enqueueMany()");
		}

		const queue = this.getQueue(queueName);
		const jobs = await queue.addBulk(
			paramsList.map(params => ({
				name: "job",
				data: JobSchemas[queueName].params.parse(params),
				opts: this.mapOptions(options),
			}))
		);

		return jobs.map(job => String(job.id));
	}

	async registerCron<K extends keyof JobRegistry>(config: RegisterCronConfig<K>): Promise<void> {
		const { queueName, schedulerId, cronExpression, params, handler, options } = config;

		const validated = JobSchemas[queueName].params.parse(params);
		const queue = this.getQueue(queueName);

		await queue.upsertJobScheduler(
			schedulerId,
			{ pattern: cronExpression },
			{
				name: "cron-job",
				data: validated,
				opts: this.mapOptions(options),
			}
		);

		this.registerWorker(queueName, handler, options);
	}

	async removeCron<K extends keyof JobRegistry>(queueName: K, schedulerId: string): Promise<boolean> {
		const queue = this.getQueue(queueName);
		return await queue.removeJobScheduler(schedulerId);
	}

	registerWorker<K extends keyof JobRegistry>(
		queueName: K,
		handler: JobHandler<JobRegistry[K]["params"], JobRegistry[K]["result"]>,
		options?: Omit<WorkerOptions, "connection">
	): void {
		if (this.workers.has(queueName)) {
			return;
		}

		logger.info(`Registering worker`, { queue: queueName, options });

		const worker = new Worker(
			queueName,
			async job => {
				try {
					const validData = JobSchemas[queueName].params.parse(job.data) as JobRegistry[K]["params"];
					const context: JobContext = {
						jobId: String(job.id),
						attemptsMade: job.attemptsMade,
					};
					return await handler(validData, context);
				} catch (error) {
					logger.error(`Job execution failed`, {
						queue: queueName,
						jobId: job.id,
						attemptsMade: job.attemptsMade,
						data: job.data,
						error,
					});
					throw error;
				}
			},
			{
				connection: this.connection,
				...options,
			}
		);

		worker.on("ready", () => logger.info(`Worker ready`, { queue: queueName }));
		worker.on("active", job => logger.debug(`Job started`, { queue: queueName, jobId: job.id }));
		worker.on("completed", job =>
			logger.info(`Job completed`, { queue: queueName, jobId: job.id, attemptsMade: job.attemptsMade })
		);
		worker.on("failed", (job, error) =>
			logger.error(`Job failed`, { queue: queueName, jobId: job?.id, attemptsMade: job?.attemptsMade, error })
		);
		worker.on("stalled", jobId => logger.warn(`Job stalled`, { queue: queueName, jobId }));
		worker.on("closing", () => logger.warn(`Worker closing`, { queue: queueName }));
		worker.on("closed", () => logger.warn(`Worker closed`, { queue: queueName }));
		worker.on("error", error => logger.error(`Worker error`, { queue: queueName, error }));

		void worker.client.then(client => {
			client.on("ready", () => logger.info(`Redis ready`, { queue: queueName }));
			client.on("reconnecting", () => logger.warn(`Redis reconnecting`, { queue: queueName }));
			client.on("end", () => logger.error(`Redis connection ended`, { queue: queueName }));
			client.on("error", error => logger.error(`Redis connection error`, { queue: queueName, error }));
		});

		this.workers.set(queueName, worker);
	}

	private getQueueEvents(queueName: string): QueueEvents {
		if (!this.events.has(queueName)) {
			const events = new QueueEvents(queueName, {
				connection: this.connection,
			});

			events.on("error", error => logger.error(`QueueEvents error`, { queue: queueName, error }));
			this.events.set(queueName, events);
		}
		return this.events.get(queueName)!;
	}

	onJobComplete<K extends keyof JobRegistry>(
		queueName: K,
		callback: (jobId: string, result: JobRegistry[K]["result"]) => void
	): void {
		const events = this.getQueueEvents(queueName);
		events.on("completed", ({ jobId, returnvalue }) => {
			try {
				callback(jobId, returnvalue as JobRegistry[K]["result"]);
			} catch (error) {
				logger.error("Job completion callback failed", { queue: queueName, jobId, error });
			}
		});
	}

	onJobFailed<K extends keyof JobRegistry>(queueName: K, callback: (jobId: string, error: Error) => void): void {
		const events = this.getQueueEvents(queueName);
		events.on("failed", ({ jobId, failedReason }) => {
			try {
				callback(jobId, new Error(failedReason));
			} catch (error) {
				logger.error("Job failure callback failed", { queue: queueName, jobId, error });
			}
		});
	}

	async close(): Promise<void> {
		logger.warn("Shutting down queue system...");

		const workerResults = await Promise.allSettled(Array.from(this.workers.values()).map(worker => worker.close()));
		const eventResults = await Promise.allSettled(Array.from(this.events.values()).map(event => event.close()));
		const queueResults = await Promise.allSettled(Array.from(this.queues.values()).map(queue => queue.close()));

		[...workerResults, ...eventResults, ...queueResults]
			.filter((result): result is PromiseRejectedResult => result.status === "rejected")
			.forEach(result => {
				logger.error("Error during shutdown", result.reason);
			});

		logger.warn("Queue system shut down safely.");
	}
}
