import { logger } from "@repo/logger";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class SqliteManager {
	private static connections: Map<string, Database.Database> = new Map();

	static getDb(dbPath: string): Database.Database {
		const resolvedPath = path.resolve(dbPath);

		if (!this.connections.has(resolvedPath)) {
			const dir = path.dirname(resolvedPath);
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true });
			}

			const db = new Database(resolvedPath);
			db.pragma("journal_mode = WAL");
			db.pragma("synchronous = NORMAL");
			logger.info(`Connected to SQLite database at ${resolvedPath}`);
			this.connections.set(resolvedPath, db);
		}
		return this.connections.get(resolvedPath)!;
	}

	static closeDb(dbPath: string): void {
		const resolvedPath = path.resolve(dbPath);
		const db = this.connections.get(resolvedPath);

		if (db) {
			db.close();
			this.connections.delete(resolvedPath);
			logger.warn(`SQLite connection for ${resolvedPath} closed.`);
		}
	}
}

interface TableInfoRow {
	cid: number;
	name: string;
	type: string;
	notnull: number;
	dflt_value: string | null;
	pk: number;
}

export class SqliteModule {
	public db: Database.Database;
	private dbPath: string;

	constructor(dbPath: string = path.resolve(__dirname, "db-files", "app.db")) {
		this.dbPath = path.resolve(dbPath);
		this.db = SqliteManager.getDb(this.dbPath);
	}

	private escapeId(identifier: string): string {
		return `"${identifier.replace(/"/g, '""')}"`;
	}

	createTable(tableName: string, schema: Record<string, string>): void {
		const safeTable = this.escapeId(tableName);
		const columns = Object.entries(schema)
			.map(([col, type]) => `${this.escapeId(col)} ${type}`)
			.join(", ");

		const sql = `CREATE TABLE IF NOT EXISTS ${safeTable} (${columns});`;
		this.db.prepare(sql).run();
		logger.info(`Table '${tableName}' is ready.`);
	}

	insert(tableName: string, row: Record<string, any>): void {
		const safeTable = this.escapeId(tableName);
		const cols = Object.keys(row)
			.map(c => this.escapeId(c))
			.join(", ");
		const placeholders = Object.keys(row)
			.map(() => "?")
			.join(", ");
		const values = Object.values(row);

		const sql = `INSERT INTO ${safeTable} (${cols}) VALUES (${placeholders});`;
		this.db.prepare(sql).run(...values);
	}

	readAll<T = unknown>(tableName: string): T[] {
		const safeTable = this.escapeId(tableName);
		return this.db.prepare(`SELECT * FROM ${safeTable};`).all() as T[];
	}

	readOne<T = unknown>(tableName: string, where: string, params: any[] = []): T | undefined {
		const safeTable = this.escapeId(tableName);
		return this.db.prepare(`SELECT * FROM ${safeTable} WHERE ${where} LIMIT 1;`).get(...params) as T | undefined;
	}

	update(tableName: string, updates: Record<string, any>, where: string, params: any[] = []): void {
		const safeTable = this.escapeId(tableName);
		const setClause = Object.keys(updates)
			.map(k => `${this.escapeId(k)} = ?`)
			.join(", ");
		const values = [...Object.values(updates), ...params];

		const sql = `UPDATE ${safeTable} SET ${setClause} WHERE ${where};`;
		this.db.prepare(sql).run(...values);
	}

	delete(tableName: string, where: string, params: any[] = []): void {
		const safeTable = this.escapeId(tableName);
		const sql = `DELETE FROM ${safeTable} WHERE ${where};`;
		this.db.prepare(sql).run(...params);
	}

	listTables(): string[] {
		const rows = this.db
			.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';`)
			.all() as Array<{ name: string }>;
		return rows.map(r => r.name);
	}

	getTableSchema(tableName: string): string | string[] {
		const exists = this.db
			.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name = ? LIMIT 1;`)
			.get(tableName);

		if (!exists) {
			logger.warn(`Table not found when fetching schema.`);
			return [];
		}

		const safeName = tableName.replace(/"/g, '""');
		const rows = this.db.prepare(`PRAGMA table_info("${safeName}");`).all() as TableInfoRow[];

		const header = ["cid", "name", "type", "notnull", "default_value", "primary_key"];
		const content = rows.map(r => `${r.cid} ${r.name} ${r.type} ${!!r.notnull} ${r.dflt_value} ${!!r.pk}`);

		return [header.join(" "), ...content].join("\n");
	}

	close(): void {
		SqliteManager.closeDb(this.dbPath);
	}
}
