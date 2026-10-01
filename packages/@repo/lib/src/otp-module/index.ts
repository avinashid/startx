import { Time } from "@repo/common/time";
import { ENV } from "@repo/env";
import { logger } from "@repo/logger";
import { EmailTemplate } from "@repo/mail";
import { RedisStore } from "@repo/redis";

import { HashingModule } from "../hashing-module/index.js";
import { SMTPMailService } from "../mail-module/nodemailer.js";
import { Random } from "../utils.js";

type OtpRecord = {
	email: string;
	otp: string;
	status: "pending" | "verified";
	/** Epoch ms. Lets a re-set preserve the remaining lifetime instead of extending it. */
	expiresAt: number;
};

const getRedis = () => {
	return new RedisStore<OtpRecord>({
		namespace: "otp",
	});
};

// Failed-guess counter, kept in its own key so it can be bumped with an atomic INCR. A
// read-modify-write on the record let N concurrent guesses all read the same count (B54).
const attemptsKey = (email: string) => `${email}:attempts`;

export class OTPModule {
	/** RedisStore.set takes SECONDS. The unit is in the name so it cannot drift again. */
	private static otpExpirySeconds = Time.minutes(5).seconds;

	private static otpDigits = 6;

	/** The code is destroyed after this many failed guesses. */
	private static maxAttempts = 5;

	/** Seconds left before `expiresAt`, floored at 1 so a re-set never revives a dead key. */
	private static remainingSeconds(expiresAt: number) {
		return Math.max(1, Math.ceil((expiresAt - Date.now()) / 1000));
	}

	static async sendMailOTP({ email }: { email: string }): Promise<void> {
		const normalizedEmail = email.trim().toLowerCase();

		// Uniform over the whole keyspace, leading zeros included.
		const otpStr = Random.generateCode(this.otpDigits);
		const hash = await HashingModule.hash(otpStr);

		try {
			await getRedis().set(
				normalizedEmail,
				{
					email: normalizedEmail,
					otp: hash,
					status: "pending",
					expiresAt: Date.now() + this.otpExpirySeconds * 1000,
				},
				this.otpExpirySeconds,
			);
			// A fresh code gets a fresh budget of guesses.
			await getRedis().del(attemptsKey(normalizedEmail));
		} catch (err) {
			logger?.error("otp: redis write failed", { email: normalizedEmail, err });
			throw err;
		}

		// Do not leak OTP in non-test environments
		if (["test", "development"].includes(ENV.NODE_ENV)) {
			// optionally: mock mail send for tests
			logger?.info("otp: test-mode - OTP generated", { email: normalizedEmail, otp: otpStr });
			return;
		}
		const html = await EmailTemplate("VerifyEmailOtp", {
			verificationCode: otpStr,
		});
		await SMTPMailService.sendMail({
			to: email,
			subject: "Verify your email",
			text: `Your verification code is: ${otpStr}`,
			html,
		});
	}

	static async verifyMailOTP(email: string, otp: string, deleteOtp = false): Promise<boolean> {
		const normalizedEmail = email.trim().toLowerCase();

		const rows = await getRedis().get(normalizedEmail);
		if (!rows?.otp) return false;

		// Reserve an attempt BEFORE comparing. Every caller gets a distinct number, so at most
		// maxAttempts comparisons can ever run against one code, however many arrive at once.
		const attempt = await getRedis().incr(attemptsKey(normalizedEmail), this.remainingSeconds(rows.expiresAt));
		if (attempt > this.maxAttempts) {
			await this.destroy(normalizedEmail);
			return false;
		}

		const verified = await HashingModule.compare(otp, rows.otp);

		if (!verified) {
			if (attempt >= this.maxAttempts) {
				await this.destroy(normalizedEmail);
				logger?.warn("otp: max attempts reached, code destroyed", { email: normalizedEmail });
			}
			return false;
		}

		if (deleteOtp) {
			await this.destroy(normalizedEmail);
		} else {
			await getRedis().set(normalizedEmail, { ...rows, status: "verified" }, this.remainingSeconds(rows.expiresAt));
		}
		return true;
	}

	static async checkOTPStatus(email: string): Promise<boolean> {
		const normalizedEmail = email.trim().toLowerCase();
		const rows = await getRedis().get(normalizedEmail);
		if (!rows?.otp) return false;
		return rows.status === "verified";
	}

	static async deleteOTP(email: string): Promise<boolean> {
		const normalizedEmail = email.trim().toLowerCase();
		await this.destroy(normalizedEmail);
		return true;
	}

	private static async destroy(normalizedEmail: string) {
		await getRedis().del(normalizedEmail);
		await getRedis().del(attemptsKey(normalizedEmail));
	}
}
