# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

QueryDeck is a desktop SQL client built with **Tauri 2** — a React/TypeScript frontend
(`src/`) over a small Rust backend (`src-tauri/`). It connects to **SQL Server** via the
`tiberius` driver and **PostgreSQL, MySQL, and SQLite** via `sqlx`. Windows-first; also
builds for macOS/Linux.

## Commands

```bash
npm install                # install JS deps (also needed before any tauri command)
npm run tauri dev          # run the full native app (compiles Rust; opens a window)
npm run dev                # frontend only on http://localhost:1420 — Tauri `invoke`
                           #   commands are UNAVAILABLE here, so DB features won't work
npm run build              # frontend typecheck + production build (tsc && vite build)
npm run tauri build        # produce signed installers for the current OS
```

There is **no test suite and no linter configured** — `npm run build` (the `tsc` pass)
is the only automated check. Prefer running it after frontend changes.

Native builds need the Rust toolchain plus, on Linux, system libs
(`libwebkit2gtk-4.1-dev`, `libssl-dev`, GTK/soup/rsvg). See the README "Getting started"
section for the exact `apt` line.

## Architecture

**The normalization boundary is the key idea.** The frontend never sees raw SQL Server
types. Every query flows: React → `src/lib/api.ts` (typed `invoke` wrappers) → Rust
command in `src-tauri/src/db.rs` → tiberius → back as a uniform
`QueryResult { columns, rows, row_count, elapsed_ms }`, where each cell is JSON produced
by `cell_to_json`/`type_name` in `db.rs`. When result shape or type handling changes,
both `db.rs` (producer) and `src/lib/types.ts` (consumer types) must move together.

- **Tauri arg convention:** JS passes camelCase keys (`connId`, `maxRows`); Tauri maps
  them to the Rust command's snake_case params. `api.ts` is the single place these
  command names/args are declared — keep it in sync with `db.rs` `#[tauri::command]` fns.

- **Connection registry (`db.rs`):** `DbState` holds a map of connection id → live
  connection. Each connection is an `AnyConn` enum (`Mssql(tiberius)` / `Postgres(sqlx)` /
  `Mysql(sqlx)` / `Sqlite(sqlx)`; SQLite is file-based — the path lives in `ConnConfig.database`);
  `build_client`/`exec`/`list_schema`/`schema_sql` dispatch on `ConnConfig.engine`, and the
  per-engine cell→JSON mappers funnel into the same `QueryResult`. To add an engine: a new
  `Engine` variant, an `AnyConn` arm, a cell mapper, and a `schema_sql` case. `connect` opens
  and stores one; `run_query`/`list_schema`/`disconnect` look it up by id. Secrets (passwords) are handled by the `secret_*` commands via the OS
  keychain (`keyring`), never returned to or stored by the frontend in plaintext.

- **Single Zustand store (`src/lib/store.ts`)** is the orchestration hub: it holds nearly
  all app state and every async action (connect, run, schema refresh, history/favorites,
  the editable-results flow, and the updater). Actions call `api.ts` and `persist.ts`;
  components stay thin. New cross-cutting behavior generally belongs here, not in
  components.

- **Editable results** (inline `UPDATE`/`DELETE`/`INSERT`) are driven from `store.ts`
  (`editTable`/`commitCell`/`deleteRow`/`addRow`) but generate SQL through a per-engine
  `Dialect` in `src/lib/dialects.ts` (`dialectFor(engine)`): identifier quoting, string
  literals, `TOP` vs `LIMIT`, and the PK / read-only-column introspection queries all vary
  by engine. It is PK-aware and protects identity/computed/generated columns. This is the
  one place the app generates mutating SQL — treat changes here carefully.

- **Persistence (`src/lib/persist.ts`)** splits storage by sensitivity: non-secret state
  (settings, connection metadata, query history, favorites) goes to `tauri-plugin-store`
  (`querydeck.json`); **passwords only ever go to the OS keychain** via `secret_*`. Don't
  put credentials in the plugin store.

## Auto-updater & releases

The app self-updates from GitHub Releases (Tauri `updater` + `process` plugins). Flow:
`src/lib/updater.ts` wraps `check`/`downloadAndInstall`/`relaunch`; `store.ts` drives the
state; `UpdateModal.tsx` renders it. A silent check runs on startup; Settings has a manual
check. Signing config (`endpoints`, `pubkey`) and `createUpdaterArtifacts` live in
`src-tauri/tauri.conf.json` under `plugins.updater`.

`.github/workflows/release.yml` builds/signs/publishes on a `v*` tag push, running in the
`Prod` GitHub Environment (where the `TAURI_SIGNING_*` secrets live; the env's deployment
tag rule must allow `v*`). It creates a **draft** release to review and publish.

To cut a release, the version must be bumped in **all three** of `package.json`,
`src-tauri/Cargo.toml`, and `src-tauri/tauri.conf.json` (the updater compares the
`tauri.conf.json` version), then tag `vX.Y.Z`.

## Gotchas

- **Tauri capabilities:** any new plugin/command must be allow-listed in
  `src-tauri/capabilities/default.json`, or it's blocked at runtime (the app may panic on
  an unknown permission identifier at launch).
- **Commit messages:** do not add a Claude/AI `Co-Authored-By` trailer in this repo.
