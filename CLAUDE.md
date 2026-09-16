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
- CI/CD: `.github/workflows/cicd.yml` runs the gates above (plus e2e) on every push/PR; pushes to `main`
  deploy the web build to COS (`ci/deploy-web-to-cos.sh`, global-acceleration endpoint; then
  `ci/verify-web-deploy.sh` checks every `dist` file is really served — size and `.wasm` type
  — so a half-finished upload fails the run) and the server image to CCR + the bitego server
  over SSH (`ci/deploy-server.sh`). Rollback = re-run the workflow on an older commit. See README 部署.

## Architecture

Yarn workspaces monorepo:

- `packages/core` — pure TypeScript domain: types, rules + presets, scoring, round progression, final
  settlement, reducer (`reduceRoom(state, event)` is a pure function), reference tables (番符表 data with
  example hands in MPSZ notation), description formatting, client/server protocol types. No DOM, no wasm.
  Shared by server (authority) and web (pre-confirm preview).
- `apps/server` — Hono + `@hono/node-ws` + `node:sqlite` + `riichi-rs-node` (hand → han/fu/yaku, server
  only). Rooms are event-sourced: commands carry the client's `baseSeq` and are rejected as `stale` when it
  lags, except for the commands listed in `TOLERATES_STALE` (seat commands, `start`, `dissolve` —
  feasibility is decided from the current snapshot alone, so a broadcast still in flight must not
  swallow a tap); they are then validated (`validateCommand`), enriched by actor
  (`registry.enrich`: seat identity, local-player ownership, engine evaluation), reduced, appended to
  `room_events`, and the resulting `present` state is broadcast. Undo/redo stacks live in memory and are
  rebuilt by replay. Transient UI intents (mirroring a phone's dialog on the TV) live in memory only.
  SQLite schema is versioned (`db/index.ts` `MIGRATIONS`, applied by `user_version`). User files go through
  `storage/ObjectStore`: local disk (served at `/api/objects/*`) or Tencent COS (`QCLOUD_*` env, `riichi/`
  prefix, see `.env.template`). Serves the built web app with SPA fallback.
- `apps/web` — Vite + React 19 + Tailwind v4 + radix primitives. Routes: `/` landing (device routing:
  desktop → `/console`, tablet chooses, phone gets QR scan + six-cell code input), `/console` (TV: two
  columns ≥ 1280px, otherwise single column with history drawer + QR dialog), `/r/:code` (phone).
  Phone settlement dialogs mirror to the TV as a full-screen modal (`features/mirror/SettlementMirror`),
  carrying the hand only once the engine has evaluated it. Tile images are flat SVGs from mahjong_graphic (`src/assets/tiles`, see NOTICE.md), rendered by
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
- `RoomRules` fields and their consumers are documented in `packages/core/src/types/rules.ts`. Built-in
  presets live in `packages/core/src/rules/presets.ts` (M-League default, Majsoul ranked, Tenhou Houou,
  Saikouisen, WRC); differences the model cannot express are stated in each preset's `note`. Rooms store
  only the rules; the preset name shown in lobbies is derived by exact match (`findPreset`, canonical key =
  `validateRules` output), otherwise 自定义. Personal presets only take part in the editor's select.
- Win input has two shapes: `manual` (han/fu) and `hand` (tiles; evaluated server-side; the hand is kept
  in `WinRecord.hand` for history display; also the input shape for the future photo-recognition feature).
- Room phases: `lobby` → `playing` → `finished` (→ `lobby` via `toLobby`), plus `closed` after `dissolve`
  (any phase; `rooms.closed_at` short-circuits replay; WS close code 4010).
- Players: `device` (has a token, joins from a phone) or `local` (no token, created and seated by the console
  via `sitLocal`, auto-ready; anyone may leave/ready a local seat). Everyone in a room is an admin.
- Presence: `RoomView.online[seat]` = the seat's device player has a live WebSocket in the room (locals are
  always online). Anyone may vacate an _offline_ device player's seat (`leave`), never ready it — this is how
  a phone that lost its token reclaims its old seat. Keepalive constants live in core `WS_KEEPALIVE`: client
  pings every 5 s and reconnects after 8 s of silence; the server drops a connection idle for 20 s.
- Auto-start: when the lobby is full, everyone is ready, every device player is online and at least one
  device player is seated, the server starts a 3 s countdown (`RoomView.autoStartAt`) and commits `start` as
  the system actor; any change that breaks the condition cancels it. Four locals never auto-start.
- Deployed split-hosted: `WEB_DIST=` (empty) disables the SPA in the server image; app paths then 302 to
  the first `CORS_ORIGINS` entry.
- Photo recognition: a YOLO11n detector over 38 classes (`1m..9m,0m,1p..9p,0p,1s..9s,0s,1z..7z,back`).
  The class list (index = class id) and the currently published model live in
  `packages/core/src/recognition/manifest.json` (`model: null` hides the phone entry point). `ml/` is the
  Python/uv training workbench (public datasets + synthetic scenes from `sprites.py`/`synth.py` → train →
  export ONNX with embedded class-agnostic NMS, `[1,300,6]` output → `ci/upload-model.sh` verifies the
  class order against the manifest, uploads to `riichi/models/<uuid>.onnx` and writes `model` back).
  Phone flow (`apps/web/src/features/recognition`): `CameraSheet` opens a full-screen viewfinder
  (`camera/`); each video frame is cropped to the band (`band.ts`, pure geometry) and transferred to a
  Web Worker (`worker/detector.worker.ts`) that runs onnxruntime-web (single-thread WASM) +
  `decodeNmsOutput` + `layoutHand`. **Bytes are downloaded on the main thread** (`worker/bytes.ts`) and
  handed to the worker — the wasm blob is cloned, not transferred, because it is the retry cache;
  `prefetchDetector` warms the download when the phone joins a room but builds no session, and the worker
  lives only while the sheet is open. `autoCapture.ts` is the shutter gate: three consecutive frames with
  the same `closed + winTile + melds` and no `blocking` warning → the worker encodes **that same frame**
  as JPEG (`grab`) so photo and detections stay aligned → `POST /api/recognitions` + `PATCH` the result →
  `applyRecognized` fills the `ValueDraft`, `ValuePicker` auto-evaluates → after the win command is
  accepted the final hand is `PATCH`ed back as `corrected` (training truth). Warnings are two-tier
  (`severity` set at the emission site, not looked up by code): `blocking` shows in red and forces the
  keyboard open, `info` is only shown in label mode. `layoutHand` also returns `provenance` (which
  detection each tile came from, plus `usedDetections`) — the UI degrades it into "which tiles to
  double-check" at the `applyRecognized` boundary, and the reflow pipeline uses it to relabel boxes.
  Settlement shows `HandConfirm` (read-only strip + flag chips + tap-to-replace) when the result is
  self-consistent, `TileKeyboard` otherwise (`settlement/hand/HandEditor.tsx`). Inference runs only on the
  phone (a server engine was considered and dropped: phone WASM is fast enough); WebGPU is deliberately
  not used (iOS "Chrome" is WKWebView, and ORT's WebGPU path crashes after ~500 inferences on iOS Safari).
  `getUserMedia` needs a secure context: `yarn dev` serves HTTPS via `vite-plugin-mkcert`, and the dev
  machine gets TLS from `docker-compose.dev.yml` (caddy, `:8443`, certs not in the repo).
  Layout convention (photo): closed tiles contiguous with the **win tile turned
  sideways** at either end (3n+2 tiles); melds are groups of 3/4 that contain a sideways tile (kan may
  have two: the added tile is stacked sideways on top; back-X-X-back = closed kan) and may sit
  right/below/above, usually with no gap between groups — `layoutHand` splits a contiguous run by meld
  legality; rows above the hand with no sideways tile and no back are indicators (top row = dora, the
  row nearer the hand = ura; ura present ⇒ riichi auto-checked). `layoutHand` never throws and is bounded
  (memoized partition; adversarial 300-box inputs stay under a few ms); it returns warnings the editor
  shows. `e2e/recognize.spec.ts` swaps the CDN model for `e2e/fixtures/detector.onnx`
  (`ml/scripts/e2e_detector.py`, a single `Constant` node) so the real camera → ORT → layout → gate →
  grab → evaluate → PATCH chain runs. No video fixture is needed: the detector ignores its input, so
  Chromium's built-in test pattern (`--use-fake-device-for-media-stream`) is enough, and because the
  output is constant the gate always fires on the third frame — the "frames disagree, reset" branch is
  covered by `camera/autoCapture.test.ts` instead.
- Riichi music: `RoomView.music` (`{track, seat, at}`) is memory-only room state like `online`; a client
  sends `{type:"music", track: id | null}` (the section lives in the shared `ControlPanel`, so the console
  can press it for local players with `seat: null`), the TV plays the track from the static bucket
  (`features/music/url.ts`) and shows a float badge; the name is derived from the seat snapshot. The
  server clears it after any command in `STOPS_MUSIC` (settlement, adjust, redo, endGame/newGame/toLobby/
  start/dissolve); settlement buttons also send `track: null` on click while playing. Catalog =
  `packages/core/src/music/manifest.json` (lowercase uuid object names; upload with `ci/upload-music.sh`).
  Phone keeps `riichi.music.prefs` in localStorage (last pick, per-track use counts drive the order).
