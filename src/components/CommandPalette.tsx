import { useMemo, useState, useEffect, useRef } from "react";
import { useStore } from "../lib/store";
import { THEMES } from "../lib/types";

interface Cmd {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
}

export function CommandPalette() {
  const s = useStore();
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const close = () => s.setPaletteOpen(false);

  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      { id: "run", label: "Run Query", hint: "Ctrl+Enter", run: () => s.run() },
      { id: "cancel", label: "Cancel Running Query", run: () => s.cancel() },
      { id: "format", label: "Format SQL", hint: "Shift+Alt+F", run: () => s.formatActive() },
      { id: "newtab", label: "New Query Tab", run: () => s.addTab("") },
      {
        id: "save",
        label: "Save Query to Favorites",
        run: () => {
          const sql = s.activeTab()?.sql ?? "";
          if (sql.trim()) s.addFavorite(sql.trim().replace(/\s+/g, " ").slice(0, 40), sql);
        },
      },
      { id: "newconn", label: "New Connection", hint: "Ctrl+N", run: () => s.setModalOpen(true) },
      { id: "objects", label: "Go to Table / Object…", hint: "Ctrl+P", run: () => s.setObjectSearchOpen(true) },
      { id: "history", label: "Show Query History", run: () => s.setSidePanel("history") },
      { id: "favorites", label: "Show Saved Queries", run: () => s.setSidePanel("favorites") },
      { id: "settings", label: "Open Settings…", run: () => s.setSettingsOpen(true) },
      ...THEMES.map((t) => ({ id: `theme-${t.id}`, label: `Theme: ${t.name}`, run: () => s.setTheme(t.id) })),
    ];
    if (s.conn) list.push({ id: "disconnect", label: "Disconnect", run: () => s.doDisconnect() });
    return list;
  }, [s.conn]);

  const filtered = useMemo(() => {
    const f = q.toLowerCase().trim();
    return f ? commands.filter((c) => c.label.toLowerCase().includes(f)) : commands;
  }, [q, commands]);

  useEffect(() => setSel(0), [q]);
  useEffect(() => inputRef.current?.focus(), []);

  const exec = (c?: Cmd) => {
    if (!c) return;
    close();
    c.run();
  };

  return (
    <div className="cmd-overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="palette">
        <div className="pal-input">
          <span>⌘</span>
          <input
            ref={inputRef}
            placeholder="Type a command…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setSel((i) => Math.min(i + 1, filtered.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); exec(filtered[sel]); }
              else if (e.key === "Escape") close();
            }}
          />
          <span className="esc">ESC</span>
        </div>
        <div className="pal-list">
          {filtered.length === 0 && <div className="pal-empty">No matching commands</div>}
          {filtered.map((c, i) => (
            <div
              key={c.id}
              className={`pal-item ${i === sel ? "sel" : ""}`}
              onMouseEnter={() => setSel(i)}
              onClick={() => exec(c)}
            >
              <span>{c.label}</span>
              {c.hint && <span className="kbd">{c.hint}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
