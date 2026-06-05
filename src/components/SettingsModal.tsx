import { useStore } from "../lib/store";
import { THEMES, type ThemeId } from "../lib/types";

export function SettingsModal() {
  const settings = useStore((s) => s.settings);
  const setSettings = useStore((s) => s.setSettings);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const checkForUpdates = useStore((s) => s.checkForUpdates);
  const updateStatus = useStore((s) => s.update.status);
  const close = () => setSettingsOpen(false);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="modal">
        <h3>⚙️ Settings</h3>
        <div className="form" style={{ gridTemplateColumns: "1fr" }}>
          <div className="field">
            <label>Theme</label>
            <select
              className="select"
              value={settings.themeId}
              onChange={(e) => setSettings({ themeId: e.target.value as ThemeId })}
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div className="toggles" style={{ gridColumn: "1" }}>
            <div className="tog" onClick={() => setSettings({ rowLimitEnabled: !settings.rowLimitEnabled })}>
              <span className={`sw ${settings.rowLimitEnabled ? "on" : ""}`} /> Limit rows returned (TOP guard)
            </div>
          </div>

          <div className="field">
            <label>Default row limit</label>
            <input
              type="number"
              value={settings.rowLimit}
              disabled={!settings.rowLimitEnabled}
              onChange={(e) => setSettings({ rowLimit: Math.max(1, Number(e.target.value) || 1000) })}
            />
          </div>

          <div className="field">
            <label>Editor font size: {settings.fontSize}px</label>
            <input
              type="range"
              min={11}
              max={20}
              value={settings.fontSize}
              onChange={(e) => setSettings({ fontSize: Number(e.target.value) })}
            />
          </div>

          <div className="field">
            <label>Updates</label>
            <button
              className="btn ghost"
              disabled={updateStatus === "checking" || updateStatus === "downloading"}
              onClick={() => checkForUpdates({ silent: false })}
            >
              {updateStatus === "checking" ? "Checking…" : "Check for updates"}
            </button>
          </div>
        </div>
        <div className="foot">
          <button className="btn ghost" onClick={close}>Close</button>
          <button className="btn primary" onClick={close}>Done</button>
        </div>
      </div>
    </div>
  );
}
