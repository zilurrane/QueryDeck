# QueryDeck — Product Vision

A fast, focused desktop **SQL client for Microsoft SQL Server, PostgreSQL,
MySQL, and SQLite** — a slim, modern alternative to SSMS / Azure Data Studio /
pgAdmin / MySQL Workbench. Built with **Tauri + React + TypeScript**, with a
small Rust core (`tiberius` + `sqlx`).

---

## Product Principles

1. **Fast & light** — tiny binary (Tauri/WebView2), instant startup, no bloat.
2. **Data-first** — results are the hero: type-aware cells, clear NULLs,
   column types always visible.
3. **Safe by default** — hard to run the wrong query against the wrong
   database (prod color guard, encrypted connections).
4. **Keyboard-driven** — `⌘K` command palette, `Ctrl+Enter` to run.
5. **Local & private** — works fully offline; cloud/AI features are optional
   and opt-in.

---

## Feature Tiers

### Tier 1 — MVP (v1, the core product)
Everything here is achievable with Tauri + `tiberius` and ships first.

| Feature | Notes |
|---|---|
| Connection manager + modal | Host/port/login/db; **Encrypt** + **Trust server certificate** toggles |
| Secure credential storage | Passwords in Windows Credential Manager (`keyring`); metadata in `tauri-plugin-store` |
| **Prod safety color guard** | Per-connection env color; red `PROD` chip to prevent accidents |
| Schema sidebar | Tables/Views → columns; PK markers, type badges, row counts; filter box |
| SQL editor | CodeMirror 6, T-SQL highlighting, **schema-aware autocomplete** |
| Run query | `Ctrl+Enter` (whole script or selection); cancel running query |
| Results grid | Virtualized (TanStack Table); **type-aware cells** (money/datetime/GUID/bit), **NULL pills**, **column type badges** |
| Result actions | Copy cell/row, **Export CSV**, row count + execution time |
| Messages / errors | Messages tab + error banner with raw SQL Server message (no crash) |
| Query tabs | Multiple tabs, unsaved indicator |
| Theming | Light + dark themes |
| Welcome / empty state | Onboarding + recent connections |
| **⌘K command palette** | Actions, go-to-table, theme switch |

### Tier 2 — Post-MVP (layered in after the core is solid)
| Feature | Why it's later |
|---|---|
| Query **history** (auto-saved, searchable) | Needs local persistence + UI; not blocking |
| **Saved / favorite queries** | Builds on history |
| **Chart view** of results | Visualization layer on top of the grid |
| Inline cell editing → generated `UPDATE` | Requires PK detection + safe write path |
| Export to **JSON / Excel** | CSV first; others follow |
| Multiple result sets (batch scripts) | Edge case handling |
| SQL **formatter** button | Nice-to-have polish |

### Tier 3 — Heavier / external dependencies
| Feature | Dependency / caveat |
|---|---|
| **Execution plan viewer** (`🧠 Explain plan`) | Must parse SQL Server's **plan XML** and render it — significant work |
| **✨ Ask — plain-English → SQL** | Requires an **LLM API** (e.g. Claude API): API key, network calls, per-query cost, schema-aware prompting. Build **last**, behind a setting. Optional — can be dropped to keep the app fully local/offline |
| SSH tunneling for remote DBs | Extra networking layer |

---

## Tech Stack (summary)

| Layer | Choice |
|---|---|
| Shell | Tauri 2.x (Windows WebView2) |
| Frontend | Vite + React 19 + TypeScript |
| UI | Tailwind CSS + shadcn/ui |
| SQL editor | CodeMirror 6 (`@codemirror/lang-sql`, T-SQL) |
| Results grid | TanStack Table v8 |
| State | Zustand |
| MSSQL driver (Rust) | `tiberius` + `tokio` + `tokio-util` (Compat) |
| TLS | `rustls` |
| Secrets | `keyring` (Windows Credential Manager) |
| Settings | `tauri-plugin-store` |

---

## Open Decisions
- **AI "Ask" bar:** keep on roadmap (Claude API powered) or cut for a fully
  local tool? → Recommended: keep as opt-in Tier 3, build last.
- **v1 scope:** MVP block only, or pull one Tier-2 item (history? charts?)
  into the first build?

---

## Status
- [x] Product direction chosen: MSSQL-only desktop client
- [x] Tech stack selected (Tauri + React + `tiberius`)
- [x] Scaffold project
- [x] MVP + Phase 1 implementation (see [ROADMAP.md](ROADMAP.md))
