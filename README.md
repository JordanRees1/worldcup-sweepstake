# Sweepstake — World Cup 2026 Sweepstake Monitor

A mobile-first **local** web app to track a FIFA World Cup 2026 sweepstake: each player's
teams, which of them are still alive as the tournament unfolds, a leaderboard, and a
tournament bracket.

> **Status: scaffolding.** Planning is complete (see [`docs/`](./docs)). The app workspaces
> (`shared/`, `server/`, `web/`) are being set up next — see
> [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md), work package **WP0**.

## Prerequisites
- **Node 22** — pinned via [`.nvmrc`](./.nvmrc); with nvm installed, run `nvm use`
- **npm 10+** (ships with Node 22)

## Getting started
> These commands exist once WP0 scaffolding lands.

```bash
npm install        # install all workspaces
npm run dev        # web on http://localhost:5173, API on http://localhost:8787
```

By default the app runs in offline **seed** mode (`DATA_SOURCE=seed`) — no football-API key
is needed before kickoff. To use live results later, copy `server/.env.example` →
`server/.env` and add a key (see the architecture doc).

## Project layout
| Path         | What it is                                                        |
|--------------|-------------------------------------------------------------------|
| `datasets/`  | Canonical CSVs — the tournament **structure** (teams, fixtures…)   |
| `shared/`    | Domain types + REST contract (after WP0)                          |
| `server/`    | Thin Express API: hides the API key, computes status/leaderboard  |
| `web/`       | React + Vite mobile app (after WP0)                               |
| `docs/`      | Plan, architecture, data & rules                                  |
| `CLAUDE.md`  | Conventions for contributors and AI agents                        |

## Docs
- [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) — work packages & sequencing
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — structure, data flow, REST contract
- [`docs/DATA_AND_RULES.md`](./docs/DATA_AND_RULES.md) — datasets, normalization, 2026 rules
