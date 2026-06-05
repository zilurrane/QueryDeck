// Per-engine SQL generation for inline-editable results. Each engine differs in
// identifier quoting, string literals, row-limit syntax, and how primary keys /
// auto-generated columns are introspected. The editable-results store actions
// build their UPDATE/DELETE/INSERT through a `Dialect` so they work across all
// supported engines.

import type { Engine } from "./types";

// Broad numeric type detection across engines (matches the leading token of the
// column type, e.g. "int", "int4", "numeric(10,2)", "double precision").
const NUMERIC_RE =
  /^(tinyint|smallint|mediumint|int|integer|bigint|int2|int4|int8|serial|smallserial|bigserial|float|float4|float8|real|double|decimal|numeric|dec|fixed|money|smallmoney)/;

export function isNumericType(type: string): boolean {
  return NUMERIC_RE.test(type.toLowerCase().trim());
}

function isBoolType(type: string): boolean {
  const t = type.toLowerCase().trim();
  return t === "bit" || t === "bool" || t === "boolean";
}

// Coerce an edited cell string back to a JS value for the local result grid.
export function coerceValue(raw: string, type: string): unknown {
  const t = type.toLowerCase().trim();
  if (raw === "") return t.includes("char") || t.includes("text") ? "" : null;
  if (isBoolType(t)) return raw === "1" || raw.toLowerCase() === "true";
  if (isNumericType(t)) {
    const lower = raw.toLowerCase();
    if (lower === "true") return 1;
    if (lower === "false") return 0;
    const n = Number(raw.replace(/[$,]/g, ""));
    return isNaN(n) ? raw : n;
  }
  return raw;
}

export interface Dialect {
  engine: Engine;
  ident(name: string): string;
  qualified(schema: string, table: string): string;
  str(s: string): string;
  literal(value: unknown, type: string): string;
  browse(schema: string, table: string, n: number): string;
  pkQuery(schema: string, table: string): string;
  readonlyQuery(schema: string, table: string): string;
}

export function dialectFor(engine: Engine): Dialect {
  // Identifier quoting: [x] for T-SQL, `x` for MySQL, "x" for PostgreSQL/SQLite.
  const ident =
    engine === "mssql"
      ? (n: string) => `[${n.replace(/]/g, "]]")}]`
      : engine === "mysql"
        ? (n: string) => `\`${n.replace(/`/g, "``")}\``
        : (n: string) => `"${n.replace(/"/g, '""')}"`;

  // MSSQL prefixes string literals with N (unicode); others use a plain literal.
  const strPrefix = engine === "mssql" ? "N" : "";
  const str = (s: string) => `${strPrefix}'${s.replace(/'/g, "''")}'`;

  // SQLite has no schema namespace (everything is "main"); the rest qualify.
  const qualified = (schema: string, table: string) =>
    engine === "sqlite" ? ident(table) : `${ident(schema)}.${ident(table)}`;

  const literal = (value: unknown, type: string): string => {
    if (value === null || value === undefined) return "NULL";
    const t = type.toLowerCase().trim();
    const s = String(value);
    const truthy = s === "1" || s.toLowerCase() === "true";
    if (engine === "mssql" && t === "bit") return truthy ? "1" : "0";
    if (engine === "postgres" && (t === "bool" || t === "boolean")) return truthy ? "TRUE" : "FALSE";
    if (isNumericType(t)) {
      if (s.trim() === "") return "NULL";
      const lower = s.toLowerCase();
      if (lower === "true") return "1";
      if (lower === "false") return "0";
      const n = Number(s.replace(/[$,]/g, ""));
      return isNaN(n) ? "NULL" : String(n);
    }
    if (s.trim() === "") return t.includes("char") || t.includes("text") ? str("") : "NULL";
    return str(s);
  };

  const browse = (schema: string, table: string, n: number) =>
    engine === "mssql"
      ? `SELECT TOP ${n} * FROM ${qualified(schema, table)}`
      : `SELECT * FROM ${qualified(schema, table)} LIMIT ${n}`;

  // PK columns. INFORMATION_SCHEMA works for SQL Server / PostgreSQL / MySQL
  // (unquoted identifiers fold consistently); SQLite uses a pragma.
  const pkQuery = (schema: string, table: string) =>
    engine === "sqlite"
      ? `SELECT name FROM pragma_table_info(${str(table)}) WHERE pk > 0 ORDER BY pk`
      : `SELECT kcu.COLUMN_NAME ` +
        `FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc ` +
        `JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu ` +
        `  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA ` +
        `WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' ` +
        `  AND tc.TABLE_SCHEMA = ${str(schema)} AND tc.TABLE_NAME = ${str(table)} ` +
        `ORDER BY kcu.ORDINAL_POSITION`;

  // Auto-generated / identity / computed columns to protect from edits+inserts.
  const readonlyQuery = (schema: string, table: string): string => {
    switch (engine) {
      case "mssql":
        return (
          `SELECT c.name FROM sys.columns c ` +
          `WHERE c.object_id = OBJECT_ID(${str(`${ident(schema)}.${ident(table)}`)}) ` +
          `  AND (c.is_identity = 1 OR c.is_computed = 1)`
        );
      case "postgres":
        return (
          `SELECT column_name FROM information_schema.columns ` +
          `WHERE table_schema = ${str(schema)} AND table_name = ${str(table)} ` +
          `  AND (is_identity = 'YES' OR is_generated = 'ALWAYS' OR column_default LIKE 'nextval%')`
        );
      case "mysql":
        return (
          `SELECT column_name FROM information_schema.columns ` +
          `WHERE table_schema = ${str(schema)} AND table_name = ${str(table)} ` +
          `  AND (extra LIKE '%auto_increment%' OR extra LIKE '%GENERATED%')`
        );
      case "sqlite":
        // hidden 2/3 = generated columns (pragma_table_xinfo).
        return `SELECT name FROM pragma_table_xinfo(${str(table)}) WHERE hidden IN (2, 3)`;
    }
  };

  return { engine, ident, qualified, str, literal, browse, pkQuery, readonlyQuery };
}
