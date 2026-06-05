import { useEffect } from "react";
import { useStore } from "./lib/store";
import { THEMES } from "./lib/types";
import { ConnectionModal } from "./components/ConnectionModal";
import { SettingsModal } from "./components/SettingsModal";
import { CommandPalette } from "./components/CommandPalette";
import { ObjectSearch } from "./components/ObjectSearch";
import { ConnSwitcher } from "./components/ConnSwitcher";
import { Sidebar } from "./components/Sidebar";
import { Editor } from "./components/Editor";
import { Results } from "./components/Results";
import { WindowControls } from "./components/WindowControls";
import { UpdateModal } from "./components/UpdateModal";

export default function App() {
  const settings = useStore((s) => s.settings);
  const setTheme = useStore((s) => s.setTheme);
  const init = useStore((s) => s.init);
  const conn = useStore((s) => s.conn);
  const setModalOpen = useStore((s) => s.setModalOpen);
  const setSettingsOpen = useStore((s) => s.setSettingsOpen);
  const setPaletteOpen = useStore((s) => s.setPaletteOpen);
  const modalOpen = useStore((s) => s.modalOpen);
  const settingsOpen = useStore((s) => s.settingsOpen);
  const paletteOpen = useStore((s) => s.paletteOpen);
  const objectSearchOpen = useStore((s) => s.objectSearchOpen);
  const updateVisible = useStore((s) => s.update.visible);

  const tabs = useStore((s) => s.tabs);
  const activeTabId = useStore((s) => s.activeTabId);
  const setActiveTab = useStore((s) => s.setActiveTab);
  const closeTab = useStore((s) => s.closeTab);
  const addTab = useStore((s) => s.addTab);

  const dark = THEMES.find((t) => t.id === settings.themeId)?.dark ?? true;

  useEffect(() => {
    init();
    // Silently check for updates on startup; only surfaces UI if one is found.
    useStore.getState().checkForUpdates({ silent: true });
  }, [init]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "k") { e.preventDefault(); useStore.getState().setPaletteOpen(!useStore.getState().paletteOpen); }
      else if (mod && e.key.toLowerCase() === "p") { e.preventDefault(); useStore.getState().setObjectSearchOpen(true); }
      else if (mod && e.key.toLowerCase() === "n") { e.preventDefault(); useStore.getState().setModalOpen(true); }
      else if (e.key === "Escape") {
        const st = useStore.getState();
        st.setPaletteOpen(false); st.setObjectSearchOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const quickToggleTheme = () => setTheme(dark ? "github-light" : "vscode-dark");

  return (
    <div className="app">
      <header data-tauri-drag-region>
        <div className="logo">
          <span className="mark">Q</span> QueryDeck
        </div>
        <ConnSwitcher />
        <div className="spacer" data-tauri-drag-region />
        <button className="icon-btn" title="Command palette (Ctrl+K)" onClick={() => setPaletteOpen(true)}>⌘</button>
        <button className="icon-btn" title="Settings" onClick={() => setSettingsOpen(true)}>⚙️</button>
        <button className="icon-btn" title="Toggle theme" onClick={quickToggleTheme}>{dark ? "☀️" : "🌙"}</button>
        <WindowControls />
      </header>

      <div className="body">
        <Sidebar />
        <main>
          <div className="tabs">
            {tabs.map((t) => (
              <div
                key={t.id}
                className={`tab ${t.id === activeTabId ? "active" : ""}`}
                onClick={() => setActiveTab(t.id)}
              >
                📄 {t.name}
                <span className="x" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>×</span>
              </div>
            ))}
            <div className="newtab" onClick={() => addTab("")} title="New query tab">＋</div>
          </div>

          {!conn ? (
            <div className="welcome">
              <div className="wmark">Q</div>
              <h1>Welcome to QueryDeck</h1>
              <p>A fast, focused SQL Server studio. Connect to a database to browse its schema, write T-SQL, and explore your data.</p>
              <div className="wbtn" onClick={() => setModalOpen(true)}>🔌 New connection</div>
            </div>
          ) : (
            <>
              <Editor />
              <Results />
            </>
          )}
        </main>
      </div>

      <div className="status">
        <span className="s"><span className={`live ${conn ? "" : "off"}`} />{conn ? "Connected" : "Disconnected"}</span>
        {conn && <span className="s">{conn.database}</span>}
        <span className="s right">{THEMES.find((t) => t.id === settings.themeId)?.name}</span>
        <span className="s">T-SQL</span>
        <span className="s">⌘K</span>
      </div>

      {modalOpen && <ConnectionModal />}
      {settingsOpen && <SettingsModal />}
      {paletteOpen && <CommandPalette />}
      {objectSearchOpen && <ObjectSearch />}
      {updateVisible && <UpdateModal />}
    </div>
  );
}
