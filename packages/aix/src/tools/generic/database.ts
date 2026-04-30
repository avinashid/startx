import * as vm from "node:vm";
import pg from "pg";
import { z } from "zod";
import { ITool } from "../i-tool.js";

/**
 * Pool cache
 */
const poolCache: Map<string, pg.Pool> = new Map();

function getPool(url: string) {
	if (!poolCache.has(url)) {
		poolCache.set(url, new pg.Pool({ connectionString: url }));
	}
	return poolCache.get(url)!;
}

export const DatabaseTools: ITool[] = [
	/**
	 * GET TABLE LIST (replaces get_database_list)
	 */
	new ITool({
		title: "get_table_list",
		description: "Returns list of tables from the connected Postgres database including schema and table name.",
		schema: z.object({}),
		run: async (_: {}, internal) => {
			try {
				const url = internal?.system?.DATABASE_URL as string | undefined;
				if (!url) {
					return [
						{ type: "text", text: "Missing connection URL in internal." },
						{
							type: "resource_link",
							uri: "return",
							name: "Missing connection",
							_meta: { return: { isCompleted: false, isError: true } },
						},
					];
				}

				const pool = getPool(url);

				const result = (await pool.query(`
					SELECT
						table_schema,
						table_name
					FROM information_schema.tables
					WHERE table_type = 'BASE TABLE'
					AND table_schema NOT IN ('pg_catalog', 'information_schema')
					ORDER BY table_schema, table_name;
				`)) as { rows: Array<{ table_schema: string; table_name: string }> };

				const tables = result.rows.map(row => ({
					schema: row.table_schema,
					table_name: row.table_name,
				}));

				if (!tables.length) {
					return [
						{ type: "text", text: "No tables found." },
						{
							type: "resource_link",
							uri: "return",
							name: "No tables",
							_meta: { return: { isCompleted: true, isError: false } },
						},
					];
				}

				return [
					{
						type: "text",
						text: JSON.stringify(tables, null, 2),
					},
				];
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);

				return [
					{ type: "text", text: `Failed to fetch tables: ${message}` },
					{
						type: "resource_link",
						uri: "return",
						name: "Table fetch error",
						_meta: { return: { isCompleted: false, isError: true } },
					},
				];
			}
		},
	}),

	/**
	 * EXECUTE SQL
	 */
	new ITool({
		title: "execute_postgres_sql",
		description: `
    Execute SQL on the connected Postgres database using connectionUrl from internal.
    Supports evaluating JavaScript expressions inside {{...}} blocks to dynamically inject values.
    The variables are accessible via the 'vars' object and are safely parameterized to prevent SQL injection.

    EXAMPLE 1 (Basic Variable):
    SELECT * FROM users WHERE id = {{vars.USER_ID}};

    EXAMPLE 2 (Math/Logic Operation):
    SELECT * FROM orders WHERE amount > {{vars.MIN_AMOUNT * 1.5}} AND status = {{(vars.IS_ACTIVE ? 'ACTIVE' : 'INACTIVE')}};

    EXAMPLE 3 (Array/String Manipulation):
    SELECT * FROM products WHERE category = {{vars.CATEGORIES[0].toLowerCase()}};

		Mark isCompleted as true if this operation fully resolves the user's request.
    `.trim(),
		schema: z.object({
			sql: z
				.string()
				.describe(
					"The SQL query. Use {{expression}} to evaluate JS and safely inject values via parameterized queries."
				),
			isCompleted: z
				.boolean()
				.describe(
					"Set to true if this operation fully resolves the user's request (must return formatted Markdown). Set to false if you just need to extract data for your own further reasoning."
				),
		}),
		run: async (props, internal) => {
			try {
				const url = internal?.system?.DATABASE_URL as string | undefined;

				if (!url) {
					return [
						{ type: "text", text: "Missing connection URL." },
						{
							type: "resource_link",
							uri: "return",
							name: "Missing connection",
							_meta: { return: { isCompleted: true, isError: true } },
						},
					];
				}

				const rawSql = String(props.sql || "").trim();

				if (!rawSql) {
					return [
						{ type: "text", text: "Missing SQL query." },
						{
							type: "resource_link",
							uri: "return",
							name: "Missing SQL",
							_meta: { return: { isCompleted: true, isError: true } },
						},
					];
				}

				const contextObj: Record<string, unknown> = {};
				for (const [key, value] of internal?.vars?.entries() || []) {
					let parsedData = value.data;
					// Attempt to parse stringified JSON outputs back into objects
					if (typeof parsedData === "string") {
						try {
							parsedData = JSON.parse(parsedData);
						} catch (e) {
							// If it's not valid JSON, leave it as a string
						}
					}
					contextObj[key] = parsedData;
				}

				const context = vm.createContext({ vars: contextObj });

				const values: any[] = [];
				let paramIndex = 1;
				let resolvedSql = rawSql;

				try {
					resolvedSql = rawSql.replace(/\{\{(.+?)\}\}/g, (_match, expression: string) => {
						const script = new vm.Script(expression.trim());
						const evaluatedValue = script.runInContext(context);

						// Optional: Add safety check for undefined evaluations
						if (evaluatedValue === undefined) {
							throw new Error(`Expression '${expression}' evaluated to undefined.`);
						}

						values.push(evaluatedValue);
						return `$${paramIndex++}`;
					});
				} catch (evalError: any) {
					return [
						{ type: "text", text: `Expression evaluation failed: ${evalError.message}` },
						{
							type: "resource_link",
							uri: "return",
							name: "Evaluation error",
							_meta: { return: { isCompleted: false, isError: true } },
						},
					];
				}

				const firstWord = resolvedSql.match(/^\s*(\w+)/i)?.[1]?.toUpperCase() || "";
				const destructiveWords = ["INSERT", "UPDATE", "DELETE", "CREATE", "DROP", "ALTER", "TRUNCATE"];
				const isDestructive = destructiveWords.includes(firstWord);
				const isAdmin = Boolean(internal?.system?.IS_ADMIN ?? true);

				if (isDestructive && !isAdmin) {
					return [
						{
							type: "text",
							text: `Destructive query (${firstWord}) blocked. Not admin.`,
						},
						{
							type: "resource_link",
							uri: "return",
							name: "Permission denied",
							_meta: { return: { isCompleted: false, isError: true } },
						},
					];
				}

				const pool = getPool(url);
				const result = await pool.query({ text: resolvedSql, values });
				const rows = Array.isArray(result.rows) ? result.rows : [];

				const columns = (result.fields || []).map((f: any) => ({
					name: f.name,
					dataTypeID: f.dataTypeID,
				}));

				if (props.isCompleted) {
					return [
						{
							type: "text",
							text: JSON.stringify(
								{
									rowCount: result.rowCount,
									returnedRows: rows.length,
									rows,
									columns,
								},
								null,
								2
							),
						},
						{
							type: "resource_link",
							uri: "return",
							name: "Execution completed",
							_meta: {
								return: {
									isCompleted: true,
									isError: false,
								},
							},
						},
					];
				}

				return [
					{
						type: "text",
						text: JSON.stringify(
							{
								rowCount: result.rowCount,
								returnedRows: rows.length,
								rows,
								columns,
							},
							null,
							2
						),
					},
				];
			} catch (err: unknown) {
				const message = err instanceof Error ? err.message : String(err);

				return [
					{ type: "text", text: `SQL execution failed: ${message}` },
					{
						type: "resource_link",
						uri: "return",
						name: "SQL error",
						_meta: {
							return: { isCompleted: false, isError: true },
						},
					},
				];
			}
		},
	}),
];
