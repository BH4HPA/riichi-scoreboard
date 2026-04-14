# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Riichi Mahjong (日本麻将) scoreboard — a single-page React app for tracking scores during a game. The UI is entirely in Chinese. State is persisted to localStorage.

## Commands

- **Dev server:** `yarn dev`
- **Build:** `yarn build` (runs `tsc -b && vite build`)
- **Lint:** `yarn lint`
- **No test framework is configured.**

Package manager is **yarn** (Classic v1).

## Architecture

Almost all application logic lives in a single file: `src/App.tsx` (~2700 lines). It contains:

- **Type definitions:** `SettlementType` (tsumo/ron/draw), `HistoryEntry`, `CoreSnapshot`, `GameState`
- **Undo/redo state management:** `GameState` uses a `{ past, present, future }` snapshot pattern stored in component state, persisted to localStorage under key `riichi-scoreboard-state-v1`
- **Score calculation logic:** point transfers for tsumo, ron, and draws according to riichi mahjong rules
- **All UI components:** score display, settlement dialogs, history table, etc.

### UI Layer

- **shadcn/ui** (new-york style, non-RSC) — components live in `src/components/ui/`
- **Tailwind CSS v3** for styling, no CSS variables (raw utility classes)
- **lucide-react** for icons
- **Path alias:** `@/` resolves to `src/`

### Domain Concepts

- Four players seated as 東(East)/南(South)/西(West)/北(North) wind
- `kyokuIndex` (0–7) tracks the current round (東1–4, 南1–4; 8 = game over)
- `kyotaku` = riichi sticks on the table; `honba` = repeat counter
- `dealerIndex` (0–3) = which seat is dealer this round
