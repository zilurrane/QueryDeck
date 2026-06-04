import { useMemo, useState } from "react";
import { useStore } from "../lib/store";

interface Col {
  name: string;
  dataType: string;
}
interface Table {
  schema: string;
  name: string;
  isView: boolean;
  columns: Col[];
}
interface Ctx {
  x: number;
  y: number;
  table: Table;
}

export function Sidebar() {
  const schema = useStore((s) => s.schema);
  const conn = useStore((s) => s.conn);
  const refreshSchema = useStore((s) => s.refreshSchema);
  const run = useStore((s) => s.run);
  const editTable = useStore((s) => s.editTable);
  const loadIntoEditor = useStore((s) => s.loadIntoEditor);
  const sidePanel = useStore((s) => s.sidePanel);
  const setSidePanel = useStore((s) => s.setSidePanel);
  const history = useStore((s) => s.history);
  const favorites = useStore((s) => s.favorites);
  const removeFavorite = useStore((s) => s.removeFavorite);
  const clearHistory = useStore((s) => s.clearHistory);

  const [filter, setFilter] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [ctx, setCtx] = useState<Ctx | null>(null);

  const tables = useMemo<Table[]>(() => {
    if (!schema) return [];
    const map = new Map<string, Table>();
    for (const row of schema.rows) {
      const [sch, tbl, ttype, colName, dataType] = row as string[];
      const key = `${sch}.${tbl}`;
      if (!map.has(key))
        map.set(key, { schema: sch, name: tbl, isView: ttype === "VIEW", columns: [] });
      map.get(key)!.columns.push({ name: colName, dataType });
    }
    return [...map.values()];
  }, [schema]);

  const shown = tables.filter((t) =>
    `${t.schema}.${t.name}`.toLowerCase().includes(filter.toLowerCase())
  );

  const peek = (t: Table) => {
    loadIntoEditor(`SELECT TOP 100 *\nFROM [${t.schema}].[${t.name}];`);
    run();
  };
  const scriptSelect = (t: Table) => {
    const cols = t.columns.map((c) => `    [${c.name}]`).join(",\n");
    loadIntoEditor(`SELECT\n${cols}\nFROM [${t.schema}].[${t.name}];`);
    setCtx(null);
  };

  const panelTabs = (
    <div className="side-panel-tabs">
      <button className={sidePanel === "schema" ? "on" : ""} onClick={() => setSidePanel("schema")}>Schema</button>
      <button className={sidePanel === "history" ? "on" : ""} onClick={() => setSidePanel("history")}>History</button>
      <button className={sidePanel === "favorites" ? "on" : ""} onClick={() => setSidePanel("favorites")}>★ Saved</button>
    </div>
  );

  if (!conn) {
    return (
      <aside>
        {panelTabs}
        {sidePanel === "schema" && (
          <div className="empty-side">Not connected.<br />Open a connection to browse tables.</div>
        )}
        {sidePanel === "history" && <HistoryList history={history} onLoad={loadIntoEditor} onClear={clearHistory} />}
        {sidePanel === "favorites" && <FavoritesList favorites={favorites} onLoad={loadIntoEditor} onRemove={removeFavorite} />}
      </aside>
    );
  }

  return (
    <aside onClick={() => ctx && setCtx(null)}>
      {panelTabs}

      {sidePanel === "schema" && (
        <>
          <div className="side-head">
            <span>{conn.database}</span>
            <span role="button" title="Refresh" onClick={() => refreshSchema()}>⟳</span>
          </div>
          <div className="search">
            🔎 <input placeholder="Filter objects…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          </div>
          <div className="tree">
            {shown.length === 0 && <div className="empty-side">No tables.</div>}
            {shown.map((t) => {
              const key = `${t.schema}.${t.name}`;
              const isOpen = open[key];
              return (
                <div key={key}>
                  <div
                    className="node"
                    onClick={() => setOpen((o) => ({ ...o, [key]: !o[key] }))}
                    onDoubleClick={() => peek(t)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setCtx({ x: e.clientX, y: e.clientY, table: t });
                    }}
                    title="Double-click: preview · Right-click: more"
                  >
                    <span className="tw">{isOpen ? "▾" : "▸"}</span>
                    <span>{t.isView ? "🔎" : "🗂️"}</span>
                    <span>{t.name}</span>
                    <span className="meta">{t.columns.length} cols</span>
                  </div>
                  {isOpen &&
                    t.columns.map((c) => (
                      <div className="node col" key={c.name}>
                        <span>{c.name}</span>
                        <span className="ty">{c.dataType}</span>
                      </div>
                    ))}
                </div>
              );
            })}
          </div>
        </>
      )}

      {sidePanel === "history" && <HistoryList history={history} onLoad={loadIntoEditor} onClear={clearHistory} />}
      {sidePanel === "favorites" && <FavoritesList favorites={favorites} onLoad={loadIntoEditor} onRemove={removeFavorite} />}

      {ctx && (
        <div className="ctx-menu" style={{ left: ctx.x, top: ctx.y }} onClick={(e) => e.stopPropagation()}>
          <div onClick={() => peek(ctx.table)}>Select Top 100</div>
          <div onClick={() => { editTable(ctx.table.schema, ctx.table.name); setCtx(null); }}>Edit Data (Top 200)</div>
          <div onClick={() => scriptSelect(ctx.table)}>Script as SELECT</div>
          <div onClick={() => { navigator.clipboard.writeText(`[${ctx.table.schema}].[${ctx.table.name}]`); setCtx(null); }}>Copy name</div>
        </div>
      )}
    </aside>
  );
}

function HistoryList({ history, onLoad, onClear }: { history: any[]; onLoad: (sql: string) => void; onClear: () => void }) {
  const [q, setQ] = useState("");
  const shown = history.filter((h) => h.sql.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <div className="side-head"><span>Query history</span>{history.length > 0 && <span role="button" title="Clear" onClick={onClear}>🗑</span>}</div>
      <div className="search">🔎 <input placeholder="Search history…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="tree">
        {shown.length === 0 && <div className="empty-side">No history yet.</div>}
        {shown.map((h) => (
          <div className="hist-item" key={h.id} onClick={() => onLoad(h.sql)} title={h.sql}>
            <div className="hist-sql">{h.ok ? "✓" : "✕"} {h.sql.replace(/\s+/g, " ").slice(0, 80)}</div>
            <div className="hist-meta">{h.conn || "—"} · {h.ok ? `${h.rows} rows · ${h.ms} ms` : "failed"}</div>
          </div>
        ))}
      </div>
    </>
  );
}

function FavoritesList({ favorites, onLoad, onRemove }: { favorites: any[]; onLoad: (sql: string) => void; onRemove: (id: string) => void }) {
  return (
    <>
      <div className="side-head"><span>Saved queries</span></div>
      <div className="tree">
        {favorites.length === 0 && <div className="empty-side">No saved queries.<br />Save one from the editor toolbar.</div>}
        {favorites.map((f) => (
          <div className="hist-item" key={f.id} title={f.sql}>
            <div className="hist-sql" onClick={() => onLoad(f.sql)}>★ {f.name}</div>
            <div className="hist-meta">
              <span onClick={() => onLoad(f.sql)}>{f.sql.replace(/\s+/g, " ").slice(0, 60)}</span>
              <span className="fav-del" onClick={() => onRemove(f.id)}>✕</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
