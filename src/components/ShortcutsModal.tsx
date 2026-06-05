import { useStore } from "../lib/store";

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: "Editor",
    items: [
      ["Run query", "Ctrl+Enter"],
      ["Format SQL", "Shift+Alt+F"],
    ],
  },
  {
    title: "Navigation",
    items: [
      ["Command palette", "Ctrl+K"],
      ["Go to table / object", "Ctrl+P"],
      ["New connection", "Ctrl+N"],
    ],
  },
  {
    title: "General",
    items: [
      ["Keyboard shortcuts", "?"],
      ["Close dialog / overlay", "Esc"],
    ],
  },
];

export function ShortcutsModal() {
  const close = () => useStore.getState().setShortcutsOpen(false);

  return (
    <div className="overlay" onClick={(e) => e.target === e.currentTarget && close()}>
      <div className="modal" style={{ width: 440 }}>
        <h3>⌨️ Keyboard Shortcuts</h3>
        <div style={{ padding: "10px 20px 16px" }}>
          {GROUPS.map((g) => (
            <div key={g.title} style={{ marginTop: 12 }}>
              <div
                style={{
                  color: "var(--muted)",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: ".5px",
                  textTransform: "uppercase",
                  marginBottom: 6,
                }}
              >
                {g.title}
              </div>
              {g.items.map(([label, keys]) => (
                <div
                  key={label}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "5px 0",
                    fontSize: 13,
                  }}
                >
                  <span>{label}</span>
                  <span className="kbd">{keys}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="foot">
          <span style={{ flex: 1 }} />
          <button className="btn primary" onClick={close}>Close</button>
        </div>
      </div>
    </div>
  );
}
