# QueryDeck

A fast, focused **Microsoft SQL Server (MSSQL)** desktop client — a slim, modern
alternative to SSMS / Azure Data Studio. Browse your schema, write T-SQL, explore
and edit your data, all in a lightweight native app.

Built with **Tauri 2 + React + TypeScript** and a small Rust core using
[`tiberius`](https://github.com/prisma/tiberius) for SQL Server connectivity.

> Windows-first. ~10 MB installer (uses the OS WebView2 runtime — no bundled Chromium).

---

## Features

**Connect & browse**
- SQL Server auth with Encrypt / Trust-server-certificate options
- Saved connections with a quick-switch dropdown; passwords stored in **Windows Credential Manager**
- Schema sidebar: tables/views → columns with type badges; object search (`Ctrl+P`)

**Query**
- CodeMirror T-SQL editor with syntax highlighting + autocomplete
- Run (`Ctrl+Enter`), cancel a running query, format SQL (`Shift+Alt+F`)
- Multiple query tabs, query history (searchable), saved/favorite queries
- Configurable `TOP` row-limit guard

**Results**
- Type-aware grid: money, datetime, GUID, `bit`, and distinct NULL rendering
- Sort, filter-in-results, copy as CSV/JSON, export to CSV / JSON / Excel
- **Editable results** (PK-aware): inline cell edit → `UPDATE`, row delete/insert,
  with IDENTITY/computed columns auto-detected and protected

**Experience**
- Command palette (`Ctrl+K`), frameless window with custom controls
- Themes: VS Code Dark Pro, GitHub Light, Solarized Light, Quiet Light
- Settings (theme, row limit, font size) — all persisted locally

See [docs/ROADMAP.md](docs/ROADMAP.md) for what's shipped and what's planned, and
[docs/VISION.md](docs/VISION.md) for the product vision.

---

## Tech stack

| Layer | Tech |
|---|---|
| Shell | Tauri 2 (WebView2) |
| Frontend | Vite · React 19 · TypeScript |
| State | Zustand |
| Editor | CodeMirror 6 (`@codemirror/lang-sql`, T-SQL) |
| SQL Server driver | `tiberius` (async, Rust) |
| Persistence | `tauri-plugin-store` + OS keychain (`keyring`) |

---

## Getting started

### Prerequisites
- **Node.js** 18+ and npm
- **Rust** (stable) — https://rustup.rs (MSVC toolchain on Windows)
- A reachable **SQL Server** instance (local, Docker, or remote)

Platform build tools:
- **Windows**: the Visual Studio C++ Build Tools ("Desktop development with C++")
- **Linux**: GTK/WebKit and TLS development libraries. On Debian/Ubuntu:
  ```bash
  sudo apt install -y libwebkit2gtk-4.1-dev libgtk-3-dev libsoup-3.0-dev \
    librsvg2-dev libjavascriptcoregtk-4.1-dev libssl-dev build-essential pkg-config
  ```
  (`libssl-dev` is required — the `tiberius` driver links OpenSSL for TLS.)

### Develop
```bash
npm install
npm run tauri dev
```

### Build a release installer
```bash
npm run tauri build
```

---

## Project structure
```
querydeck/
├── docs/                 VISION.md · ROADMAP.md
├── src/                  React frontend
│   ├── components/       UI components
│   ├── lib/              api · persist · types · store (Zustand)
│   └── styles/app.css
├── src-tauri/            Rust backend
│   └── src/db.rs         tiberius connection registry + commands
└── ...
```

The frontend talks to a handful of Rust commands (`connect`, `run_query`,
`cancel_query`, `list_schema`, `secret_*`) that return a normalized
`{ columns, rows, row_count, elapsed_ms }` shape — the UI never deals with raw
SQL Server types.

---

## License

[MIT](LICENSE)
