# CLAUDE.md

Guidance for Claude Code when working in this repository.

## Project Overview

Riichi Mahjong (日本麻将) scoreboard, v2: a TV "console" page shows a room QR code, phones join and
remote-control the scoreboard, all clients stay in sync through a single Node server. The console can also
seat "local players" (no phone needed) and dissolve a room at any time. UI is entirely in Chinese. Room
rules (村规) are configurable per room; the built-in preset is M-League. Two room kinds: four-player riichi
(`yonma`) and the two-player rules from Fukumoto's manga 《天》 (`ten`, see Domain Concepts).

## Commands

Package manager is **Yarn 4** (via corepack). Node >= 22.13 (node:sqlite); use 24 locally (`.nvmrc`).

- `yarn dev` — starts server (`:8787`) and web (`:5173`, Vite proxies `/api` and `/ws` to the server) together
- `yarn build` — builds server (`apps/server/dist`) and web (`apps/web/dist`)
- `yarn test` — Vitest across `packages/core`, `apps/server`, `apps/web` (pure-function tests only)
- `yarn typecheck` / `yarn lint` / `yarn format:check`
- `yarn e2e` — Playwright (builds web, starts server on :8799): `smoke.spec.ts` (TV + phones + local players +
  dissolve), `landing.spec.ts` (device routing, room-kind picker), `ten.spec.ts` (two-player room end to end),
  `recognize.spec.ts` (camera → detector → evaluate → PATCH, in both room kinds and `/calc`). `SHOTS_DIR=/tmp/x yarn e2e e2e/shots.spec.ts` dumps
  screenshots for visual review (skipped otherwise).
- `docker compose up -d --build` — single container (server + built web), data volume at `/data`
- CI/CD: `.github/workflows/cicd.yml` runs the gates above (plus e2e) on every push/PR; pushes to `main`
  deploy the web build to COS (`ci/deploy-web-to-cos.sh`, global-acceleration endpoint; then
  `ci/verify-web-deploy.sh` checks every `dist` file is really served — size and `.wasm` type
  — so a half-finished upload fails the run) and the server image to the container registry + the deploy server
  over SSH (`ci/deploy-server.sh`). Rollback = re-run the workflow on an older commit. See
  `docs/deployment.md` (README is the human-facing overview; `docs/development.md` has local HTTPS setup).
  The web job `needs` the server job: a new frontend may rely on new protocol fields, while an old
  frontend tolerates a new server.

## Architecture

Yarn workspaces monorepo:

- `packages/core` — pure TypeScript domain: types, rules + presets, scoring, round progression, final
  settlement, reducer (`reduceRoom(state, event)` is a pure function), reference tables (番符表 data with
  example hands in MPSZ notation), description formatting, client/server protocol (`protocol/`:
  `messages` wire types, `policy` server tables such as `TOLERATES_STALE`/`STOPS_MUSIC`/`WS_CLOSE`, `view`
  `RoomView` derivation, `uiIntent` mirror intents + validation, `rest` DTOs). `DomainError` lives in
  `types/errors.ts`. No DOM, no wasm. Shared by server (authority) and web (pre-confirm preview).
- `apps/server` — Hono + `@hono/node-ws` + `node:sqlite` + `riichi-rs-node` (hand → han/fu/yaku, server
  only). Rooms are event-sourced: commands carry the client's `baseSeq` and are rejected as `stale` when it
  lags, except for the commands listed in `TOLERATES_STALE` (seat commands, `start`, `dissolve`,
  `declareRiichi` —
  feasibility is decided from the current snapshot alone, so a broadcast still in flight must not
  swallow a tap); they are then validated (`validateCommand`), enriched by actor
  (`registry.enrich`: seat identity, local-player ownership, engine evaluation), reduced, appended to
  `room_events`, and the resulting `present` state is broadcast. Undo/redo stacks live in memory and are
  rebuilt by replay (bounded by core `UNDO_LIMIT`, so a burst of commands cannot grow memory quadratically);
  a replay that throws surfaces as `RoomCorrupt` (logged, `internal`) rather than "room not found"; an accepted undo/redo is followed by a `reverted` message to the whole room (who, and
  which entry per core `describeRevert`) that every client shows as a notice. Transient UI intents (mirroring a phone's dialog on the TV) live in memory only.
  SQLite schema is versioned (`db/index.ts` `MIGRATIONS`, applied by `user_version`). User files go through
  `storage/ObjectStore`: local disk (served at `/api/objects/*`) or Tencent COS (`QCLOUD_*` env, `riichi/`
  prefix, see `.env.template`). Abuse limits (`http/rateLimit.ts`, sliding windows): registration per IP
  (`TRUST_PROXY=1` reads `X-Forwarded-For` behind the CDN), room creation per device, photo uploads per player
  - global; the ws server's `maxPayload` equals the 16 KB application message cap. Serves the built web app
    with SPA fallback.
- `apps/web` — Vite + React 19 + Tailwind v4 + radix primitives. Routes: `/` landing (device routing:
  desktop and tablet pick a room kind — `features/console/RoomKindPicker`, one button per kind that reads
  「继续 … 房间码」 + 「新建」 while this device's last console room of that kind is still open
  (`useSavedConsoleRooms`, one saved code per kind in `consoleRooms.ts`), 「创建」 when it is known to be gone, and just the kind name while that cannot be confirmed (probing, offline, 5xx) — the label never promises the wrong thing; tablet can also join as a player; phone gets QR scan + six-cell code input, plus 「返回房间」 when the room in `riichi.room.last` still
  exists), `/console?kind=yonma|ten` (no param = yonma; the lobby has 「返回首页」 because the kind is picked on the
  landing page; TV: two
  columns ≥ 1280px with a draggable split — `features/console/split`, default scores 0.6, clamped by
  per-column minimum widths, remembered in `riichi.console.split` — otherwise single column with history
  drawer + QR dialog), `/r/:code` (phone), `/calc` (拍照算点数, see Photo recognition).
  Settlement dialogs live in `features/settlement/dialogs/` (one file per dialog over a shared
  `SettlementDialog` shell; `useDeclaredRiichi` merges riichi declarations that arrive while a dialog is open).
  Generic confirmation is `ui/confirm-dialog`. Phone dialogs mirror to the TV as a full-screen modal
  (`features/mirror/SettlementMirror`, intents sent via `features/mirror/useMirror`),
  carrying the hand only once the engine has evaluated it. Looking up the 番符表/rules on a phone stays on the phone
  unless its 「投到电视」 switch (`features/mirror/CastSwitch`, reset whenever the sheet closes) is on. Site credits (copyright, ICP record) live in
  `features/site/`: landing centers them at the page bottom, the narrow console lobby puts them in its button row, the narrow
  console game centers them at the page bottom under `SiteBrand`, the wide console pins them
  left-aligned at the bottom of its left column with `SiteBrand` right-aligned on the same row (lobby and game), `/calc` stacks `SiteBrand` over them at the page bottom; the phone game nav puts a row below its tabs, inside the bottom safe area (padding clamped to 6–18px): room code + connection badge on the left, `SiteTicker` on the right (ICP number ⇄ logo + site name every 10 s, pure CSS — two anti-phase layers, fade out then in; plain text, not a link; brand only when no ICP is configured). PWA = `public/manifest.json` + icons only, deliberately no Service Worker (the app is useless
  without its WebSocket, and caching index would pin stale versions); logo master in `docs/brand/`. Tile images are flat SVGs from mahjong_graphic (`src/assets/tiles`, see NOTICE.md), rendered by
  `features/hand/TileFace`.

Layering rule: entry files only assemble; data/state/render responsibilities are split into directories
named by role (see `features/*`). Server DTOs are passed through whole; conversion only at boundaries.
`localStorage` is touched only through `lib/localStore` (private mode and quota errors degrade to defaults).

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
  Tsumo/ron form state lives in `settlement/drafts` (memory only, keyed `roomCode:kind`, with a
  `generation` so late async writes cannot land in a newer draft): closing the dialog keeps it; the dialog
  closes itself with a notice when `draftStamp` (gameNo/kyoku/honba/status/history) changes under it, except
  while its own submit is in flight.
- Room kinds (`RoomKind`, `rooms.kind`, migration v7, default `yonma`): the kind is the room's identity — it
  fixes the seat count (`SEAT_COUNT`) and the game model — so it is a column, not a field of `RoomRules` (rules
  can be overwritten wholesale in the lobby). `RoomState` / `RoomView` are unions discriminated by `kind`
  (`YonmaRoomState` / `TenRoomState`, same for views); the room shell (seats, ready, phases, auto-start, local
  players, undo stack, music, mirror transport, dissolve) is shared and only iterates `room.seats`. `reduceRoom`
  dispatches game commands by kind; the two command sets reject each other with `not_here`. Web entry files
  branch on `room.kind === "ten"` (a missing kind from a rolled-back server falls to yonma) and fill
  `ConsoleGameShell` / `PhoneGameShell` with per-kind content (`features/ten/*` vs the yonma features).
- 《天》 two-player rooms (`packages/core/src/ten/`, `apps/web/src/features/ten/`): non-zero-sum (each side
  accumulates its own score, nothing is transferred), time-limited (60 min, `TEN_DURATION_MS`), each round has
  Stage A (race to tenpai) and Stage B (the defender names 2 tiles per turn; on a miss the attacker draws 5).
  Seats 0 = 东 (first dealer), 1 = 西; round wind is always 东. Commands: `tenDeclare {seat, riichi, entries}`
  (A → B; riichi spends one of the 10 sticks, never refunded, 0 left ⇒ tenpai declaration only; stale-tolerant
  with a history-length guard and idempotent — a repeat returns the same object so the registry persists
  nothing; only the seat's owner or a local seat, like `setReady`), `tenGuess {tiles:[a,b]}` (B only, two distinct base tiles, none guessed before — so a round has at most 17 turns; whether it hit is answered verbally, the app only records; the board is a convenience, not a required step: a result may be recorded with zero turns and the wording then drops the turn count), `tenDraw {reason:
noDeclare | guessed | exhausted}` (honba +1, dealer stays), `tenTsumo {value}` (B only; the winner is always
  the attacker, so the server takes the seat from the snapshot, never from the client; gain =
  `winPoints(…, tsumo).total` incl. honba; dealer win ⇒ honba +1, child win ⇒ dealer swaps, honba 0; a `hand`
  value must be tsumo and its riichi flag must equal the declaration). Declarations and guesses are ordinary undoable steps (no cancel command), so Stage B can occur more than once in a round: the draft stamp (`tenDraftStamp`) carries the declaration's identity (attacker + riichi) but not the guesses, and every dialog that records a round result — the tsumo form and the draw confirmations — closes itself when the stamp changes under it; `endGame` works in either stage, keeps `stage` in the snapshot (undo
  resumes Stage B) and leaves the unfinished round out of history. Hands are evaluated through
  `roomHandContext(room, seat)` — the only server entry for hand context: dealer = 东, child = 西
  (`handContextAt` would make seat 1 南). A ten room still carries a full `RoomRules` but only reads `scoring`
  and `hand` (`TEN_RULE_GROUPS` filters the editor); results are not written to `game_results` (personal stats
  are four-player zero-sum). Hidden clock: `TenRoomView.timeMark` 0–3 (≤10 min / ≤5 min / time up) is derived from `startedAt` at broadcast time — no countdown is sent or shown (anyone can read a watch, and `startedAt` is in the state; "hidden" means the app does not read out the clock); `registry.reconcileClock` arms one timer
  for the next mark (re-armed whenever the target changes: new game, end, undo of end; not in `get()`, not
  while nobody is connected) and only re-broadcasts, it never ends the game. Web: `TenDeclareSection` (「▶ 立直」
  also plays music via `RiichiMusicRow`, 「听牌宣言」), `GuessBoard` (all 34 tiles; earlier guesses dimmed +
  struck, the latest pair marked, the current pick selected; replaces the history column on the wide console
  during Stage B; who may pick is `stageB/canPick.ts`, the same rule as declaring: a device player's own phone only, anyone for a local player),
  `TenTsumoDialog` (same `ValuePicker` / camera chain as yonma with `riichiLock` from the declaration;
  recognitions keep `source: "room"`), `TenStageHint` (what to do in this stage, always on the TV),
  `TenGuide` (rule explainer pages from core `ten/guide.ts`; castable from the phone lobby and the in-game 规则
  sheet via the `tenGuide` intent — the console lobby mounts a mirror layer only for it), settlement mirror via
  the `tenSettlement` intent.
- Room phases: `lobby` → `playing` → `finished` (→ `lobby` via `toLobby`), plus `closed` after `dissolve`
  (any phase; `rooms.closed_at` short-circuits replay; WS close code 4010).
- Players: `device` (has a token, joins from a phone) or `local` (no token, created and seated by the console
  via `sitLocal`, auto-ready; anyone may leave/ready a local seat). Everyone in a room is an admin.
- Presence: `RoomView.online[seat]` = the seat's device player has a live WebSocket in the room (locals are
  always online). Anyone may vacate an _offline_ device player's seat (`leave`), never ready it — this is how
  a phone that lost its token reclaims its old seat. Keepalive constants live in core `WS_KEEPALIVE`: client
  pings every 5 s and reconnects after 8 s of silence; the server drops a connection idle for 20 s.
- Auto-start: when the lobby is full, everyone is ready, every device player is online and at least one
  device player is seated, the server starts a 3 s countdown (`RoomView.autoStartIn`, remaining ms) and commits `start` as
  the system actor; any change that breaks the condition cancels it. Four locals never auto-start.
  A `setRules` that actually changes the rules (canonical `rulesKey`) is enriched with `resetReady` and
  clears device players' ready (locals keep it); the flag lives only in new events, so replay of old
  rooms is unchanged.
- Deployed split-hosted: `WEB_DIST=` (empty) disables the SPA in the server image; app paths then 302 to
  the first `CORS_ORIGINS` entry.
- Photo recognition: a YOLO11n detector over 38 classes (`1m..9m,0m,1p..9p,0p,1s..9s,0s,1z..7z,back`).
  The class list (index = class id) and the currently published model live in
  `packages/core/src/recognition/manifest.json` (`model: null` hides the phone entry point). `ml/` is the
  Python/uv training workbench (public datasets + synthetic scenes from `sprites.py`/`synth.py` → train →
  export ONNX with embedded class-agnostic NMS, `[1,300,6]` output → `ci/upload-model.sh` verifies the
  class order against the manifest, uploads to `riichi/models/<uuid>.onnx` and writes `model` back).
  Phone flow (`apps/web/src/features/recognition`): `CameraSheet` opens a full-screen viewfinder
  (`camera/`) with **no framing box**: every video frame goes whole to a Web Worker
  (`worker/detector.worker.ts`, onnxruntime-web single-thread WASM + `decodeNmsOutput` + `layoutHand`), and the
  worker decides what to look at (`worker/runFrame.ts`, pure orchestration with an injected `detect`): detect the
  locked region (or the whole frame), and if tightening the crop to `layoutHand`'s `window` would still zoom
  in ≥ 1.2× (long edge, core `SETTLE_GAIN`), detect that region again in the same call — a portrait full frame
  squeezed into 640 leaves tiles ~23 px wide, enough to locate them (99.3 % on production photos) but not to
  classify them. A result is `settled` when no such zoom is left; only settled frames count. The region is
  tracked across frames (core `recognition/roi.ts` `nextTrack`: small moves keep the crop, two unusable frames
  in a row fall back to the whole frame), so steady state is one inference per frame. **Bytes are downloaded
  on the main thread** (`worker/bytes.ts`) and
  handed to the worker — the wasm blob is cloned, not transferred, because it is the retry cache;
  `prefetchDetector` warms the download when the phone joins a room but builds no session, and the worker
  lives only while the sheet is open. `autoCapture.ts` is the shutter gate: a sliding vote — the newest
  settled, non-`blocking` frame's `closed + winTile + melds` must equal the previous frame's and appear ≥ 3
  times in the last 5 frames (a single bad frame no longer resets the count; A-B-A-B-A never fires). The
  viewfinder shows the real tile total (red above 14) and, once the same `blocking` warning has held for
  3 frames, its message. On fire the worker takes the frame it last **finished** (`held` = source bitmap +
  detections + layout, swapped atomically), tightens the photo to the adopted tiles (`tightenCapture`:
  bbox + 0.35 tile, re-runs `layoutHand` on what is left and refuses if the hand changes — so the river never
  enters the photo and the record still aligns on export), encodes it as JPEG and returns photo, detections
  (in photo pixels) and result **together** (`grab`) → `POST /api/recognitions` + `PATCH` the result →
  `applyRecognized` fills the `ValueDraft`, `ValuePicker` auto-evaluates → after the win command is
  accepted the final hand is `PATCH`ed back as `corrected` (training truth). Warnings are two-tier
  (`severity` set at the emission site, not looked up by code): `blocking` shows in red and forces the
  keyboard open, `info` is not rendered anywhere and not persisted. `layoutHand` also returns `provenance` (which
  detection each tile came from, plus `usedDetections`) — the UI degrades it into "which tiles to
  double-check" at the `applyRecognized` boundary, and the reflow pipeline uses it to relabel boxes.
  The settlement's 拍照识别 button is enabled whenever a model is published: an unusable camera (no
  permission/device, busy, or no `mediaDevices` outside a secure context) is explained inside `CameraSheet`,
  which then disables the shutter and offers the album; a detector load failure offers 「返回键盘录入」.
  Settlement shows `HandConfirm` (read-only strip + flag chips + tap-to-replace) when the result is
  self-consistent, `TileKeyboard` otherwise (`settlement/hand/HandEditor.tsx`). Inference runs only on the
  phone (a server engine was considered and dropped: phone WASM is fast enough); WebGPU is deliberately
  not used: WASM already runs <300 ms/frame on an iPhone 15, iOS "Chrome" is WKWebView so it cannot use
  Chromium's implementation anyway, and ORT's WebGPU path has an open crash report on iOS Safari
  (microsoft/onnxruntime#27584) that a continuous viewfinder would hit within minutes.
  `getUserMedia` needs a secure context and `OffscreenCanvas` needs iOS 16.4+ (checked in the worker's
  `init` so it fails before `ready` instead of showing a silent black screen). One mkcert certificate in
  `ci/dev-tls/certs/` (gitignored) covers both: `yarn dev` picks it up automatically when present, and the
  dev machine gets TLS from `docker-compose.dev.yml` (caddy, `:8443`). The phone trusts the root CA once.
  `/calc` 拍照算点数 (linked from the landing page while a model is published) is the same viewfinder +
  `HandEditor` outside any room (`features/calc/`): the user sets round wind, seat wind (东 = dealer), honba,
  ron/tsumo and rules (`RulesEditor` in a dialog, presets included; rules remembered in `riichi.calc.rules`,
  the rest memory only). Phases: idle → review (`AnnotatedShot` + blocking warnings + editable hand, 「重新拍」)
  → 「识别正确」 → result (`POST /api/evaluate` with `{hand, rules, roundWind, seatWind}` — the server maps it
  to `dealer: 0, seat: seatWind` — plus core `winPoints` for payments incl. honba, recomputed whenever the
  context changes; 「返回修改」/「继续拍」). The viewfinder in `mode="calc"` adds `DetectionOverlay` (boxes
  labelled with the tile's own SVG, tap for class + confidence; room mode only outlines the adopted tiles
  and the locked region, `RoiOverlay`) and an album entry (the picked photo goes through the same two-pass
  path as a one-shot `"still"`: no tracked region, no upright assumption, re-sent if back-pressure drops it);
  the privacy line shows in both modes. 「识别正确」 PATCHes `corrected` via
  `confirmRecognized` (serialized per page, repeat confirmations overwrite). Its rows are stored with
  `source: "calc"` (`recognitions.source`, migration v5, query param on `POST`; default `room`; `label` is
  still accepted and marks rows from the retired developer labeling page — a different trust tier), and the
  export must keep the column so reflow can tell the three apart.
  Layout convention (photo): closed tiles contiguous with the **win tile turned
  sideways** at either end (3n+2 tiles); melds are groups of 3/4 that contain a sideways tile (kan may
  have two: the added tile is stacked sideways on top; back-X-X-back = closed kan) and may sit
  right/below/above, usually with no gap between groups — `layoutHand` splits a contiguous run by meld
  legality; rows above the hand with no sideways tile and no back are indicators (top row = dora, the
  row nearer the hand = ura; ura present ⇒ riichi auto-checked). Photos may contain the river and the wall:
  the hand is the group whose closed segment + nearby melds can make exactly 14 (then no further meld is
  taken — wall backs that flicker into a "closed kan" were the source of frame-to-frame jitter), melds and
  indicator rows are walked outward row by row within core `HAND_WINDOW` hops (4 tile heights, 2 between the
  two indicator rows; measured on production photos), anything else is `extra_rows`. With ura present the two
  indicator rows must be equally long: a longer far row is the river's last row and is dropped, any other
  mismatch is `indicator_mismatch` (`blocking`). Known limit: one dora + a one-tile river tail inside the
  window is indistinguishable — `LayoutGuide` tells users to keep indicators close and the river away.
  `layoutHand(…, {upright: true})` skips the "most boxes are wide ⇒ photo is rotated" vote (side-on walls are
  wide boxes); the live path passes it **only once the gyroscope or the user has set the orientation** —
  until then the vote stays as the safety net for people holding the phone sideways with rotation lock on.
  While the hand is short of 14 tiles the `window` opens up (full width, one extra hop per missing meld): the
  downscaled first pass often fragments the hand row, and a window hugging the fragment would never see the
  rest. `odd_box` (boxes much narrower than their neighbours) is judged per row, not against the whole photo.
  `recognition/__fixtures__/records.json` holds 50
  production records (boxes + confirmed hands, no photos) as the regression set for layout changes.
  `layoutHand` never throws
  and is bounded (memoized partition; adversarial 300-box inputs stay under a few ms); it returns warnings the editor
  shows. `e2e/recognize.spec.ts` swaps the CDN model for `e2e/fixtures/detector.onnx`
  (`ml/scripts/e2e_detector.py`, a single `Constant` node) so the real camera → ORT → layout → gate →
  grab → evaluate → PATCH chain runs. No video fixture is needed: the detector ignores its input, so
  Chromium's built-in test pattern (`--use-fake-device-for-media-stream`) is enough, and because the
  output is constant the gate always fires on the third frame and the whole frame is already `settled` — the
  vote window is covered by `camera/autoCapture.test.ts`, the second pass and tracking by
  `worker/runFrame.test.ts`, the rotation math by `camera/orientation/*.test.ts`.
  Landscape (`camera/orientation/`): `rotation` (0/90/270) = how far the chrome is turned relative to the
  page. The video and the boxes are not rotated (the screen itself is), only the close button / progress /
  bottom panel; the worker rotates the frame upright before detection, so photos and detections are always
  upright. Sources: a permanent manual button and the gyroscope (`tilt.ts`: gravity components from β/γ,
  more than 15° and more than 1.5× the other axis, otherwise keep the last verdict; minus `screen.orientation.angle` so a page
  that rotates by itself needs nothing) — the gyroscope only speaks when its verdict changes, so whichever
  happened last wins. Motion permission is asked on open (Android/desktop grant silently, iOS refuses outside
  a gesture) and again on the button tap (iOS prompts here). Last rotation is kept in `riichi.camera.rotation`.
  Session telemetry: closing the viewfinder posts one `RecognitionSessionSummary` (no photo) to
  `POST /api/recognition-sessions` (`recognition_sessions`, migration v6, 120/h per player + 1200/h global;
  `useSessionStats`, sent once on unmount or `pagehide` with `keepalive`) — frames, settled frames, second
  passes, per-code `blocking` counts, key changes, max votes, outcome (`auto`/`manual`/`album`/`abandoned`),
  rotation + source. Stored recognitions only ever show successful captures; this is where failures show up.
- Riichi music: `RoomView.music` (`{track, seat, at}`) is memory-only room state like `online`; a client
  sends `{type:"music", track: id | null}` (the section lives in the shared `settlement/controls/ControlButtons`, so the console
  can press it for local players with `seat: null`), the TV plays the track from the static bucket
  (`features/music/url.ts`) and shows a float badge; the name is derived from the seat snapshot. The
  server clears it after any command in `STOPS_MUSIC` (settlement, adjust, redo, endGame/newGame/toLobby/
  start/dissolve); settlement buttons also send `track: null` on click while playing. Catalog objects are named by lowercase uuid (upload with `ci/upload-music.sh`).
  Phone keeps `riichi.music.prefs` in localStorage (last pick, per-track use counts drive the order).
  The catalog is **not in the repo**: `ci/upload-music.sh <dir>` publishes `<VITE_STATIC_BASE_URL>/music/manifest.json`
  (`[{id, title}]`) next to the mp3s; the web fetches it once per page (`features/music/catalog.ts`, empty when
  the static base is unset), the server only checks the id format (`isTrackId`). Deployment-specific values
  (static base, site URL, author, ICP) are build-time `VITE_*` env (see `.env.template`); CI reads them from
  GitHub Actions variables.
- Riichi declaration: a seated phone's 「▶ 立直」 also commits `declareRiichi` (seat rules as `setReady`:
  own device seat or any local seat; stale-tolerant but carries the kyoku/honba/history count it was pressed
  on and is rejected when that no longer matches; idempotent — a no-op reduce is not persisted; rejected
  by `canRiichi` when points < 1000 and the rule forbids it — the button is disabled then). It sets `GameState.riichi[seat]` by replacing `present` without touching the undo stack; every
  settlement clears it (`adjust` only when kyoku/honba change), so undoing a settlement brings the
  declaration back with the snapshot. Settlement forms pre-check declared seats; points only move with the
  settlement's own `riichi` list. The console presses for local players with no seat, so it only plays music.
