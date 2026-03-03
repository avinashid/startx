import z from "zod";
import { defineEnv } from "./define-env.js";

export const ENV = defineEnv({
	NODE_ENV: z.enum(["development", "production", "test", "staging"]).default("development"),
	CLIENT_URL: z.string().optional().default("http://localhost:5000"),
	SERVER_URL: z.string().optional().default("http://localhost:3000"),
});
