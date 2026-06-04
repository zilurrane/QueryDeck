# QueryDeck — Feature Roadmap

Status: **MVP + Phase 1 shipped.**
MVP — connect (tiberius/MSSQL), schema sidebar, T-SQL editor (CodeMirror),
run query (Ctrl+Enter), type-aware results grid, query tabs, welcome state,
frameless window with custom controls.
**Phase 1 (all P1-1..P1-18) implemented** — see below; all marked ✅.

Phase 2 items are still open — pick by ID (e.g. "build P2-1, P2-4").

---

## Phase 1 — Power-user essentials  ✅ SHIPPED
*All items below are implemented. High value, mostly frontend + light Rust.*

### Persistence & connections
- **P1-1** Save connections between sessions (metadata via `tauri-plugin-store`, passwords in Windows Credential Manager via `keyring`)
- **P1-2** Multiple connections + quick-switch dropdown in the title-bar chip
- **P1-3** Query history — auto-saved, searchable
- **P1-4** Saved / favorite queries — named, persisted

### Editor & execution
- **P1-5** Cancel a running query
- **P1-6** Format SQL button (T-SQL prettify)
- **P1-7** Row-limit guard (auto `TOP 1000`, configurable)
- **P1-8** Command palette (Ctrl+K)
- **P1-9** Object search / jump-to-table (Ctrl+P)

### Results grid
- **P1-10** Sort by column
- **P1-11** Filter / search within results
- **P1-12** Resize columns
- **P1-13** Copy as CSV / JSON / INSERT statements; expand long cell text
- **P1-14** Export to JSON / Excel (alongside CSV)
- **P1-15** Proper Messages tab (rows-affected, multiple result sets)

### UX
- **P1-16** Theme dropdown (GitHub Light / Solarized / Quiet Light + Dark Pro)
- **P1-17** Right-click context menu on tables (Select Top N, Script as SELECT, Copy name)
- **P1-18** Settings panel (default row limit, font size, theme) — persisted

---

## Phase 2 — Advanced / power tooling
*Bigger subsystems, more Rust, some external deps.*

- **P2-1** Execution plan viewer — parse SQL Server plan XML, visualize operators & cost
- **P2-2** Charts — visualize result sets (bar/line/pie)
- **P2-3** ✅ Editable results — inline cell edit → generated `UPDATE`; row insert/delete (PK-aware)
- **P2-4** AI "Ask in plain English → SQL" + explain/optimize (Claude API; opt-in, keyed)
- **P2-5** Stored procedures & functions — browse, view definition (`sp_helptext`), execute with params
- **P2-6** ER diagram / relationships view from foreign keys
- **P2-7** Batch scripts with `GO` separators / multi-statement execution
- **P2-8** More auth: Windows auth, Azure AD, SSH tunneling
- **P2-9** Import CSV → table
- **P2-10** Snippets library + parameterized queries (`@vars`)
- **P2-11** Prod safe-mode (read-only guard, confirm on writes) + connection color coding
- **P2-12** DB insights — table/index sizes, row counts dashboard
- **P2-13** Auto-update (Tauri updater)

---

## Recommended first build
**P1-1 + P1-2 + P1-3 + P1-4** (persistence cluster) — the biggest day-to-day
quality-of-life jump; unblocks history/favorites and stops re-typing
connection details every launch.
