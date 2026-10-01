import { beforeEach, describe, expect, it, vi } from "vitest";

// In-memory stand-in for RedisStore. Every call yields to the event loop first, so concurrent
// verifies interleave the way they do against a real server.
const store = new Map<string, unknown>();
const tick = () => new Promise((resolve) => setImmediate(resolve));

vi.mock("@repo/redis", () => ({
	RedisStore: class {
		private ns: string;
		constructor(options?: { namespace?: string }) {
			this.ns = options?.namespace ?? "";
		}
		async get(key: string) {
			await tick();
			return store.get(`${this.ns}:${key}`) ?? null;
		}
		async set(key: string, value: unknown) {
			await tick();
			store.set(`${this.ns}:${key}`, value);
		}
		async del(key: string) {
			await tick();
			store.delete(`${this.ns}:${key}`);
		}
		async incr(key: string) {
			await tick();
			const next = ((store.get(`${this.ns}:${key}`) as number | undefined) ?? 0) + 1;
			store.set(`${this.ns}:${key}`, next);
			return next;
		}
	},
}));
vi.mock("@repo/env", () => ({ ENV: { NODE_ENV: "test" } }));
vi.mock("@repo/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@repo/mail", () => ({ EmailTemplate: vi.fn() }));
vi.mock("../mail-module/nodemailer.js", () => ({ SMTPMailService: { sendMail: vi.fn() } }));

const compare = vi.fn(async (plain: string, hash: string) => {
	await tick();
	return hash === `hash:${plain}`;
});
vi.mock("../hashing-module/index.js", () => ({
	HashingModule: {
		hash: (plain: string) => Promise.resolve(`hash:${plain}`),
		compare: (a: string, b: string) => compare(a, b),
	},
}));

const { OTPModule } = await import("./index.js");

const email = "user@example.com";
const seed = (otp = "123456") =>
	store.set(`otp:${email}`, { email, otp: `hash:${otp}`, status: "pending", expiresAt: Date.now() + 300_000 });

beforeEach(() => {
	store.clear();
	compare.mockClear();
});

describe("OTPModule.verifyMailOTP (B54)", () => {
	it("runs at most maxAttempts comparisons under concurrent wrong guesses", async () => {
		seed();
		const results = await Promise.all(Array.from({ length: 20 }, (_, i) => OTPModule.verifyMailOTP(email, `${i}`)));

		expect(results.every((r) => r === false)).toBe(true);
		expect(compare).toHaveBeenCalledTimes(5);
		expect(store.has(`otp:${email}`)).toBe(false);
		expect(store.has(`otp:${email}:attempts`)).toBe(false);
	});

	it("rejects the right code once the budget is spent", async () => {
		seed();
		for (let i = 0; i < 5; i++) await OTPModule.verifyMailOTP(email, "000000");
		expect(await OTPModule.verifyMailOTP(email, "123456")).toBe(false);
	});

	it("accepts the right code within the budget and marks it verified", async () => {
		seed();
		await OTPModule.verifyMailOTP(email, "000000");
		expect(await OTPModule.verifyMailOTP(email, "123456")).toBe(true);
		expect(await OTPModule.checkOTPStatus(email)).toBe(true);
	});

	it("gives a newly sent code a fresh budget", async () => {
		store.set(`otp:${email}:attempts`, 4);
		await OTPModule.sendMailOTP({ email });
		expect(store.has(`otp:${email}:attempts`)).toBe(false);
	});
});
