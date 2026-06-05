# QueryDeck

**QueryDeck is a fast, lightweight SQL client for Microsoft SQL Server, PostgreSQL,
MySQL, and SQLite** — a slim, modern alternative to SQL Server Management Studio (SSMS),
Azure Data Studio, pgAdmin, and MySQL Workbench. Browse your schema, write SQL, and
explore and edit your data, all in a lightweight native app.

Built with **Tauri 2 + React + TypeScript** and a small Rust core using
[`tiberius`](https://github.com/prisma/tiberius) for SQL Server and
[`sqlx`](https://github.com/launchbadge/sqlx) for PostgreSQL, MySQL, and SQLite.

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

### Releases & auto-update
QueryDeck ships an in-app auto-updater (Tauri's `updater` plugin). On startup it
silently checks for a new version, and **Settings → Check for updates** triggers a
manual check; when one is found the user can install and relaunch in place.

Updates are served from this repo's **GitHub Releases**. The endpoint and signing
public key live in `src-tauri/tauri.conf.json` under `plugins.updater`.

**Publishing a release** is automated by `.github/workflows/release.yml` — push a
version tag and it builds signed installers for Windows/macOS/Linux and uploads a
`latest.json` manifest:
```bash
# bump "version" in src-tauri/tauri.conf.json first, then:
git tag v0.1.1 && git push origin v0.1.1
```
The workflow creates a **draft** release; review it and publish, and clients will
pick it up (the endpoint points at the latest published release).

**One-time setup** — the release workflow runs in the **`Prod`** GitHub Environment
(Settings → Environments → Prod). Add two secrets there:
- `TAURI_SIGNING_PRIVATE_KEY` — contents of the private key generated with
  `npm run tauri signer generate`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` — its password (empty string if none)

> If the `Prod` environment has protection rules (required reviewers, or a
> deployment-branch/tag allow-list), the release job will wait for approval or be
> blocked — make sure your `v*` tags are permitted.

> ⚠️ Keep the private key out of the repo. If it's lost, existing installs can no
> longer verify updates. Rotating it requires shipping a build with the new public
> key by a non-updater channel.

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

## FAQ

**What is QueryDeck?**
QueryDeck is a fast, lightweight desktop SQL client for Microsoft SQL Server, PostgreSQL,
MySQL, and SQLite. It lets you connect to a database, browse its schema, write and run
SQL, and view and edit results — in a small native app built with Tauri, React, and a Rust
core (`tiberius` for SQL Server, `sqlx` for PostgreSQL/MySQL/SQLite).

**Is QueryDeck free?**
Yes. QueryDeck is free and open source under the [MIT license](LICENSE).

**How is QueryDeck different from SSMS or Azure Data Studio?**
It's intentionally slim and focused: a ~10 MB installer that starts instantly and uses
the OS WebView (no bundled Chromium). It covers the everyday loop — connect, browse,
query, edit, export — without the weight of the larger tools.

**Which databases does QueryDeck support?**
Microsoft SQL Server (including Azure SQL and SQL Server in Docker) via the
`tiberius` driver, plus **PostgreSQL**, **MySQL/MariaDB**, and **SQLite** via `sqlx`
(see [docs/ROADMAP.md](docs/ROADMAP.md)). Inline result editing is currently SQL Server
only.

**Which platforms does it run on?**
Windows-first, with builds for macOS and Linux. Passwords are stored in the OS keychain
(Windows Credential Manager on Windows).

**Does QueryDeck work offline?**
Yes. It talks only to the SQL Server you connect to — there are no required cloud or
telemetry services. The app updates itself from GitHub Releases when you choose to.

**Does QueryDeck use AI?**
Not in the shipped app. A plain-English-to-SQL "Ask" feature is on the roadmap as an
optional, opt-in capability (see [docs/VISION.md](docs/VISION.md)).

---

## License

[MIT](LICENSE) © Zilu Ramkrishna Rane
