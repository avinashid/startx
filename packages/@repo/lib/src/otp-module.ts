import  { db, otps } from "@repo/db";
import { AdminEmailTemplate } from "@repo/email";
import { eq } from "drizzle-orm";

import { HashingModule } from "./hashing-module.js";
import { SMTPMailService } from "./mail-module/nodemailer.js";
import { Random } from "./utils.js";

/**
 * @description Handles operations related to One Time Passwords (OTPs).
 */
export class OTPModule {
	/**
	 * @description Generates a random OTP and sends it to the user's email via email service.
	 * @param {{ email: string; name: string }} options
	 * @returns {Promise<void>}
	 */
	static async sendMailOTP({ email }: { email: string }): Promise<void> {
		const otp = Random.generateNumber(4);
		const hash = await HashingModule.hash(otp.toString());
		// const otpDoc = await db.query.otps.findFirst({
		// 	where: (data, { eq }) => eq(data.email, email),
		// });
		const otpDoc = await db.select().from(otps).where(eq(otps.email, email));
		if (otpDoc) {
			await db.update(otps).set({ otp: hash }).where(eq(otps.email, email));
		} else {
			await db.insert(otps).values([{ email, otp: hash }]);
		}
		if (["test", ""].includes(process.env.NODE_ENV)) {
			// await MockMailService.sendMail({
			//   to: email,
			//   text: `your otp is ${otp}`,
			// });
		} else {
			const html = await AdminEmailTemplate.getOtpEmail({
				otp: otp.toString(),
			});
			await SMTPMailService.sendMail(email, `OTP for ${email}`, `your otp is ${otp}`, html);
		}
	}

	/**
	 * @description Verifies the OTP sent to the user's email.
	 * @param {string} email
	 * @param {string} otp
	 * @param {boolean} [deleteOtp=true] whether to delete the OTP doc after verification
	 * @returns {Promise<boolean>}
	 */
	static async verifyMailOTP(email: string, otp: string, deleteOtp = false): Promise<boolean> {
		// const EXPIRATION_CONSTANT = 5 * 60 * 1000;
		// const expirationTime = new Date(Date.now() + EXPIRATION_CONSTANT).getTime();

		if (["test", "development"].includes(process.env.NODE_ENV)) return true;

		// const otpDoc = await db.query.otps.findFirst({
		// 	where: (data, { eq }) => and(eq(data.email, email)),
		// });
		const otpDoc = await db.select().from(otps).where(eq(otps.email, email));
		if (["test", "development"].includes(process.env.NODE_ENV)) return true;
		if (!otpDoc.length) return false;

		const firstOtp = otpDoc[0];

		const verified = await HashingModule.compare(otp, firstOtp.otp);
		if (!verified) return false;
		if (deleteOtp) {
			await db.delete(otps).where(eq(otps.email, email));
		} else {
			await db.update(otps).set({ status: "verified" }).where(eq(otps.email, email));
		}
		return true;
	}

	/**
	 * @description Checks if the OTP has been verified.
	 * @param {string} email
	 * @returns {Promise<boolean>}
	 */
	static async checkOTPStatus(email: string): Promise<boolean> {
		// const otpDoc = await db.query.otps.findFirst({
		// 	where: (data, { eq }) => eq(data.email, email),
		// });
		const otpDoc = await db.select().from(otps).where(eq(otps.email, email));
		if (!otpDoc) return false;
		const firstOtp = otpDoc[0];
		return firstOtp.status === "verified";
	}
	static async deleteOTP(email: string): Promise<boolean> {
		const otpDoc = await db.select().from(otps).where(eq(otps.email, email));
		// const otpDoc = await db.query.otps.findFirst({
		// 	where: (data, { eq }) => eq(data.email, email),
		// });
		if (!otpDoc) return false;
		await db.delete(otps).where(eq(otps.email, email));
		return true;
	}
}
