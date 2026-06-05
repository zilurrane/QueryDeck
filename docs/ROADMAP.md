# QueryDeck — Feature Roadmap

Status: **MVP + Phase 1 shipped.**
MVP — connect (tiberius/MSSQL), schema sidebar, T-SQL editor (CodeMirror),
run query (Ctrl+Enter), type-aware results grid, query tabs, welcome state,
frameless window with custom controls.
**Phase 1 (all P1-1..P1-18) implemented** — see below; all marked ✅.

Phase 2 mostly open — **P2-3 (editable results)** and **P2-13 (auto-update)** are
shipped. Pick remaining items by ID (e.g. "build P2-1, P2-4"). Phase 3 tracks
engineering / release hardening surfaced after the first signed release.

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
- **P2-13** ✅ Auto-update (Tauri updater) — signed releases via GitHub Actions; silent startup check + manual check in Settings; verified end-to-end on v0.1.1

---

## Phase 3 — Engineering & release hardening
*Surfaced after the first signed release (v0.1.1). Not user-facing features, but
they gate trust, distribution, and contributor velocity.*

- **E-1** OS code signing — Windows Authenticode + macOS notarization (Apple Developer cert). Without it, installs trip SmartScreen / Gatekeeper. **Blocks macOS auto-update** (Gatekeeper won't let the updater replace an unsigned `.app` in place). The updater's own minisign signing is already done; this is OS-level trust.
- **E-2** PR continuous integration — run `npm run build` (tsc) + `cargo check` on pull requests. Today the only automated check is `tsc` during build, and CI runs solely on release tags.
- **E-3** Test suite — there are currently no tests. Start with the SQL-builder helpers in `store.ts` (`ident`/`sqlLiteral`/`whereClause`/`coerce`) and the type normalization in `db.rs` (`cell_to_json`/`type_name`).
- **E-4** Frontend bundle splitting — the build emits one ~995 KB JS chunk (302 KB gzip) and warns. Code-split heavy deps (CodeMirror, `sql-formatter`, react-table) via dynamic `import()` / `manualChunks`.
- **E-5** Lint — no ESLint configured; add a minimal config so style/quality issues are caught in CI.
- **E-6** Updater UX polish — periodic re-check (not just on startup), a "last checked" indicator, richer release-notes rendering, and a cancel control mid-download.
- **E-7** Release/repo presentation — set the repo homepage to `releases/latest`, add screenshots/GIF + download badges to the README (the SEO/AEO groundwork is in, but there's no visual yet).

---

## Recommended next
Phase 1 (persistence, editor, results, UX) and the release pipeline are done. From here:
- **Highest ship-quality:** **E-1** (OS code signing) — without it macOS auto-update silently won't work and Windows installs look untrusted.
- **Highest user value:** **P2-5** (stored procs/functions) or **P2-7** (`GO` / multi-result execution) — common daily gaps.
- **Cheap wins:** **E-4** (bundle splitting) + **E-2** (PR CI).
