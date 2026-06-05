import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useStore } from "../lib/store";

const REPO = "https://github.com/zilurrane/QueryDeck";
const LINKS: { label: string; url: string }[] = [
  { label: "GitHub", url: REPO },
  { label: "Report an issue", url: `${REPO}/issues/new` },
  { label: "Documentation", url: `${REPO}#readme` },
  { label: "License (MIT)", url: `${REPO}/blob/main/LICENSE` },
];

const bodyStyle: React.CSSProperties = { padding: "18px 20px" };

export function AboutModal() {
  const close = () => useStore.getState().setAboutOpen(false);
  const checkForUpdates = useStore((s) => s.checkForUpdates);
  const updateStatus = useStore((s) => s.update.status);
  const [version, setVersion] = useState("");

  useEffect(() => {
    getVersion().then(setVersion).catch(() => setVersion(""));
  }, []);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ width: 420 }}>
        <h3>About QueryDeck</h3>
        <div style={bodyStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
            <img src="/icon.png" alt="" width={56} height={56} style={{ borderRadius: 12 }} />
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>QueryDeck</div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>
                {version ? `Version ${version}` : "—"}
              </div>
            </div>
          </div>

          <p style={{ margin: "0 0 14px", color: "var(--muted)", fontSize: 13, lineHeight: 1.5 }}>
            A fast, lightweight SQL client for SQL Server, PostgreSQL, MySQL, and SQLite.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {LINKS.map((l) => (
              <button
                key={l.url}
                className="btn ghost"
                style={{ fontSize: 12 }}
                onClick={() => openUrl(l.url).catch(() => {})}
              >
                {l.label} ↗
              </button>
            ))}
          </div>

          <div style={{ color: "var(--faint)", fontSize: 11 }}>
            © {new Date().getFullYear()} Zilu Ramkrishna Rane · MIT License
          </div>
        </div>
        <div className="foot">
          <button
            className="btn"
            disabled={updateStatus === "checking" || updateStatus === "downloading"}
            onClick={() => checkForUpdates({ silent: false })}
          >
            {updateStatus === "checking" ? "Checking…" : "Check for updates"}
          </button>
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}
