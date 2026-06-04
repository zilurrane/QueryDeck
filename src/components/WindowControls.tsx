import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

// VS Code–style window controls for a frameless (decorations:false) window.
export function WindowControls() {
  const [maximized, setMaximized] = useState(false);
  const win = getCurrentWindow();

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    win.isMaximized().then(setMaximized).catch(() => {});
    win
      .onResized(() => {
        win.isMaximized().then(setMaximized).catch(() => {});
      })
      .then((u) => (unlisten = u))
      .catch(() => {});
    return () => unlisten?.();
  }, []);

  return (
    <div className="winctl">
      <button className="winbtn" title="Minimize" onClick={() => win.minimize()}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <rect x="0" y="4.5" width="10" height="1" fill="currentColor" />
        </svg>
      </button>
      <button
        className="winbtn"
        title={maximized ? "Restore" : "Maximize"}
        onClick={() => win.toggleMaximize()}
      >
        {maximized ? (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.5" y="2.5" width="6" height="6" fill="none" stroke="currentColor" strokeWidth="1" />
            <path d="M2.5 2.5 V0.5 H9.5 V7.5 H7.5" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        ) : (
          <svg width="10" height="10" viewBox="0 0 10 10">
            <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
          </svg>
        )}
      </button>
      <button className="winbtn close" title="Close" onClick={() => win.close()}>
        <svg width="10" height="10" viewBox="0 0 10 10">
          <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" strokeWidth="1" />
        </svg>
      </button>
    </div>
  );
}
