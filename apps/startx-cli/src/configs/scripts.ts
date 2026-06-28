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
		{
			script: "react-router dev",
			tags: ["react-router", "frontend"],
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
			script: "react-router build",
			tags: ["react-router", "frontend", "runnable"],
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
			script: "vite preview",
			tags: ["react-router", "frontend", "runnable"],
		},
		{
			script: "node dist/index.mjs",
			tags: ["node", "runnable"],
		},
	],
	"lint": [
		{
			script: "turbo run lint",
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
			script: "eslint . --fix",
			tags: ["node", "eslint"],
		},
	],
	"clean": [
		{
			script: "turbo run clean",
			tags: ["root"],
		},
		{
			script: "rimraf dist build .turbo",
			tags: [],
		},
	],
	"deep:clean": [
		{
			script: "turbo run deep:clean",
			tags: ["root"],
		},
		{
			script: "rimraf node_modules dist build .turbo",
			tags: ["node"],
		},
	],
	"db:push": [
		{
			script: "turbo run db:push",
			tags: ["db", "root"],
		},
		{
			script: "drizzle-kit push",
			tags: ["drizzle", "db"],
		},
	],
	"db:studio": [
		{
			script: "turbo run db:studio",
			tags: ["db", "root"],
		},
		{
			script: "drizzle-kit studio",
			tags: ["drizzle", "db"],
		},
	],
	"db:pull": [
		{
			script: "turbo run db:pull",
			tags: ["db", "root"],
		},
		{
			script: "drizzle-kit pull",
			tags: ["drizzle", "db"],
		},
	],
	"db:generate": [
		{
			script: "turbo run db:generate",
			tags: ["db", "root"],
		},
		{
			script: "drizzle-kit generate",
			tags: ["drizzle", "db"],
		},
	],
	"db:migrate": [
		{
			script: "turbo run db:migrate",
			tags: ["db", "root"],
		},
		{
			script: "drizzle-kit migrate",
			tags: ["drizzle", "db"],
		},
	],
	"db:check": [
		{
			script: "turbo run db:check",
			tags: ["db", "root"],
		},
		{
			script: "drizzle-kit check",
			tags: ["drizzle", "db"],
		},
	],
	"db:up": [
		{
			script: "turbo run db:up",
			tags: ["db", "root"],
		},
		{
			script: "drizzle-kit up",
			tags: ["drizzle", "db"],
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
		{
			script: "react-router typegen && tsc",
			tags: ["react-router", "frontend"],
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
