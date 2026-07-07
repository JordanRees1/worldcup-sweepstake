# Sweepstake — World Cup 2026 Sweepstake Monitor

A mobile-first web app to track FIFA World Cup 2026 sweepstakes: who owns which national teams,
which teams are still alive as the tournament progresses, a player leaderboard, and a tournament
bracket view. One server hosts **many** sweepstakes by short code (`/s/<code>`), with self-service
creation; it also runs fully locally.

> **Status: shipped + live.** WP0–WP8 plus a **multi-tenant gateway** (one server hosts many
> sweepstakes by code at `/s/<code>`; self-service create `/new`, manage `/s/:code/manage`, admin
> `/a/admin`; Azure Blob tenant store) are complete and deployed to Azure at **sstake.co.uk**.
> `npm install && npm run dev` starts the gateway (`:8787`) + web (`:5173`); baked sweepstakes are at
> `/s/crackers` and `/s/aa26`. Demo scenarios: `npm run dev:group-stage / dev:quarters / dev:final /
> dev:live-demo`. Multi-tenant design in `docs/MULTI_TENANT_PLAN.md`; deploy in `docs/DEPLOYMENT.md`;
> day-to-day dev in `docs/DEVELOPMENT.md`.

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

## Project structure
- `shared/` — domain types (`src/types.ts`) + REST contract (`src/contract.ts`). **Source of truth.**
- `server/` — Express **multi-tenant gateway**: data pipeline (`src/data/`, incl. `tenantStore.ts`),
  engine (`src/engine/`), providers (`src/providers/`), services (`src/services/`, incl. `appState.ts`
  `createGateway`, `sweepstakeCreate.ts`, `metrics.ts`), the `sweepstake:create` CLI (`src/scripts/`),
  and all REST routes (`src/routes/`). Run live with `DATA_SOURCE=live` in `server/.env`.
- `web/` — Vite + React + Tailwind app: players/groups/bracket/schedule per tenant, plus `/new`
  (create), `/s/:code/manage` (edit), `/a/admin` (admin). Run live against real API; `VITE_MOCKS=on`
  for offline dev.
- `datasets/` — shared tournament CSVs (teams, matches, venues, stages, scenarios). **Baked**
  sweepstakes live in `datasets/sweepstakes/<slug>/` (`player_picks.csv` + `sweepstake.json` with a
  `code`), resolved by `resolveSweepstakeByCode` in `server/src/data/sweepstake.ts`. **Runtime**
  sweepstakes live in the `TenantStore` (Azure Blob in prod; `datasets/tenants/` locally, gitignored).
  Validation derives pick rules from `teamsPerPlayer`; only tournament cardinalities are fixed. The
  `SWEEPSTAKE` env is legacy (the gateway hosts all tenants by code).

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
- **Never commit secrets.** `FOOTBALL_API_KEY`, `CREATE_TOKEN`, and `ADMIN_TOKEN` live in
  `server/.env` (gitignored) locally and as Azure Container App secrets in prod;
  `server/.env.example` documents required vars. The Blob tenant store needs no secret (managed
  identity). Per-sweepstake owner tokens are stored only as SHA-256 hashes.
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
- **Knockout bracket** wiring (which winners meet) follows FIFA regs §12.6–12.9. The R16 `W##`
  labels + match #100 (`W95 vs W96`) were corrected 2026-07 to match the official bracket after
  the R16 pairings came out wrong vs reality; R32 fixtures/Annexe C were already correct.

## Conventions
- Reference files as `path:line`. Keep components small and mobile-legible.
- Pure functions for engine/scoring; co-locate `*.test.ts` and keep them deterministic.

## Open decisions / pending input
1. **API key** — provider chosen (**football-data.org**); user creates a free account + key
   when ready. App runs in `seed` mode until then.
2. **Scoring** — ✅ **pure game points**: win +3, group draw +1, loss −goal-margin, a −50
   🥄 wooden spoon for losing every game, and a +100 🏆 champion bonus for owning the World Cup
   winner (guarantees that player wins the sweepstake outright). Sort: points → GD → alive →
   stage. Config in `server/src/engine/scoring.ts` (`DEFAULT_SCORING`). See DATA_AND_RULES §5.
3. **Picks mapping report** — generated in WP1 for user sign-off.

## Docs
- `docs/MULTI_TENANT_PLAN.md` — the multi-tenant gateway design, phases, and decisions
- `docs/ARCHITECTURE.md` — structure, data flow, ResultsProvider, gateway, REST API contract, env/config
- `docs/DEPLOYMENT.md` — local → container → Azure (the live multi-tenant gateway)
- `docs/DATA_AND_RULES.md` — dataset docs, canonical data model, normalization, 2026 rules
- `docs/DEVELOPMENT.md` — everyday commands, the resolved stack, and recipes for adding features
- `docs/IMPLEMENTATION_PLAN.md` — original work packages, sequencing, acceptance criteria
