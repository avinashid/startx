type TimeUnit = "milliseconds" | "seconds" | "minutes" | "hours" | "days" | "weeks";

const UNIT_IN_MS: Record<TimeUnit, number> = {
	milliseconds: 1,
	seconds: 1000,
	minutes: 60 * 1000,
	hours: 60 * 60 * 1000,
	days: 24 * 60 * 60 * 1000,
	weeks: 7 * 24 * 60 * 60 * 1000,
};

export class Time {
	private ms: number;

	constructor(value: number, unit: TimeUnit = "milliseconds") {
		this.ms = value * UNIT_IN_MS[unit];
	}

	// factory methods
	static ms(value: number) {
		return new Time(value, "milliseconds");
	}

	static seconds(value: number) {
		return new Time(value, "seconds");
	}

	static minutes(value: number) {
		return new Time(value, "minutes");
	}

	static hours(value: number) {
		return new Time(value, "hours");
	}

	static days(value: number) {
		return new Time(value, "days");
	}

	static weeks(value: number) {
		return new Time(value, "weeks");
	}

	// generic converter
	to(unit: TimeUnit): number {
		return this.ms / UNIT_IN_MS[unit];
	}

	// convenience getters
	get milliseconds() {
		return this.to("milliseconds");
	}

	get seconds() {
		return this.to("seconds");
	}

	get minutes() {
		return this.to("minutes");
	}

	get hours() {
		return this.to("hours");
	}

	get days() {
		return this.to("days");
	}

	get weeks() {
		return this.to("weeks");
	}

	// arithmetic
	add(value: number, unit: TimeUnit) {
		this.ms += value * UNIT_IN_MS[unit];
		return this;
	}

	subtract(value: number, unit: TimeUnit) {
		this.ms -= value * UNIT_IN_MS[unit];
		return this;
	}

	format() {
		if (this.ms < UNIT_IN_MS.seconds) return `${this.ms}ms`;
		if (this.ms < UNIT_IN_MS.minutes) return `${this.seconds}s`;
		if (this.ms < UNIT_IN_MS.hours) return `${this.minutes}m`;
		if (this.ms < UNIT_IN_MS.days) return `${this.hours}h`;
		return `${this.days}d`;
	}

	valueOf() {
		return this.ms;
	}
}
