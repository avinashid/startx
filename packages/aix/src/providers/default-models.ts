import type { AiProvider } from "./types.js";

export const DefaultAiModels = {
	groq: [
		"gemma2-9b-it",
		"meta-llama/llama-guard-4-12b",
		"llama-3.3-70b-versatile",
		"llama-3.1-8b-instant",
		"llama3-70b-8192",
		"llama3-8b-8192",
	],
	openAi: [
		"meta-llama/llama-4-scout:free",
		"meta-llama/llama-4-scout:free-instruct",
		"meta-llama/llama-4-scout:free-instruct-8k",
		"meta-llama/llama-4-scout:free-instruct-8k-v2",
	],
	cloudflare: [
		"@cf/meta/llama-3.1-8b-instruct",
		"@cf/meta/llama-3.3-70b-instruct",
		"@cf/meta/llama-3.3-70b-8192-instruct",
	],
	gemini: [
		"gemini-2.5-pro",
		"gemini-2.5-flash",
		"gemini-2.5-flash-lite",
		"gemini-2.0-flash",
		"gemini-2.0-pro",
		"gemini-3-flash-preview",
		"gemini-3.1-flash-lite-preview",
	],
	anthropic: [
		"claude-opus-4.6",
		"claude-opus-4.5",
		"claude-opus-4.1",

		"claude-sonnet-4.6",
		"claude-sonnet-4.5",

		"claude-haiku-4.5",

		"claude-3.7-sonnet",
		"claude-3.5-sonnet",
		"claude-3.5-haiku",

		"claude-3-opus",
		"claude-3-sonnet",
		"claude-3-haiku",
	],
} as const satisfies Record<AiProvider, readonly string[]>;
