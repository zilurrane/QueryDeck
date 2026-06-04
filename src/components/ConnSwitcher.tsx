import { useState } from "react";
import { useStore } from "../lib/store";

export function ConnSwitcher() {
  const conn = useStore((s) => s.conn);
  const connName = useStore((s) => s.connName);
  const connEnv = useStore((s) => s.connEnv);
  const saved = useStore((s) => s.savedConnections);
  const connectSaved = useStore((s) => s.connectSaved);
  const removeSaved = useStore((s) => s.removeSavedConnection);
  const doDisconnect = useStore((s) => s.doDisconnect);
  const setModalOpen = useStore((s) => s.setModalOpen);

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const dot = !conn ? "" : connEnv === "prod" ? "prod" : "live";

  const connectTo = async (id: string, sc: any) => {
    setBusy(id);
    try {
      await connectSaved(sc);
      setOpen(false);
    } catch (e) {
      alert(String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="conn-switch">
      <div className={`conn-chip ${dot}`} onClick={() => setOpen((o) => !o)} title="Switch connection">
        <span className="dot" />
        <strong>{conn ? connName || conn.database : "Not connected"}</strong>
        {conn && connEnv === "prod" && <span className="env">PROD</span>}
        <span style={{ color: "var(--faint)" }}>▾</span>
      </div>
      {open && (
        <>
          <div className="dropdown-scrim" onClick={() => setOpen(false)} />
          <div className="conn-dropdown">
            <div className="dd-label">Saved connections</div>
            {saved.length === 0 && <div className="dd-empty">None saved yet</div>}
            {saved.map((sc) => (
              <div className="dd-item" key={sc.id} onClick={() => connectTo(sc.id, sc)}>
                <span className={`dd-dot ${sc.env}`} />
                <span className="dd-name">{busy === sc.id ? "Connecting…" : sc.name}</span>
                <span className="dd-host">{sc.host},{sc.port}</span>
                <span className="dd-del" onClick={(e) => { e.stopPropagation(); removeSaved(sc.id); }} title="Remove">✕</span>
              </div>
            ))}
            <div className="dd-sep" />
            <div className="dd-action" onClick={() => { setOpen(false); setModalOpen(true); }}>＋ New connection…</div>
            {conn && <div className="dd-action" onClick={() => { setOpen(false); doDisconnect(); }}>⏏ Disconnect</div>}
          </div>
        </>
      )}
    </div>
  );
}
