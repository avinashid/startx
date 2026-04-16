import fs from "node:fs";
import * as XLSX from "xlsx";
import { SqliteModule } from "./sqlite-client.js";

export type InferredKind = "INTEGER" | "REAL" | "BOOLEAN" | "DATE" | "DATETIME" | "TEXT";

export interface ColumnDef {
	name: string;
	original: string;
	kind: InferredKind;
}

const snake = (s: string) =>
	s
		.trim()
		.replace(/\s+/g, "_")
		.replace(/[^A-Za-z0-9_]/g, "_")
		.replace(/__+/g, "_")
		.replace(/^_+|_+$/g, "")
		.toLowerCase();

function uniqueNames(headers: string[]): string[] {
	const used = new Map<string, number>();
	return headers.map(h => {
		let base = snake(h || "col");
		if (!base) base = "col";
		let name = base;
		let i = 1;
		while (used.has(name)) {
			name = `${base}_${++i}`;
		}
		used.set(name, 1);
		return name;
	});
}

function isBooleanish(v: unknown): boolean {
	if (typeof v === "boolean") return true;
	if (typeof v === "number") return v === 0 || v === 1;
	if (typeof v === "string") {
		const s = v.trim().toLowerCase();
		return ["true", "false", "yes", "no", "y", "n", "0", "1"].includes(s);
	}
	return false;
}

function toBoolean(v: unknown): boolean | null {
	if (v == null || v === "") return null;
	if (typeof v === "boolean") return v;
	if (typeof v === "number") return v !== 0;
	if (typeof v === "string") {
		const s = v.trim().toLowerCase();
		return ["true", "yes", "y", "1"].includes(s) ? true : ["false", "no", "n", "0"].includes(s) ? false : null;
	}
	return null;
}

function isExcelDate(d: unknown): d is Date {
	return d instanceof Date && !isNaN(d.getTime());
}

function looksLikeDateString(s: string): boolean {
	return (
		/^(\d{4}-\d{2}-\d{2})(?:[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?)?$/.test(s) ||
		/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?$/.test(s)
	);
}

function parseDateFlexible(v: unknown): Date | null {
	if (v == null || v === "") return null;
	if (isExcelDate(v)) return v;
	if (typeof v === "number") {
		if (v > 1e12) return new Date(v);
		if (v > 1e9) return new Date(v * 1000);
		const excelEpoch = new Date(Date.UTC(1899, 11, 30));
		const ms = excelEpoch.getTime() + v * 24 * 60 * 60 * 1000;
		const d = new Date(ms);
		return isNaN(d.getTime()) ? null : d;
	}
	if (typeof v === "string" && looksLikeDateString(v.trim())) {
		const d = new Date(v);
		return isNaN(d.getTime()) ? null : d;
	}
	return null;
}

function inferKind(values: unknown[]): InferredKind {
	const nonNull = values.filter(v => v !== undefined && v !== null && v !== "");
	if (nonNull.length === 0) return "TEXT";

	const allDates = nonNull.every(v => isExcelDate(v) || parseDateFlexible(v) !== null);
	if (allDates) {
		const anyHasTime = nonNull.some(v => {
			const d = isExcelDate(v) ? v : parseDateFlexible(v);
			if (!d) return false;
			return d.getUTCHours() !== 0 || d.getUTCMinutes() !== 0 || d.getUTCSeconds() !== 0;
		});
		return anyHasTime ? "DATETIME" : "DATE";
	}

	const allBool = nonNull.every(isBooleanish);
	if (allBool) return "BOOLEAN";

	const allNumbers = nonNull.every(v => typeof v === "number" || (!isNaN(Number(v)) && String(v).trim() !== ""));
	if (allNumbers) {
		const anyFloat = nonNull.some(v => String(v).includes("."));
		return anyFloat ? "REAL" : "INTEGER";
	}

	return "TEXT";
}

function coerceValue(kind: InferredKind, v: unknown, dateAs: "TEXT" | "INTEGER" | "REAL"): unknown {
	if (v === undefined || v === null || v === "") return null;
	switch (kind) {
		case "BOOLEAN": {
			const b = toBoolean(v);
			return b === null ? null : b ? 1 : 0;
		}
		case "INTEGER": {
			const n = Number(v);
			return isFinite(n) ? Math.trunc(n) : null;
		}
		case "REAL": {
			const n = Number(v);
			return isFinite(n) ? n : null;
		}
		case "DATE":
		case "DATETIME": {
			const d = isExcelDate(v) ? v : parseDateFlexible(v);
			if (!d) return null;
			if (dateAs === "TEXT") return kind === "DATE" ? d.toISOString().slice(0, 10) : d.toISOString();
			if (dateAs === "INTEGER") return Math.floor(d.getTime() / 1000);
			return d.getTime();
		}
		default:
			return JSON.stringify(v);
	}
}

export class ExcelToSqlite {
	static importSheetFromFile(
		filePath: string,
		dbPath: string,
		tableName: string,
		sheetName?: string,
		drop = false,
		headerRow = 1,
		dateAs: "TEXT" | "INTEGER" | "REAL" = "TEXT"
	) {
		const workbook = XLSX.read(fs.readFileSync(filePath), {
			type: "buffer",
			cellDates: true,
			raw: false,
		});
		return this.importSheetFromWorkbook(workbook, dbPath, tableName, sheetName, drop, headerRow, dateAs);
	}

	static importSheetFromBuffer(
		buffer: Buffer,
		dbPath: string,
		tableName: string,
		sheetName?: string,
		drop = false,
		headerRow = 1,
		dateAs: "TEXT" | "INTEGER" | "REAL" = "TEXT"
	) {
		const workbook = XLSX.read(buffer, {
			type: "buffer",
			cellDates: true,
			raw: false,
		});
		return this.importSheetFromWorkbook(workbook, dbPath, tableName, sheetName, drop, headerRow, dateAs);
	}

	private static importSheetFromWorkbook(
		workbook: XLSX.WorkBook,
		dbPath: string,
		tableName: string,
		sheetName?: string,
		drop = false,
		headerRow = 1,
		dateAs: "TEXT" | "INTEGER" | "REAL" = "TEXT"
	) {
		const sheet = sheetName || workbook.SheetNames[0];
		const worksheet = workbook.Sheets[sheet];
		if (!worksheet) throw new Error(`Sheet not found: ${sheet}`);

		const rows: any[] = XLSX.utils.sheet_to_json(worksheet, {
			header: 1,
			defval: "",
			blankrows: false,
			raw: false,
		});
		if (rows.length < headerRow) throw new Error(`Sheet has no header at row ${headerRow}`);

		const header = (rows[headerRow - 1] as unknown[]).map(v => JSON.stringify(v ?? "").trim());
		const dataRows = rows
			.slice(headerRow)
			.filter(r => Array.isArray(r) && r.some(c => c !== "" && c !== null && c !== undefined));

		const sanitizedNames = uniqueNames(header);
		const columns: ColumnDef[] = sanitizedNames.map((name, idx) => {
			const colValues = dataRows.map(r => r[idx]);
			return {
				name,
				original: header[idx] || name,
				kind: inferKind(colValues),
			};
		});

		const tblName = snake(tableName || sheet);
		const columnDecls = columns.map(c => `"${c.name}" ${c.kind}`);
		const ddl = `CREATE TABLE IF NOT EXISTS "${tblName}" ( ${columnDecls.join(", ")} );`;

		const db = new SqliteModule(dbPath);

		const tx = db.db.transaction(() => {
			if (drop) db.db.prepare(`DROP TABLE IF EXISTS "${tblName}";`).run();
			db.db.prepare(ddl).run();
			if (dataRows.length === 0) return;

			const placeholders = columns.map(() => "?").join(",");
			const insertSql = `INSERT INTO "${tblName}" (${columns.map(c => `"${c.name}"`).join(", ")}) VALUES (${placeholders});`;
			const stmt = db.db.prepare(insertSql);
			for (const row of dataRows) {
				const values = columns.map((c, idx) => coerceValue(c.kind, row[idx], dateAs));
				stmt.run(values);
			}
		});

		tx();
		return { tableName: tblName, columns };
	}
}
