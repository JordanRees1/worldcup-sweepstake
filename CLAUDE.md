# Sweepstake — World Cup 2026 Sweepstake Monitor

A mobile-first **local** web app to track a FIFA World Cup 2026 sweepstake: who owns
which national teams, which teams are still alive as the tournament progresses, a
player leaderboard, and a tournament bracket view.

> **Status: Planning / pre-scaffold.** Architecture and work packages are defined in
> `docs/`. Application code does not exist yet. Start at `docs/IMPLEMENTATION_PLAN.md`.

## Stack (decided)
- **Frontend:** React + Vite + TypeScript. Mobile-first, targeting iPhone 12–17 viewport ratios.
- **Backend:** Node + TypeScript (Express). Thin server that hides the football-API key,
  proxies + caches it, and computes team status / leaderboard. Required because a browser
  cannot safely hold an API key or bypass CORS.
- **Shared:** a `shared/` workspace holding domain types + the REST contract — the single
  source of truth imported by both `web/` and `server/`.
- **Data:** `datasets/*.csv` define the canonical tournament **structure**; the live API
  overlays **results**.
- **Tooling:** npm workspaces, ESLint + Prettier, Vitest.

## Commands (exist only after WP0 scaffolding)
- `npm install` — install all workspaces
- `npm run dev` — run API + web together (Vite proxies `/api` → backend)
- `npm run build` · `npm run lint` · `npm run test`

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
- TypeScript `strict` everywhere. Domain types live **only** in `shared/` — never redefine
  them in `web/` or `server/`.
- Engine logic (standings, team status, scoring) = **pure, unit-tested functions**.
- The live API is always behind the `ResultsProvider` interface. The app **must** run with
  `DATA_SOURCE=seed` (no key, before kickoff) and degrade gracefully if the API is down.
- **Never commit secrets.** The API key lives in `server/.env` (gitignored);
  `server/.env.example` documents required vars.
- Reference files as `path:line`. Keep components small and mobile-legible.

## Open decisions (need the user)
1. Which football API + obtain an API key (recommended: **football-data.org**).
2. Sweepstake **scoring rules** (a sensible default is proposed in the plan).
3. Sign-off on the **picks mapping report** (generated in WP1).

## Docs
- `docs/IMPLEMENTATION_PLAN.md` — work packages, sequencing, acceptance criteria, how we work
- `docs/ARCHITECTURE.md` — structure, data flow, ResultsProvider, REST API contract, env/config
- `docs/DATA_AND_RULES.md` — dataset docs, canonical data model, normalization, 2026 rules
