# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

Riichi Mahjong (日本麻将) scoreboard, v2: a TV "console" page shows a room QR code, phones join and
remote-control the scoreboard, all clients stay in sync through a single Node server. The console can also
seat "local players" (no phone needed) and dissolve a room at any time. UI is entirely in Chinese. Room
rules (村规) are configurable per room; the built-in preset is M-League.

## Commands

Package manager is **Yarn 4** (via corepack). Node >= 22.13 (node:sqlite); use 24 locally (`.nvmrc`).

- `yarn dev` — starts server (`:8787`) and web (`:5173`, Vite proxies `/api` and `/ws` to the server) together
- `yarn build` — builds server (`apps/server/dist`) and web (`apps/web/dist`)
- `yarn test` — Vitest across `packages/core`, `apps/server`, `apps/web` (pure-function tests only)
- `yarn typecheck` / `yarn lint` / `yarn format:check`
- `yarn e2e` — Playwright (builds web, starts server on :8799): `smoke.spec.ts` (TV + phones + local players +
  dissolve), `landing.spec.ts` (device routing). `SHOTS_DIR=/tmp/x yarn e2e e2e/shots.spec.ts` dumps
  screenshots for visual review (skipped otherwise).
- `docker compose up -d --build` — single container (server + built web), data volume at `/data`

## Architecture

Yarn workspaces monorepo:

- `packages/core` — pure TypeScript domain: types, rules + presets, scoring, round progression, final
  settlement, reducer (`reduceRoom(state, event)` is a pure function), reference tables (番符表 data with
  example hands in MPSZ notation), description formatting, client/server protocol types. No DOM, no wasm.
  Shared by server (authority) and web (pre-confirm preview).
- `apps/server` — Hono + `@hono/node-ws` + `node:sqlite` + `riichi-rs-node` (hand → han/fu/yaku, server
  only). Rooms are event-sourced: commands are validated (`validateCommand`), enriched by actor
  (`registry.enrich`: seat identity, local-player ownership, engine evaluation), reduced, appended to
  `room_events`, and the resulting `present` state is broadcast. Undo/redo stacks live in memory and are
  rebuilt by replay. Transient UI intents (mirroring a phone's dialog on the TV) live in memory only.
  SQLite schema is versioned (`db/index.ts` `MIGRATIONS`, applied by `user_version`). User files go through
  `storage/ObjectStore`: local disk (served at `/api/objects/*`) or Tencent COS (`QCLOUD_*` env, `riichi/`
  prefix, see `.env.template`). Serves the built web app with SPA fallback.
- `apps/web` — Vite + React 19 + Tailwind v4 + radix primitives. Routes: `/` landing (device routing:
  desktop → `/console`, tablet chooses, phone gets QR scan + code input), `/console` (TV), `/r/:code`
  (phone). Tile images are flat SVGs from mahjong_graphic (`src/assets/tiles`, see NOTICE.md), rendered by
  `features/hand/TileFace`.

Layering rule: entry files only assemble; data/state/render responsibilities are split into directories
named by role (see `features/*`). Server DTOs are passed through whole; conversion only at boundaries.

## Domain Concepts

- Four seats 東/南/西/北 (`Seat` 0–3); dealer is derived: `dealerOf(kyoku) = kyoku % 4`; `kyoku` 0–7 =
  東1–南4 (extra rounds for 西入 when enabled); `kyotaku` = riichi sticks on table; `honba` = repeat counter.
- Tile codes follow riichi-rs (1–34) plus red fives 35/36/37 (`baseTile`/`isAka` in `types/tiles.ts`);
  red fives are folded to plain fives and counted as `aka_count` only at the engine boundary. Events
  recorded before this change carry `aka: number` instead; replay still works (points come from the
  persisted engine result) but such hands render without red-five marks.
- `RoomRules` fields and their consumers are documented in `packages/core/src/types/rules.ts`.
- Win input has two shapes: `manual` (han/fu) and `hand` (tiles; evaluated server-side; the hand is kept
  in `WinRecord.hand` for history display; also the input shape for the future photo-recognition feature).
- Room phases: `lobby` → `playing` → `finished` (→ `lobby` via `toLobby`), plus `closed` after `dissolve`
  (any phase; `rooms.closed_at` short-circuits replay; WS close code 4010).
- Players: `device` (has a token, joins from a phone) or `local` (no token, created and seated by the console
  via `sitLocal`, auto-ready; anyone may leave/ready a local seat). Everyone in a room is an admin.
