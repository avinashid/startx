import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const appDir = path.resolve(import.meta.dirname, "..");

async function workspaceRoot(from: string): Promise<string> {
	const found = await fs.access(path.join(from, "pnpm-workspace.yaml")).then(
		() => true,
		() => false,
	);
	if (found) return from;
	const parent = path.dirname(from);
	if (parent === from) throw new Error("no pnpm-workspace.yaml above core-server");
	return await workspaceRoot(parent);
}

let root: string;
beforeEach(async () => {
	root = await fs.mkdtemp(path.join(os.tmpdir(), "core-server-env-example-"));
});
afterEach(async () => {
	await fs.rm(root, { recursive: true, force: true });
});

// The deployment the production guards exist for: `cp .env.example .env && pnpm start`. Each case
// gets past the guard before it, so between them every refusal is reached.
const cases = [
	{ guard: "unauthenticated Redis", extra: {}, refusal: /REDIS_PASSWORD is not set and NODE_ENV is "production"/ },
	{ guard: "placeholder secrets", extra: { REDIS_PASSWORD: "set-by-the-deployment" }, refusal: /is a placeholder/ },
];

const bootIsRefused = async ({ extra, refusal }: (typeof cases)[number]) => {
	await fs.copyFile(path.join(await workspaceRoot(appDir), ".env.example"), path.join(root, ".env"));

	// A fresh environment, not process.env: vitest sets NODE_ENV=test, which allows all of this.
	const env = { PATH: process.env.PATH, HOME: os.homedir(), PROJECT_ROOT: root, ...extra };
	const boot = run(process.execPath, ["--import", "tsx", "src/index.ts"], { cwd: appDir, env, timeout: 30_000 });

	await expect(boot).rejects.toMatchObject({ killed: false, stderr: expect.stringMatching(refusal) as unknown });
};

describe(".env.example (B80)", () => {
	it.each(cases)("is refused at boot with NODE_ENV unset: $guard", bootIsRefused, 40_000);
});
