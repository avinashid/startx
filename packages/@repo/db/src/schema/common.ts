import { pgTable, uuid, varchar, timestamp, pgEnum, text } from "drizzle-orm/pg-core";

// Helper function to generate current timestamp

export const userRoleEnum = pgEnum("user_role", ["user", "admin", "superuser"]);

export const usersTable = pgTable("users", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	fullName: varchar("full_name", { length: 255 }).default("Guest").notNull(),
	password: varchar("password", { length: 255 }).default("foresight").notNull(),
	countries: varchar("countries", { length: 255 }).array().notNull().default([]),
	verifiedAt: timestamp("verified_at"),
	pwdUpdatedAt: timestamp("pwd_updated_at"),
	deletedAt: timestamp("deleted_at"),
	createdAt: timestamp("created_at").defaultNow(),
	lastLoginAt: timestamp("last_login_at").defaultNow(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date()),
});

export const filesTable = pgTable("files", {
	id: uuid("id").primaryKey().defaultRandom(),
	fileName: varchar("file_name", { length: 255 }).notNull(),
	url: text("url").notNull(),
	mimetype: text("mimetype").notNull(),
	preview: text("preview"),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date()),
});

export const otps = pgTable("otp", {
	id: uuid("id").primaryKey().defaultRandom(),
	email: varchar("email", { length: 255 }).notNull().unique(),
	phone: varchar("phone", { length: 50 }),
	status: varchar("status", { enum: ["pending", "verified"] })
		.notNull()
		.default("pending"),
	otp: varchar("otp", { length: 255 }).notNull(),
	createdAt: timestamp("created_at").defaultNow(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => new Date()),
});

// ----------------------------------------------------------------------------
