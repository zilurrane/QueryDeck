import { useMemo, useState, useEffect, useRef } from "react";
import { useStore } from "../lib/store";

export function ObjectSearch() {
  const schema = useStore((s) => s.schema);
  const loadIntoEditor = useStore((s) => s.loadIntoEditor);
  const run = useStore((s) => s.run);
  const setObjectSearchOpen = useStore((s) => s.setObjectSearchOpen);
  const close = () => setObjectSearchOpen(false);

  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const tables = useMemo(() => {
    if (!schema) return [] as { schema: string; name: string; isView: boolean }[];
    const seen = new Set<string>();
    const out: { schema: string; name: string; isView: boolean }[] = [];
    for (const row of schema.rows) {
      const [sch, tbl, ttype] = row as string[];
      const key = `${sch}.${tbl}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push({ schema: sch, name: tbl, isView: ttype === "VIEW" });
      }
    }
    return out;
  }, [schema]);

  const filtered = useMemo(() => {
    const f = q.toLowerCase().trim();
    return f ? tables.filter((t) => `${t.schema}.${t.name}`.toLowerCase().includes(f)) : tables;
  }, [q, tables]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => inputRef.current?.focus(), []);

  const open = (t?: { schema: string; name: string }) => {
    if (!t) return;
    close();
    loadIntoEditor(`SELECT TOP 100 *\nFROM [${t.schema}].[${t.name}];`);
    run();
  };

  return (
    <div className="cmd-overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="palette">
        <div className="pal-input">
          <span>🔎</span>
          <input
            ref={inputRef}
            placeholder="Go to table or view…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(i + 1, filtered.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); open(filtered[sel]); }
              else if (e.key === "Escape") close();
            }}
          />
          <span className="esc">ESC</span>
        </div>
        <div className="pal-list">
          {filtered.length === 0 && <div className="pal-empty">No objects</div>}
          {filtered.slice(0, 200).map((t, i) => (
            <div
              key={`${t.schema}.${t.name}`}
              className={`pal-item ${i === sel ? "sel" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => open(t)}
            >
              <span>{t.isView ? "🔎" : "🗂️"} {t.name}</span>
              <span className="kbd">{t.schema}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
