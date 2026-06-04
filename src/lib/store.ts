import { create } from "zustand";
import { format as formatSql } from "sql-formatter";
import * as api from "./api";
import * as persist from "./persist";
import {
  DEFAULT_SETTINGS,
  THEMES,
  type ConnConfig,
  type ConnInfo,
  type EditCtx,
  type Env,
  type HistoryEntry,
  type QueryResult,
  type SavedConnection,
  type SavedQuery,
  type Settings,
  type Tab,
  type ThemeId,
} from "./types";

let seq = 1;
const uid = () => `${Date.now().toString(36)}-${(seq++).toString(36)}`;

let tabSeq = 1;
const newTabObj = (sql = ""): Tab => ({
  id: `tab-${tabSeq}`,
  name: `Query ${tabSeq++}`,
  sql,
});

const firstTab = newTabObj("");

interface AppState {
  // settings & theme
  settings: Settings;
  setSettings: (patch: Partial<Settings>) => void;
  setTheme: (id: ThemeId) => void;

  // ui panels
  modalOpen: boolean;
  setModalOpen: (b: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (b: boolean) => void;
  paletteOpen: boolean;
  setPaletteOpen: (b: boolean) => void;
  objectSearchOpen: boolean;
  setObjectSearchOpen: (b: boolean) => void;
  sidePanel: "schema" | "history" | "favorites";
  setSidePanel: (p: AppState["sidePanel"]) => void;

  // connections
  savedConnections: SavedConnection[];
  conn: ConnInfo | null;
  connName: string;
  connEnv: Env;
  schema: QueryResult | null;

  // editor / tabs
  tabs: Tab[];
  activeTabId: string;

  // results
  result: QueryResult | null;
  error: string | null;
  running: boolean;

  // editable-results context (P2-3)
  edit: EditCtx | null;
  editTable: (schema: string, table: string) => Promise<void>;
  exitEdit: () => void;
  commitCell: (rowIdx: number, colIdx: number, raw: string) => Promise<void>;
  deleteRow: (rowIdx: number) => Promise<void>;
  addRow: (values: Record<string, string>) => Promise<void>;

  // history & favorites
  history: HistoryEntry[];
  favorites: SavedQuery[];

  // lifecycle
  init: () => Promise<void>;

  // actions
  doConnect: (
    cfg: ConnConfig,
    meta: { name: string; env: Env; save: boolean; savePassword: boolean }
  ) => Promise<void>;
  connectSaved: (sc: SavedConnection) => Promise<void>;
  removeSavedConnection: (id: string) => Promise<void>;
  doDisconnect: () => Promise<void>;
  refreshSchema: () => Promise<void>;

  setSql: (id: string, sql: string) => void;
  addTab: (sql?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  activeTab: () => Tab | undefined;
  formatActive: () => void;

  run: () => Promise<void>;
  cancel: () => Promise<void>;

  loadIntoEditor: (sql: string) => void;
  addFavorite: (name: string, sql: string) => void;
  removeFavorite: (id: string) => void;
  clearHistory: () => void;
}

function themeById(id: ThemeId) {
  return THEMES.find((t) => t.id === id) ?? THEMES[0];
}
function applyThemeClass(id: ThemeId) {
  document.body.className = themeById(id).cls;
}

export const useStore = create<AppState>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  setSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    persist.saveKey("settings", settings);
    applyThemeClass(settings.themeId);
  },
  setTheme: (id) => get().setSettings({ themeId: id }),

  modalOpen: false,
  setModalOpen: (b) => set({ modalOpen: b }),
  settingsOpen: false,
  setSettingsOpen: (b) => set({ settingsOpen: b }),
  paletteOpen: false,
  setPaletteOpen: (b) => set({ paletteOpen: b }),
  objectSearchOpen: false,
  setObjectSearchOpen: (b) => set({ objectSearchOpen: b }),
  sidePanel: "schema",
  setSidePanel: (p) => set({ sidePanel: p }),

  savedConnections: [],
  conn: null,
  connName: "",
  connEnv: "dev",
  schema: null,

  tabs: [firstTab],
  activeTabId: firstTab.id,

  result: null,
  error: null,
  running: false,
  edit: null,

  history: [],
  favorites: [],

  init: async () => {
    const [settings, savedConnections, history, favorites] = await Promise.all([
      persist.loadKey<Settings>("settings", DEFAULT_SETTINGS),
      persist.loadKey<SavedConnection[]>("connections", []),
      persist.loadKey<HistoryEntry[]>("history", []),
      persist.loadKey<SavedQuery[]>("favorites", []),
    ]);
    set({ settings, savedConnections, history, favorites });
    applyThemeClass(settings.themeId);
  },

  doConnect: async (cfg, meta) => {
    const info = await api.connect(cfg);
    set({ conn: info, connName: meta.name, connEnv: meta.env, modalOpen: false, error: null });

    if (meta.save) {
      const sc: SavedConnection = {
        id: uid(),
        name: meta.name,
        host: cfg.host,
        port: cfg.port,
        username: cfg.username,
        database: cfg.database,
        encrypt: cfg.encrypt,
        trust_cert: cfg.trust_cert,
        env: meta.env,
        savePassword: meta.savePassword,
      };
      const savedConnections = [
        sc,
        ...get().savedConnections.filter(
          (c) => !(c.host === sc.host && c.database === sc.database && c.username === sc.username)
        ),
      ];
      set({ savedConnections });
      persist.saveKey("connections", savedConnections);
      if (meta.savePassword) persist.secretSet(sc.id, cfg.password).catch(() => {});
    }
    await get().refreshSchema();
  },

  connectSaved: async (sc) => {
    let password = "";
    if (sc.savePassword) {
      password = (await persist.secretGet(sc.id).catch(() => null)) ?? "";
    }
    const cfg: ConnConfig = {
      host: sc.host,
      port: sc.port,
      username: sc.username,
      password,
      database: sc.database,
      encrypt: sc.encrypt,
      trust_cert: sc.trust_cert,
    };
    const info = await api.connect(cfg);
    set({ conn: info, connName: sc.name, connEnv: sc.env, modalOpen: false, error: null });
    await get().refreshSchema();
  },

  removeSavedConnection: async (id) => {
    const savedConnections = get().savedConnections.filter((c) => c.id !== id);
    set({ savedConnections });
    persist.saveKey("connections", savedConnections);
    persist.secretDelete(id).catch(() => {});
  },

  doDisconnect: async () => {
    const { conn } = get();
    if (conn) await api.disconnect(conn.id).catch(() => {});
    set({ conn: null, schema: null, result: null, error: null, connName: "" });
  },

  refreshSchema: async () => {
    const { conn } = get();
    if (!conn) return;
    try {
      const schema = await api.listSchema(conn.id);
      set({ schema });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  setSql: (id, sql) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, sql } : t)) })),

  addTab: (sql = "") => {
    const t = newTabObj(sql);
    set((s) => ({ tabs: [...s.tabs, t], activeTabId: t.id }));
  },

  closeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      if (tabs.length === 0) {
        const t = newTabObj("");
        return { tabs: [t], activeTabId: t.id };
      }
      const activeTabId = s.activeTabId === id ? tabs[tabs.length - 1].id : s.activeTabId;
      return { tabs, activeTabId };
    }),

  setActiveTab: (id) => set({ activeTabId: id }),
  activeTab: () => get().tabs.find((t) => t.id === get().activeTabId),

  formatActive: () => {
    const tab = get().activeTab();
    if (!tab || !tab.sql.trim()) return;
    try {
      const formatted = formatSql(tab.sql, { language: "tsql", keywordCase: "upper" });
      get().setSql(tab.id, formatted);
    } catch {
      /* leave as-is if it can't parse */
    }
  },

  run: async () => {
    const { conn, activeTab, settings, connName } = get();
    const tab = activeTab();
    if (!conn || !tab || !tab.sql.trim() || get().running) return;
    set({ running: true, error: null, edit: null });
    const sql = tab.sql;
    const maxRows = settings.rowLimitEnabled ? settings.rowLimit : null;
    try {
      const result = await api.runQuery(conn.id, sql, maxRows);
      set({ result, running: false });
      pushHistory(set, get, { sql, conn: connName, ok: true, rows: result.row_count, ms: result.elapsed_ms });
    } catch (e) {
      set({ error: String(e), result: null, running: false });
      pushHistory(set, get, { sql, conn: connName, ok: false, rows: 0, ms: 0 });
    }
  },

  cancel: async () => {
    const { conn, running } = get();
    if (!conn || !running) return;
    await api.cancelQuery(conn.id).catch(() => {});
  },

  editTable: async (schema, table) => {
    const { conn } = get();
    if (!conn) return;
    set({ running: true, error: null });
    try {
      const pkRes = await api.runQuery(conn.id, pkSql(schema, table), null);
      const pk = pkRes.rows.map((r) => String(r[0]));
      let readonly: string[] = [];
      try {
        const roRes = await api.runQuery(conn.id, readonlySql(schema, table), null);
        readonly = roRes.rows.map((r) => String(r[0]).toLowerCase());
      } catch {
        /* sys.columns unavailable — fall back to no read-only detection */
      }
      const data = await api.runQuery(
        conn.id,
        `SELECT TOP 200 * FROM ${ident(schema)}.${ident(table)}`,
        null
      );
      set({ result: data, edit: { schema, table, pk, readonly }, running: false, error: null });
    } catch (e) {
      set({ error: String(e), running: false, edit: null, result: null });
    }
  },

  exitEdit: () => set({ edit: null }),

  commitCell: async (rowIdx, colIdx, raw) => {
    const { conn, result, edit } = get();
    if (!conn || !result || !edit || edit.pk.length === 0) return;
    const col = result.columns[colIdx];
    if (edit.readonly.includes(col.name.toLowerCase())) {
      set({ error: `Column "${col.name}" is read-only (identity/computed)` });
      return;
    }
    const where = whereClause(result, edit.pk, rowIdx);
    if (!where) {
      set({ error: "Cannot edit row: primary key value unavailable" });
      return;
    }
    const sql = `UPDATE ${ident(edit.schema)}.${ident(edit.table)} SET ${ident(col.name)} = ${sqlLiteral(raw, col.type)} WHERE ${where}`;
    try {
      await api.runQuery(conn.id, sql, null);
      const rows = result.rows.map((r, i) =>
        i === rowIdx ? r.map((v, j) => (j === colIdx ? coerce(raw, col.type) : v)) : r
      );
      set({ result: { ...result, rows }, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  deleteRow: async (rowIdx) => {
    const { conn, result, edit } = get();
    if (!conn || !result || !edit) return;
    const where = whereClause(result, edit.pk, rowIdx);
    if (!where) {
      set({ error: "Cannot delete row: primary key value unavailable" });
      return;
    }
    const sql = `DELETE FROM ${ident(edit.schema)}.${ident(edit.table)} WHERE ${where}`;
    try {
      await api.runQuery(conn.id, sql, null);
      const rows = result.rows.filter((_, i) => i !== rowIdx);
      set({ result: { ...result, rows, row_count: rows.length }, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  addRow: async (values) => {
    const { conn, result, edit } = get();
    if (!conn || !result || !edit) return;
    const ro = new Set(edit.readonly);
    const cols = result.columns.filter(
      (c) => !ro.has(c.name.toLowerCase()) && (values[c.name] ?? "") !== ""
    );
    if (cols.length === 0) return;
    const colList = cols.map((c) => ident(c.name)).join(", ");
    const valList = cols.map((c) => sqlLiteral(values[c.name], c.type)).join(", ");
    const sql = `INSERT INTO ${ident(edit.schema)}.${ident(edit.table)} (${colList}) VALUES (${valList})`;
    try {
      await api.runQuery(conn.id, sql, null);
      const data = await api.runQuery(
        conn.id,
        `SELECT TOP 200 * FROM ${ident(edit.schema)}.${ident(edit.table)}`,
        null
      );
      set({ result: data, error: null });
    } catch (e) {
      set({ error: String(e) });
    }
  },

  loadIntoEditor: (sql) => {
    const tab = get().activeTab();
    if (tab) get().setSql(tab.id, sql);
    else get().addTab(sql);
  },

  addFavorite: (name, sql) => {
    const norm = sql.trim();
    // Idempotent: don't create duplicates for the same query — replace/promote.
    const existing = get().favorites.filter((f) => f.sql.trim() !== norm);
    const fav: SavedQuery = { id: uid(), name, sql, ts: Date.now() };
    const favorites = [fav, ...existing];
    set({ favorites });
    persist.saveKey("favorites", favorites);
  },

  removeFavorite: (id) => {
    const favorites = get().favorites.filter((f) => f.id !== id);
    set({ favorites });
    persist.saveKey("favorites", favorites);
  },

  clearHistory: () => {
    set({ history: [] });
    persist.saveKey("history", []);
  },
}));

function pushHistory(
  set: (p: Partial<AppState>) => void,
  get: () => AppState,
  e: Omit<HistoryEntry, "id" | "ts">
) {
  const entry: HistoryEntry = { ...e, id: uid(), ts: Date.now() };
  const history = [entry, ...get().history].slice(0, 200);
  set({ history });
  persist.saveKey("history", history);
}

// ---- SQL helpers for editable results (P2-3) ----

const NUMERIC = new Set([
  "int", "bigint", "smallint", "tinyint", "float", "real",
  "decimal", "numeric", "money", "smallmoney",
]);

const ident = (name: string) => `[${name.replace(/]/g, "]]")}]`;
const sqlStr = (s: string) => `N'${s.replace(/'/g, "''")}'`;

function pkSql(schema: string, table: string): string {
  return `SELECT kcu.COLUMN_NAME \
FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc \
JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu \
  ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA \
WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' \
  AND tc.TABLE_SCHEMA = ${sqlStr(schema)} AND tc.TABLE_NAME = ${sqlStr(table)} \
ORDER BY kcu.ORDINAL_POSITION`;
}

function readonlySql(schema: string, table: string): string {
  return `SELECT c.name FROM sys.columns c \
WHERE c.object_id = OBJECT_ID(${sqlStr(`${ident(schema)}.${ident(table)}`)}) \
  AND (c.is_identity = 1 OR c.is_computed = 1)`;
}

function sqlLiteral(v: unknown, type: string): string {
  if (v === null || v === undefined) return "NULL";
  const t = type.toLowerCase();
  const s = String(v);
  if (t === "bit") return s === "1" || s.toLowerCase() === "true" ? "1" : "0";
  if (NUMERIC.has(t)) {
    if (s.trim() === "") return "NULL";
    const n = Number(s.replace(/[$,]/g, ""));
    return isNaN(n) ? "NULL" : String(n);
  }
  if (s.trim() === "") {
    return t.includes("char") || t.includes("text") ? "N''" : "NULL";
  }
  return sqlStr(s);
}

function coerce(raw: string, type: string): unknown {
  const t = type.toLowerCase();
  if (raw === "") return t.includes("char") || t.includes("text") ? "" : null;
  if (t === "bit") return raw === "1" || raw.toLowerCase() === "true";
  if (NUMERIC.has(t)) {
    const n = Number(raw.replace(/[$,]/g, ""));
    return isNaN(n) ? raw : n;
  }
  return raw;
}

function whereClause(result: QueryResult, pk: string[], rowIdx: number): string | null {
  const parts: string[] = [];
  for (const pkName of pk) {
    const ci = result.columns.findIndex(
      (c) => c.name.toLowerCase() === pkName.toLowerCase()
    );
    if (ci < 0) return null;
    const col = result.columns[ci];
    parts.push(`${ident(col.name)} = ${sqlLiteral(result.rows[rowIdx][ci], col.type)}`);
  }
  return parts.length ? parts.join(" AND ") : null;
}
