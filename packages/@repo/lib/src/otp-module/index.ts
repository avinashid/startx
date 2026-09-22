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
	attempts: number;
	/** Epoch ms. Lets a re-set preserve the remaining lifetime instead of extending it. */
	expiresAt: number;
};

const getRedis = () => {
	return new RedisStore<OtpRecord>({
		namespace: "otp",
	});
};

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
					attempts: 0,
					expiresAt: Date.now() + this.otpExpirySeconds * 1000,
				},
				this.otpExpirySeconds
			);
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

		const verified = await HashingModule.compare(otp, rows.otp);

		if (!verified) {
			const attempts = (rows.attempts ?? 0) + 1;

			if (attempts >= this.maxAttempts) {
				await getRedis().del(normalizedEmail);
				logger?.warn("otp: max attempts reached, code destroyed", { email: normalizedEmail });
				return false;
			}

			// Re-set with the REMAINING lifetime — a failed guess must never extend the window.
			await getRedis().set(normalizedEmail, { ...rows, attempts }, this.remainingSeconds(rows.expiresAt));
			return false;
		}

		if (deleteOtp) {
			await getRedis().del(normalizedEmail);
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
		await getRedis().del(normalizedEmail);
		return true;
	}
}
