
export class MemoryProfiler {
	private startUsage: number | null = null;
	private lastUsage: number | null = null;
	private totalDelta = 0;
	private state: "off" | "on" = "on";
	private startTime: number | null = null;
	private lastTime: number | null = null;

	 setState(state: "on" | "off") {
		this.state = state;
	}

	start(): void {
		const usage = process.memoryUsage().heapUsed;
		const now = Date.now();
		this.startUsage = usage;
		this.lastUsage = usage;
		this.startTime = now;
		this.lastTime = now;
		this.totalDelta = 0;

		if (this.state === "off") return;
		console.log(`[Profiler] Started at ${this.formatMB(usage)}`);
	}

	 at(label: string = ""): void {
		if (this.startUsage === null || this.startTime === null) {
			throw new Error("Profiler not started. Call .start() first.");
		}

		const usage = process.memoryUsage().heapUsed;
		const now = Date.now();

		const deltaFromStart = usage - this.startUsage;
		const deltaFromLast = usage - (this.lastUsage ?? usage);

		const timeFromStart = now - this.startTime;
		const timeFromLast = now - (this.lastTime ?? now);

		this.totalDelta = deltaFromStart;

		if (this.state === "on") {
			console.log(
				`[Profiler] ${label ? label + " - " : ""}` +
					`since start: ${this.formatMB(deltaFromStart)} | ${this.formatMS(timeFromStart)}, ` +
					`since last: ${this.formatMB(deltaFromLast)} | ${this.formatMS(timeFromLast)}, ` +
					`current heap: ${this.formatMB(usage)}`
			);
		}

		this.lastUsage = usage;
		this.lastTime = now;
	}

	private formatMB(bytes: number): string {
		return (bytes / 1024 / 1024).toFixed(2) + " MB";
	}

	private formatMS(ms: number): string {
		if (ms < 1000) return `${ms} ms`;
		const sec = (ms / 1000).toFixed(2);
		return `${sec} s`;
	}
}
