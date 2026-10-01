import fs from "node:fs";
import path from "node:path";

export const MEMORY_DB = ":memory:";

/** The nearest directory at or above `from` that holds pnpm-workspace.yaml, else `from` itself. */
export function workspaceRoot(from = process.cwd()): string {
	const start = path.resolve(from);
	let dir = start;
	for (;;) {
		if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
		const parent = path.dirname(dir);
		if (parent === dir) return start;
		dir = parent;
	}
}

/**
 * Resolve SQLITE_DB_PATH. A relative path is anchored at the workspace root rather than the working
 * directory: `db:push` runs inside this package and the app inside its own, and both have to open
 * the same file. Outside a workspace (a container's /app) it falls back to the working directory.
 */
export function resolveDbPath(dbPath: string, from?: string): string {
	if (dbPath === MEMORY_DB || path.isAbsolute(dbPath)) return dbPath;
	return path.join(workspaceRoot(from), dbPath);
}

/** Resolve the path and create its parent directory — SQLite creates the file, never the folder. */
export function prepareDbPath(dbPath: string, from?: string): string {
	const resolved = resolveDbPath(dbPath, from);
	if (resolved !== MEMORY_DB) fs.mkdirSync(path.dirname(resolved), { recursive: true });
	return resolved;
}
