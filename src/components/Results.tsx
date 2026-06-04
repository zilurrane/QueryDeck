import { useMemo, useState } from "react";
import { useStore } from "../lib/store";
import type { Column, QueryResult } from "../lib/types";

const NUM_TYPES = new Set(["int", "bigint", "smallint", "tinyint", "float", "real", "decimal", "numeric"]);
const DATE_TYPES = new Set(["datetime", "datetime2", "date", "time", "datetimeoffset", "smalldatetime"]);
const MONEY_TYPES = new Set(["money", "smallmoney"]);

function Cell({ value, col }: { value: unknown; col: Column }) {
  if (value === null || value === undefined) return <span className="null">NULL</span>;
  const t = col.type.toLowerCase();
  if (t === "bit") {
    const b = value === true || value === 1;
    return <span className={`v-bool ${b ? "" : "f"}`}>{b ? "● true" : "○ false"}</span>;
  }
  if (t === "uniqueidentifier") return <span className="v-guid">{String(value)}</span>;
  if (MONEY_TYPES.has(t)) {
    const n = Number(value);
    return (
      <span className="money">
        {isNaN(n) ? String(value) : n.toLocaleString(undefined, { style: "currency", currency: "USD" })}
      </span>
    );
  }
  if (DATE_TYPES.has(t)) return <span className="v-date">{String(value)}</span>;
  if (NUM_TYPES.has(t)) return <span className="v-num">{String(value)}</span>;
  return <span className="v-str">{String(value)}</span>;
}

const cellStr = (v: unknown) => (v === null || v === undefined ? "" : String(v));

function toCsv(columns: Column[], rows: unknown[][]): string {
  const esc = (v: unknown) => {
    const s = cellStr(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [columns.map((c) => esc(c.name)).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}
function toJson(columns: Column[], rows: unknown[][]): string {
  return JSON.stringify(rows.map((r) => Object.fromEntries(columns.map((c, i) => [c.name, r[i]]))), null, 2);
}
function toXls(columns: Column[], rows: unknown[][]): string {
  const esc = (v: unknown) => cellStr(v).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const head = `<tr>${columns.map((c) => `<th>${esc(c.name)}</th>`).join("")}</tr>`;
  const body = rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("");
  return `<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><table>${head}${body}</table></body></html>`;
}
function download(content: string, mime: string, name: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function Results() {
  const result = useStore((s) => s.result);
  const error = useStore((s) => s.error);
  const running = useStore((s) => s.running);
  const edit = useStore((s) => s.edit);
  const exitEdit = useStore((s) => s.exitEdit);
  const commitCell = useStore((s) => s.commitCell);
  const deleteRow = useStore((s) => s.deleteRow);
  const addRow = useStore((s) => s.addRow);

  const [view, setView] = useState<"results" | "messages">("results");
  const [filter, setFilter] = useState("");
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  // edit-mode local state
  const [editingCell, setEditingCell] = useState<{ r: number; c: number } | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [newVals, setNewVals] = useState<Record<string, string>>({});

  const editable = !!edit;
  const roSet = useMemo(() => new Set(edit?.readonly ?? []), [edit]);
  const isRo = (name: string) => roSet.has(name.toLowerCase());

  const derived = useMemo(() => {
    if (!result || editable) return null;
    let rows = result.rows;
    if (filter.trim()) {
      const f = filter.toLowerCase();
      rows = rows.filter((r) => r.some((v) => cellStr(v).toLowerCase().includes(f)));
    }
    if (sort) {
      const { col, dir } = sort;
      rows = [...rows].sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av === null || av === undefined) return 1;
        if (bv === null || bv === undefined) return -1;
        const na = Number(av), nb = Number(bv);
        if (!isNaN(na) && !isNaN(nb)) return (na - nb) * dir;
        return cellStr(av).localeCompare(cellStr(bv)) * dir;
      });
    }
    return rows;
  }, [result, filter, sort, editable]);

  const toggleSort = (col: number) =>
    setSort((s) => (s && s.col === col ? (s.dir === 1 ? { col, dir: -1 } : null) : { col, dir: 1 }));

  const r = result as QueryResult | null;
  const exportRows = derived ?? r?.rows ?? [];

  const startEdit = (rowIdx: number, colIdx: number, value: unknown) => {
    if (!editable || edit!.pk.length === 0) return;
    if (r && isRo(r.columns[colIdx].name)) return; // identity/computed → not editable
    setEditingCell({ r: rowIdx, c: colIdx });
    setDraft(value === null || value === undefined ? "" : String(value));
  };
  const commit = () => {
    if (editingCell) commitCell(editingCell.r, editingCell.c, draft);
    setEditingCell(null);
  };

  const saveNewRow = async () => {
    await addRow(newVals);
    setAdding(false);
    setNewVals({});
  };

  return (
    <div className="results">
      <div className="res-tabs">
        <button className={`res-tab ${view === "results" ? "active" : ""}`} onClick={() => setView("results")}>
          Results {r && <span className="cnt">{derived?.length ?? r.row_count}</span>}
        </button>
        <button className={`res-tab ${view === "messages" ? "active" : ""}`} onClick={() => setView("messages")}>
          Messages
        </button>

        {editable && (
          <span className="edit-badge">
            ✎ Editing {edit!.schema}.{edit!.table}
            {edit!.pk.length ? ` · PK: ${edit!.pk.join(", ")}` : " · read-only (no PK)"}
            <button className="edit-exit" onClick={exitEdit} title="Exit edit mode">✕</button>
          </span>
        )}

        {r && view === "results" && !editable && (
          <input className="res-filter" placeholder="🔎 Filter rows…" value={filter} onChange={(e) => setFilter(e.target.value)} />
        )}

        <div className="res-meta">
          {running && <span>Running…</span>}
          {!running && error && <span className="fail">✕ Failed</span>}
          {!running && !error && r && (
            <>
              <span className="ok">✓</span>
              <span>{r.row_count} rows</span>
              <span>{r.elapsed_ms} ms</span>
            </>
          )}
          {r && (
            <div className="res-tools">
              <button className="icon-btn" title="Copy as CSV" onClick={() => navigator.clipboard.writeText(toCsv(r.columns, exportRows))}>⧉</button>
              <button className="icon-btn" title="Copy as JSON" onClick={() => navigator.clipboard.writeText(toJson(r.columns, exportRows))}>{"{ }"}</button>
              <div className="export-wrap">
                <button className="icon-btn" title="Export" onClick={() => setExportOpen((o) => !o)}>⤓</button>
                {exportOpen && (
                  <div className="export-menu" onMouseLeave={() => setExportOpen(false)}>
                    <div onClick={() => { download(toCsv(r.columns, exportRows), "text/csv", "querydeck.csv"); setExportOpen(false); }}>CSV</div>
                    <div onClick={() => { download(toJson(r.columns, exportRows), "application/json", "querydeck.json"); setExportOpen(false); }}>JSON</div>
                    <div onClick={() => { download(toXls(r.columns, exportRows), "application/vnd.ms-excel", "querydeck.xls"); setExportOpen(false); }}>Excel (.xls)</div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!error && view === "messages" && (
        <div className="messages">{r ? `(${r.row_count} row(s) affected)\nCompleted in ${r.elapsed_ms} ms` : "No messages."}</div>
      )}

      {!error && view === "results" && (
        <div className="grid-scroll">
          {!r && <div className="res-empty">Run a query to see results.</div>}
          {r && r.columns.length > 0 && (
            <table className={editable ? "editable" : ""}>
              <thead>
                <tr>
                  {editable && <th className="rownum" />}
                  <th className="rownum">#</th>
                  {r.columns.map((c, i) => (
                    <th key={i} className={editable ? "" : "sortable"} onClick={() => !editable && toggleSort(i)}>
                      {c.name}
                      {editable && isRo(c.name) && <span className="ro-lock" title="Identity/computed — read-only"> 🔒</span>}
                      {!editable && sort?.col === i && <span className="sort-arrow"> {sort.dir === 1 ? "▲" : "▼"}</span>}
                      <span className="th-ty">{c.type}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(editable ? r.rows : derived ?? r.rows).map((row, ri) => (
                  <tr key={ri}>
                    {editable && (
                      <td className="rownum del">
                        <span title="Delete row" onClick={() => deleteRow(ri)}>🗑</span>
                      </td>
                    )}
                    <td className="rownum">{ri + 1}</td>
                    {row.map((v, ci) => (
                      <td
                        key={ci}
                        className={editable ? (isRo(r.columns[ci].name) ? "ro-cell" : "editable-cell") : ""}
                        onDoubleClick={() => startEdit(ri, ci, v)}
                        title={editable ? (isRo(r.columns[ci].name) ? "Read-only (identity/computed)" : "Double-click to edit") : undefined}
                      >
                        {editable && editingCell && editingCell.r === ri && editingCell.c === ci ? (
                          <input
                            className="cell-input"
                            autoFocus
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            onBlur={commit}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); commit(); }
                              else if (e.key === "Escape") setEditingCell(null);
                            }}
                          />
                        ) : (
                          <Cell value={v} col={r.columns[ci]} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}

                {editable && adding && (
                  <tr className="add-row">
                    <td className="rownum del"><span title="Save row" onClick={saveNewRow}>💾</span></td>
                    <td className="rownum">＋</td>
                    {r.columns.map((c, ci) => (
                      <td key={ci}>
                        {isRo(c.name) ? (
                          <input className="cell-input ro" placeholder="auto" disabled title="Identity/computed — set automatically" />
                        ) : (
                          <input
                            className="cell-input"
                            placeholder={c.type}
                            value={newVals[c.name] ?? ""}
                            onChange={(e) => setNewVals((nv) => ({ ...nv, [c.name]: e.target.value }))}
                          />
                        )}
                      </td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
          )}
          {r && r.columns.length === 0 && (
            <div className="res-empty">Command completed successfully (no result set).</div>
          )}

          {editable && r && edit!.pk.length > 0 && (
            <div className="edit-footer">
              {adding ? (
                <>
                  <button className="tb-btn" onClick={saveNewRow}>💾 Save row</button>
                  <button className="tb-btn" onClick={() => { setAdding(false); setNewVals({}); }}>Cancel</button>
                </>
              ) : (
                <button className="tb-btn" onClick={() => setAdding(true)}>＋ Add row</button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
