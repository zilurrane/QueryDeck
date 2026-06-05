import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { sql, MSSQL, PostgreSQL } from "@codemirror/lang-sql";
import { keymap } from "@codemirror/view";
import { Prec } from "@codemirror/state";
import { vscodeDark } from "@uiw/codemirror-theme-vscode";
import { githubLight } from "@uiw/codemirror-theme-github";
import { useStore } from "../lib/store";
import { THEMES, engineDef } from "../lib/types";

export function Editor() {
  const tab = useStore((s) => s.activeTab());
  const setSql = useStore((s) => s.setSql);
  const run = useStore((s) => s.run);
  const cancel = useStore((s) => s.cancel);
  const formatActive = useStore((s) => s.formatActive);
  const addFavorite = useStore((s) => s.addFavorite);
  const running = useStore((s) => s.running);
  const conn = useStore((s) => s.conn);
  const settings = useStore((s) => s.settings);

  const saveFavorite = () => {
    const sql = tab?.sql ?? "";
    if (sql.trim()) addFavorite(sql.trim().replace(/\s+/g, " ").slice(0, 40), sql);
  };

  const dark = THEMES.find((t) => t.id === settings.themeId)?.dark ?? true;
  const dialect = conn?.engine === "postgres" ? PostgreSQL : MSSQL;
  const dialectName = engineDef(conn?.engine).dialect;

  const runKey = useMemo(
    () =>
      Prec.highest(
        keymap.of([
          { key: "Mod-Enter", run: () => (run(), true) },
          { key: "Shift-Alt-f", run: () => (formatActive(), true) },
        ])
      ),
    [run, formatActive]
  );

  if (!tab) return null;

  return (
    <div className="editor-wrap">
      <div className="editor-toolbar">
        {running ? (
          <button className="run-btn cancel" onClick={() => cancel()}>
            ⏹ Cancel
          </button>
        ) : (
          <button className="run-btn" onClick={() => run()} disabled={!conn}>
            ▶ Run <span style={{ opacity: 0.7 }}>Ctrl↵</span>
          </button>
        )}
        <button className="tb-btn" title="Format SQL (Shift+Alt+F)" onClick={() => formatActive()}>
          ✨ Format
        </button>
        <button className="tb-btn" title="Save to favorites" onClick={saveFavorite}>
          ★ Save
        </button>
        <div className="tb-right">
          {settings.rowLimitEnabled && <span title="Row limit">≤ {settings.rowLimit} rows</span>}
          <span>{dialectName} · {conn ? conn.database : "no connection"}</span>
        </div>
      </div>
      <div className="cm-host" style={{ fontSize: settings.fontSize }}>
        <CodeMirror
          value={tab.sql}
          theme={dark ? vscodeDark : githubLight}
          height="100%"
          extensions={[sql({ dialect }), runKey]}
          onChange={(v) => setSql(tab.id, v)}
          basicSetup={{ lineNumbers: true, foldGutter: false }}
          placeholder={`Write ${dialectName} here…  (Ctrl+Enter to run)`}
        />
      </div>
    </div>
  );
}
