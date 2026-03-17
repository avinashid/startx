/* eslint-disable @typescript-eslint/naming-convention */

import type { SCRIPT } from "../types";

export const scripts: SCRIPT = {
	"clean": [
		{
			script: "rimraf dist .turbo",
			tags: ["common"],
		},
	],
	"deep:clean": [
		{
			script: "rimraf node_modules dist .turbo",
			tags: ["common"],
		},
	],
	"typecheck": [
		{
			script: "tsc --noEmit",
			tags: ["common"],
		},
	],
	"format": [
		{
			script: "biome format --write .",
			tags: ["common", "biome"],
		},
		{
			"script": "prettier --write .",
			"tags": ["common", "prettier"],
		},
	],
	"format:check": [
		{
			script: "biome ci .",
			tags: ["common", "biome"],
		},
		{
			"script": "prettier --check .",
			"tags": ["common", "prettier"],
		},
	],
	"test": [
		{
			script: "vitest run",
			tags: ["common", "vitest"],
		},
	],
	"dev": [
		{
			script: "tsx watch src/index.ts",
			tags: ["app"],
		},
	],
	"dev:debug": [
		{
			script: "tsx watch --inspect src/index.ts",
			tags: ["app"],
		},
	],
	"bun:dev": [
		{
			script: "bun --watch src/index.ts",
			tags: ["app"],
		},
	],
	"start": [
		{
			script: "node dist/index.mjs",
			tags: ["app", "node"],
		},
	],
	"lint": [
		{
			script: "eslint .",
			tags: ["common", "eslint"],
		},
	],
	"lint:fix": [
		{
			script: "eslint . src/**/*.ts --fix",
			tags: ["common", "eslint"],
		},
	],
} as const;
