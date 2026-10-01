import { type AnyColumn, sql, type SQL } from "drizzle-orm";

export const increment = (column: AnyColumn, value = 1) => {
	return sql`${column} + ${value}`;
};

export const decrement = (column: AnyColumn, value = 1) => {
	return sql`${column} - ${value}`;
};

export function castToText(column: AnyColumn) {
	return sql`CAST(${column} AS TEXT)`;
}

export type Condition = boolean | SQL<unknown>;
