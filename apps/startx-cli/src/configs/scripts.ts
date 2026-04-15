import type { SCRIPT } from "../types";

export const scripts: SCRIPT = {
	"dev": [
		{
			script: "turbo run dev",
			tags: ["runnable", "root"],
		},
		{
			script: "tsx watch src/index.ts",
			tags: ["runnable", "node", "backend", "express"],
		},
		{
			script: "email dev --port 3014 --dir ./src",
			tags: ["node", "mail"],
		},
	],
	"dev:debug": [
		{
			script: "turbo run dev:debug",
			tags: ["node", "runnable", "root"],
		},
		{
			script: "tsx watch --inspect src/index.ts",
			tags: ["backend", "node", "runnable", "express"],
		},
	],
	"bun:dev": [
		{
			script: "turbo run bun:dev",
			tags: ["node", "runnable", "root"],
		},
		{
			script: "bun --watch src/index.ts",
			tags: ["backend", "node", "runnable", "express"],
		},
	],
	"build": [
		{
			script: "turbo run build",
			tags: ["runnable", "root"],
		},
		{
			script: "tsdown --config-loader unrun",
			tags: ["runnable", "node", "tsdown"],
		},
	],
	"cli": [
		{
			script: "turbo run cli -- ",
			tags: ["runnable", "node", "cli", "root"],
		},
		{
			script: "tsx src/index.ts",
			tags: ["runnable", "node", "cli", "commander"],
		},
	],
	"start": [
		{
			script: "turbo run start",
			tags: ["backend", "runnable", "node", "root"],
		},
		{
			script: "node dist/index.mjs",
			tags: ["node", "runnable"],
		},
	],
	"lint": [
		{
			script: "turbo run eslint",
			tags: ["node", "eslint", "root"],
		},
		{
			script: "eslint .",
			tags: ["node", "eslint"],
		},
	],
	"lint:fix": [
		{
			script: "turbo run lint:fix",
			tags: ["node", "eslint", "root"],
		},
		{
			script: "eslint . src/**/*.ts --fix",
			tags: ["node", "eslint"],
		},
	],
	"clean": [
		{
			script: "turbo run clean",
			tags: ["root"],
		},
		{
			script: "rimraf dist .turbo dist",
			tags: [],
		},
	],
	"deep:clean": [
		{
			script: "turbo run deep:clean",
			tags: ["root"],
		},
		{
			script: "rimraf node_modules dist .turbo",
			tags: ["node"],
		},
	],
	"db:push": [
		{
			script: "drizzle-kit push",
			tags: ["drizzle", "db"],
		},
		{
			script: "turbo run db:push",
			tags: ["db", "root"],
		},
	],
	"db:studio": [
		{
			script: "drizzle-kit studio",
			tags: ["drizzle", "db"],
		},
		{
			script: "turbo run db:studio",
			tags: ["db", "root"],
		},
	],
	"typecheck": [
		{
			script: "turbo run typecheck",
			tags: ["node", "root"],
		},
		{
			script: "tsc --noEmit",
			tags: ["node"],
		},
	],
	"format": [
		{
			script: "turbo run format",
			tags: ["node", "root"],
		},
		{
			script: "biome format --write .",
			tags: ["node", "biome", "prettier"],
		},
		{
			"script": "prettier --write .",
			"tags": ["node", "prettier"],
		},
	],
	"format:check": [
		{
			script: "turbo run format:check",
			tags: ["node", "root"],
		},
		{
			script: "biome ci .",
			tags: ["node", "biome", "prettier"],
		},
		{
			"script": "prettier --check .",
			"tags": ["node", "prettier"],
		},
	],
	"test": [
		{
			script: "turbo run test",
			tags: ["node", "vitest", "root"],
		},
		{
			script: "vitest run",
			tags: ["node", "vitest"],
		},
	],
} as const;
