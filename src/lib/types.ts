// Mirrors the Rust structs in src-tauri/src/db.rs (snake_case nested fields).

export interface ConnConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  encrypt: boolean;
  trust_cert: boolean;
}

export interface ConnInfo {
  id: string;
  database: string;
}

export interface Column {
  name: string;
  type: string;
}

export interface QueryResult {
  columns: Column[];
  rows: unknown[][];
  row_count: number;
  elapsed_ms: number;
}

export interface Tab {
  id: string;
  name: string;
  sql: string;
}

// Active edit context for inline-editable results (PK-aware UPDATE/DELETE/INSERT).
export interface EditCtx {
  schema: string;
  table: string;
  pk: string[];
  readonly: string[]; // lowercased column names that are IDENTITY/computed
}

export type Env = "prod" | "staging" | "dev";

// A persisted connection (password is NOT stored here — it lives in the OS
// keychain keyed by `id` when `savePassword` is true).
export interface SavedConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  database: string;
  encrypt: boolean;
  trust_cert: boolean;
  env: Env;
  savePassword: boolean;
}

export interface HistoryEntry {
  id: string;
  sql: string;
  conn: string;
  ts: number;
  ok: boolean;
  rows: number;
  ms: number;
}

export interface SavedQuery {
  id: string;
  name: string;
  sql: string;
  ts: number;
}

export type ThemeId =
  | "vscode-dark"
  | "github-light"
  | "solarized-light"
  | "quiet-light";

export interface ThemeDef {
  id: ThemeId;
  name: string;
  cls: string; // body class ("" = :root dark default)
  dark: boolean;
}

export const THEMES: ThemeDef[] = [
  { id: "vscode-dark", name: "VS Code Dark Pro", cls: "", dark: true },
  { id: "github-light", name: "GitHub Light", cls: "light", dark: false },
  { id: "solarized-light", name: "Solarized Light", cls: "solarized", dark: false },
  { id: "quiet-light", name: "Quiet Light", cls: "quiet", dark: false },
];

export interface Settings {
  themeId: ThemeId;
  rowLimitEnabled: boolean;
  rowLimit: number;
  fontSize: number;
}

export const DEFAULT_SETTINGS: Settings = {
  themeId: "vscode-dark",
  rowLimitEnabled: true,
  rowLimit: 1000,
  fontSize: 13,
};
