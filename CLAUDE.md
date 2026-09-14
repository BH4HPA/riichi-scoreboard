# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

Riichi Mahjong (日本麻将) scoreboard, v2: a TV "console" page shows a room QR code, four phones join and
remote-control the scoreboard, all clients stay in sync through a single Node server. UI is entirely in
Chinese. Room rules (村规) are configurable per room; the built-in preset is M-League.

## Commands

Package manager is **Yarn 4** (via corepack). Node >= 22.13 (node:sqlite); use 24 locally (`.nvmrc`).

- `yarn dev` — starts server (`:8787`) and web (`:5173`, Vite proxies `/api` and `/ws` to the server) together
- `yarn build` — builds server (`apps/server/dist`) and web (`apps/web/dist`)
- `yarn test` — Vitest across `packages/core` and `apps/server`
- `yarn typecheck` / `yarn lint` / `yarn format:check`

## Architecture

Yarn workspaces monorepo:

- `packages/core` — pure TypeScript domain: types, rules + presets, scoring, round progression, final
  settlement, reducer (`reduce(state, event, rules)` is a pure function), reference tables (番符表),
  description formatting. No DOM, no wasm. Shared by server (authority) and web (pre-confirm preview).
- `apps/server` — Hono + `@hono/node-ws` + `node:sqlite` + `riichi-rs-node` (hand → han/fu/yaku, server
  only). Rooms are event-sourced: commands are validated against `baseSeq`, reduced, appended to
  `room_events`, and the resulting `present` state is broadcast. Undo/redo stacks live in memory and are
  rebuilt by replay. Transient UI intents (mirroring a phone's dialog on the TV) live in memory only.
  Serves the built web app with SPA fallback.
- `apps/web` — Vite + React 19 + Tailwind v4 + shadcn (generated on demand). Routes: `/` landing,
  `/console` (TV), `/r/:code` (phone).

Layering rule: entry files only assemble; data/state/render responsibilities are split into directories
named by role (see `features/*`). Server DTOs are passed through whole; conversion only at boundaries.

## Domain Concepts

- Four seats 東/南/西/北 (`Seat` 0–3); `dealerIndex` rotates; `kyokuIndex` 0–7 = 東1–南4 (extra rounds
  for 西入 when enabled); `kyotaku` = riichi sticks on table; `honba` = repeat counter.
- `RoomRules` fields and their consumers are documented in `packages/core/src/types/rules.ts`.
- Win input has two shapes: `manual` (han/fu) and `hand` (tiles; evaluated server-side, reserved for the
  future photo-recognition feature).
