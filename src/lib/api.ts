// Typed wrappers around the Rust commands. Tauri v2 converts camelCase argument
// keys (connId/maxRows) to the Rust snake_case parameter names.

import { invoke } from "@tauri-apps/api/core";
import type { ConnConfig, ConnInfo, QueryResult } from "./types";

export const testConnection = (cfg: ConnConfig) =>
  invoke<number>("test_connection", { cfg });

export const connect = (cfg: ConnConfig) => invoke<ConnInfo>("connect", { cfg });

export const runQuery = (connId: string, sql: string, maxRows: number | null) =>
  invoke<QueryResult>("run_query", { connId, sql, maxRows });

export const cancelQuery = (connId: string) =>
  invoke<void>("cancel_query", { connId });

export const listSchema = (connId: string) =>
  invoke<QueryResult>("list_schema", { connId });

export const disconnect = (connId: string) =>
  invoke<void>("disconnect", { connId });
