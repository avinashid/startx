import { db, eq, otps } from "@repo/db";
import { AdminEmailTemplate } from "@repo/email";
import { ENV } from "@repo/env";

import { HashingModule } from "../hashing-module/index.js";
import { logger } from "@repo/logger";
import { SMTPMailService } from "../mail-module/nodemailer.js";
import { Random } from "../utils.js";

export class OTPModule {
	static OTP_EXPIRATION_MS = 5 * 60 * 1000; // 5 minutes

	static async sendMailOTP({ email }: { email: string }): Promise<void> {
		const normalizedEmail = email.trim().toLowerCase();

		// Generate OTP as a 4-digit string (preserve leading zeros)
		const otpStr = String(Random.generateNumber(4)).padStart(4, "0");
		const hash = await HashingModule.hash(otpStr);

		// Read existing row (limit 1)
		const rows = await db.select().from(otps).where(eq(otps.email, normalizedEmail));
		const exists = rows.length > 0;

		try {
			if (exists) {
				await db.update(otps).set({ otp: hash }).where(eq(otps.email, normalizedEmail));
			} else {
				await db.insert(otps).values([{ email: normalizedEmail, otp: hash }]);
			}
		} catch (err) {
			logger?.error("otp: db write failed", { email: normalizedEmail, err });
			throw err;
		}

		// Do not leak OTP in non-test environments
		if (["test"].includes(ENV.NODE_ENV)) {
			// optionally: mock mail send for tests
			logger?.info("otp: test-mode - OTP generated", { email: normalizedEmail, otp: otpStr });
			return;
		}

		const html = await AdminEmailTemplate.getOtpEmail({ otp: otpStr });
		await SMTPMailService.sendMail(
			normalizedEmail,
			`OTP for ${normalizedEmail}`,
			`Your OTP is ${otpStr}`,
			html
		);
	}

	static async verifyMailOTP(email: string, otp: string, deleteOtp = false): Promise<boolean> {
		const normalizedEmail = email.trim().toLowerCase();

		// shortcut for test/dev environments — be careful with this in real dev
		if (["test"].includes(ENV.NODE_ENV)) return true;

		const rows = await db.select().from(otps).where(eq(otps.email, normalizedEmail));
		if (rows.length === 0) return false;

		const firstOtp = rows[0];

		const updatedAtMs = firstOtp.updatedAt ? new Date(firstOtp.updatedAt).getTime() : 0;
		if (Date.now() - updatedAtMs > OTPModule.OTP_EXPIRATION_MS) {
			// expired
			return false;
		}

		const verified = await HashingModule.compare(otp, firstOtp.otp);
		if (!verified) return false;

		if (deleteOtp) {
			await db.delete(otps).where(eq(otps.email, normalizedEmail));
		} else {
			await db.update(otps).set({ status: "verified" }).where(eq(otps.email, normalizedEmail));
		}
		return true;
	}

	static async checkOTPStatus(email: string): Promise<boolean> {
		const normalizedEmail = email.trim().toLowerCase();
		const rows = await db.select().from(otps).where(eq(otps.email, normalizedEmail));
		if (rows.length === 0) return false;
		return rows[0].status === "verified";
	}

	static async deleteOTP(email: string): Promise<boolean> {
		const normalizedEmail = email.trim().toLowerCase();
		const rows = await db.select().from(otps).where(eq(otps.email, normalizedEmail));
		if (rows.length === 0) return false;
		await db.delete(otps).where(eq(otps.email, normalizedEmail));
		return true;
	}
}
