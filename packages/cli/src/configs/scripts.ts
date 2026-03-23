/* eslint-disable @typescript-eslint/naming-convention */

import type { SCRIPT } from "../types";

export const scripts: SCRIPT = {
	"dev": [
		{
			script: "turbo run dev",
			tags: ["app", "root"],
		},
		{
			script: "tsx watch src/index.ts",
			tags: ["app"],
		},
	],
	"dev:debug": [
		{
			script: "turbo run dev:debug",
			tags: ["backend", "node", "app", "root"],
		},
		{
			script: "tsx watch --inspect src/index.ts",
			tags: ["backend", "node", "app"],
		},
	],
	"bun:dev": [
		{
			script: "turbo run bun:dev",
			tags: ["backend", "node", "app", "root"],
		},
		{
			script: "bun --watch src/index.ts",
			tags: ["backend", "node", "app"],
		},
	],
	"build": [
		{
			script: "turbo run build",
			tags: ["app", "root"],
		},
		{
			script: "tsdown --config-loader unrun",
			tags: ["app"],
		},
	],
	"start": [
		{
			script: "turbo run start",
			tags: ["backend", "app", "node", "root"],
		},
		{
			script: "node dist/index.mjs",
			tags: ["backend", "node", "app"],
		},
	],
	"lint": [
		{
			script: "turbo run eslint",
			tags: ["common", "eslint", "root"],
		},
		{
			script: "eslint .",
			tags: ["common", "eslint"],
		},
	],
	"lint:fix": [
		{
			script: "turbo run lint:fix",
			tags: ["common", "eslint", "root"],
		},
		{
			script: "eslint . src/**/*.ts --fix",
			tags: ["common", "eslint"],
		},
	],
	"clean": [
		{
			script: "turbo run clean",
			tags: ["common", "root"],
		},
		{
			script: "rimraf dist .turbo",
			tags: ["common"],
		},
	],
	"deep:clean": [
		{
			script: "turbo run deep:clean",
			tags: ["common", "root"],
		},
		{
			script: "rimraf node_modules dist .turbo",
			tags: ["common"],
		},
	],
	"typecheck": [
		{
			script: "turbo run typecheck",
			tags: ["common", "root"],
		},
		{
			script: "tsc --noEmit",
			tags: ["common"],
		},
	],
	"format": [
		{
			script: "turbo run format",
			tags: ["common", "root"],
		},
		{
			script: "biome format --write .",
			tags: ["common", "biome", "prettier"],
		},
		{
			"script": "prettier --write .",
			"tags": ["common", "prettier"],
		},
	],
	"format:check": [
		{
			script: "turbo run format:check",
			tags: ["common", "root"],
		},
		{
			script: "biome ci .",
			tags: ["common", "biome", "prettier"],
		},
		{
			"script": "prettier --check .",
			"tags": ["common", "prettier"],
		},
	],
	"test": [
		{
			script: "turbo run test",
			tags: ["common", "vitest", "root"],
		},
		{
			script: "vitest run",
			tags: ["common", "vitest"],
		},
	],
} as const;
