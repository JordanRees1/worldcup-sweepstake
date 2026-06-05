# Sweepstake — World Cup 2026 Sweepstake Monitor

A mobile-first **local** web app to track a FIFA World Cup 2026 sweepstake: who owns
which national teams, which teams are still alive as the tournament progresses, a
player leaderboard, and a tournament bracket view.

> **Status: WP0–WP7 complete + user-testing fixes (UF1–UF4, UP5).** `npm install && npm run dev` starts the
> API (`:8787`) and web (`:5173`) together. Use `npm run dev:group-stage / dev:quarters / dev:final`
> for demo scenarios. Remaining: WP8 polish (README ✅, edge cases, a11y). Plan in
> `docs/IMPLEMENTATION_PLAN.md`; day-to-day dev in `docs/DEVELOPMENT.md`.

## Stack (decided)
- **Frontend:** React + Vite + TypeScript + **Tailwind v4**. Mobile-first, iPhone 12–17 ratios.
- **Backend:** Node + TypeScript (Express). Thin server that hides the football-API key,
  proxies + caches it, and computes team status / leaderboard.
- **Shared:** `shared/` (`@sweepstake/shared`) holds domain types + the REST contract — the
  single source of truth imported by both `web/` and `server/`.
- **Data:** `datasets/*.csv` define the canonical tournament **structure**; the live API
  overlays **results**.
- **Tooling:** npm workspaces, ESLint (flat config) + Prettier, Vitest.

## Commands
- `npm install` — install all workspaces
- `npm run dev` — run API + web together (Vite proxies `/api` → backend); web at http://localhost:5173
- `npm run dev:server` / `npm run dev:web` — run one side only
- `npm run build` · `npm run lint` · `npm run test` — all green as of WP0

## Project structure (post-WP0)
- `shared/` — domain types (`src/types.ts`) + REST contract (`src/contract.ts`). **Source of truth.**
- `server/` — Express API. **Complete: data pipeline (`src/data/`), engine (`src/engine/`),
  providers (`src/providers/`), services (`src/services/`), and all REST routes (`src/routes/`).**
  Run live with `DATA_SOURCE=live` in `server/.env`.
- `web/` — Vite + React + Tailwind app. **Complete: WP5 shell, WP6 player/groups views,
  WP7 bracket.** Run live against real API; `VITE_MOCKS=on` for offline dev.
- `datasets/` — canonical CSVs (unchanged).

## Working in this repo (for agents)
- **ESM everywhere**, Node 22, TypeScript `strict`. Do not introduce CommonJS.
- `@sweepstake/shared` is consumed as **TypeScript source** (its `exports` points at
  `src/index.ts`; `web/vite.config.ts` aliases it). Add shared types/contract there and import
  via `@sweepstake/shared` — never relative-path across workspaces, never redefine types.
- **Tailwind v4 is CSS-first:** utilities come from `@import 'tailwindcss'` in
  `web/src/index.css` + the `@tailwindcss/vite` plugin. There is **no `tailwind.config.js`**.
- Engine logic (standings, team status, scoring) = **pure, unit-tested functions** in
  `server/src/engine`.
- The live API is always behind the `ResultsProvider` interface. The app **must** run with
  `DATA_SOURCE=seed` (no key, before kickoff) and degrade gracefully if the API is down.
- **Never commit secrets.** The API key lives in `server/.env` (gitignored);
  `server/.env.example` documents required vars.
- Dev note: on a cold `npm run dev`, Vite can be ready a beat before the API, so the first
  proxied `/api` request may 502 for ~1s. Expected — WP5 adds React Query retries.

## Key domain facts (full detail in docs/DATA_AND_RULES.md)
- 48 teams, 12 groups **A–L**; **104 matches** (72 group + 32 knockout). Top 2 of each
  group + the 8 best third-placed teams → Round of 32.
- Knockout fixtures in `matches.csv` use **label encodings**, not team IDs:
  positional (`1C vs 2F`, `1E vs 3ABCDF`) and reference (`W73 vs W75`, `RU101 vs RU102`).
- `teams.csv` has **6 placeholder slots** (UEFA playoff winners A–D, FIFA playoff winners 1–2).
- `player_picks.csv` is **messy** and must be normalized: typos (`Sengal`, `Uzbekisan`),
  name variants (`Ivory Coast` → `Côte d'Ivoire`), and playoff-contingent picks
  (`Wales`, `Sweden`, `Turkiye`, `Czechia`, `Bosnia`, `Iraq`, `DR Congo`).
- **Known data bug:** match #100 label `W95 vs W100` should be `W95 vs W96`.

## Conventions
- Reference files as `path:line`. Keep components small and mobile-legible.
- Pure functions for engine/scoring; co-locate `*.test.ts` and keep them deterministic.

## Open decisions / pending input
1. **API key** — provider chosen (**football-data.org**); user creates a free account + key
   when ready. App runs in `seed` mode until then.
2. **Scoring** — default accepted (alive → furthest stage → points); confirm exact rule if
   the sweepstake differs.
3. **Picks mapping report** — generated in WP1 for user sign-off.

## Docs
- `docs/IMPLEMENTATION_PLAN.md` — work packages, sequencing, acceptance criteria, how we work
- `docs/ARCHITECTURE.md` — structure, data flow, ResultsProvider, REST API contract, env/config
- `docs/DATA_AND_RULES.md` — dataset docs, canonical data model, normalization, 2026 rules
- `docs/DEVELOPMENT.md` — everyday commands, the resolved stack, and recipes for adding features
