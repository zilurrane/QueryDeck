import { useStore } from "../lib/store";

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const bodyStyle: React.CSSProperties = { padding: "16px 20px" };
const mutedStyle: React.CSSProperties = { color: "var(--muted)", margin: 0 };

export function UpdateModal() {
  const update = useStore((s) => s.update);
  const install = useStore((s) => s.installUpdate);
  const check = useStore((s) => s.checkForUpdates);
  const dismiss = useStore((s) => s.dismissUpdate);

  const { status } = update;
  const pct =
    status === "downloading" && update.total
      ? Math.min(100, Math.round(((update.downloaded ?? 0) / update.total) * 100))
      : null;

  const closeOnBackdrop = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && status !== "downloading") dismiss();
  };

  return (
    <div className="overlay" onClick={closeOnBackdrop}>
      <div className="modal" style={{ width: 460 }}>
        {status === "checking" && (
          <>
            <h3>⏳ Checking for updates…</h3>
            <div style={bodyStyle}>
              <p style={mutedStyle}>Contacting the update server.</p>
            </div>
          </>
        )}

        {status === "uptodate" && (
          <>
            <h3>✓ You're up to date</h3>
            <div style={bodyStyle}>
              <p style={mutedStyle}>
                QueryDeck{update.currentVersion ? ` ${update.currentVersion}` : ""} is the latest version.
              </p>
            </div>
            <div className="foot">
              <span style={{ flex: 1 }} />
              <button className="btn primary" onClick={dismiss}>Close</button>
            </div>
          </>
        )}

        {status === "available" && (
          <>
            <h3>🎉 Update available</h3>
            <div style={bodyStyle}>
              <p style={{ margin: "0 0 8px" }}>
                A new version <strong>{update.version}</strong> is available
                {update.currentVersion ? ` (you have ${update.currentVersion})` : ""}.
              </p>
              {update.body && (
                <pre
                  style={{
                    maxHeight: 180,
                    overflow: "auto",
                    whiteSpace: "pre-wrap",
                    fontSize: 12,
                    color: "var(--muted)",
                    background: "var(--panel2)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    padding: 10,
                    margin: 0,
                  }}
                >
                  {update.body}
                </pre>
              )}
            </div>
            <div className="foot">
              <span style={{ flex: 1 }} />
              <button className="btn ghost" onClick={dismiss}>Later</button>
              <button className="btn primary" onClick={install}>Install &amp; Restart</button>
            </div>
          </>
        )}

        {status === "downloading" && (
          <>
            <h3>⬇️ Downloading update…</h3>
            <div style={bodyStyle}>
              <div
                style={{
                  height: 8,
                  borderRadius: 4,
                  background: "var(--panel2)",
                  border: "1px solid var(--border)",
                  overflow: "hidden",
                  marginBottom: 10,
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: pct != null ? `${pct}%` : "100%",
                    background: "var(--accent)",
                    transition: "width 120ms linear",
                  }}
                />
              </div>
              <p style={mutedStyle}>
                {pct != null ? `${pct}% · ` : ""}
                {fmtBytes(update.downloaded ?? 0)}
                {update.total ? ` / ${fmtBytes(update.total)}` : ""}
                {" — the app will restart when finished."}
              </p>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <h3>⚠️ Update failed</h3>
            <div style={bodyStyle}>
              <p style={{ ...mutedStyle, wordBreak: "break-word" }}>{update.error}</p>
            </div>
            <div className="foot">
              <span style={{ flex: 1 }} />
              <button className="btn ghost" onClick={dismiss}>Close</button>
              <button className="btn primary" onClick={() => check()}>Retry</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
