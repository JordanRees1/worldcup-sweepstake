# Sweepstake — World Cup 2026 Sweepstake Monitor

A mobile-first **local** web app to track a FIFA World Cup 2026 sweepstake: each player's
teams, which of them are still alive as the tournament unfolds, a leaderboard, and a
tournament bracket.

> **Status: WP0 complete.** The workspaces are scaffolded and the app runs. The player
> table, leaderboard and bracket are built in later work packages — see
> [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md).

## Prerequisites
- **Node 22** — pinned via [`.nvmrc`](./.nvmrc); with nvm installed, run `nvm use`
- **npm 10+** (ships with Node 22)

## Getting started
```bash
npm install        # install all workspaces
npm run dev        # web on http://localhost:5173, API on http://localhost:8787
```
Open http://localhost:5173 on a phone-sized viewport. The app runs in offline **seed** mode
(`DATA_SOURCE=seed`) by default — no football-API key is needed before kickoff. To use live
results later, copy `server/.env.example` → `server/.env` and add a key.

## Useful commands
| Command | What it does |
|---------|--------------|
| `npm run dev` | API + web together (Vite proxies `/api` → server) |
| `npm run build` | Typecheck all workspaces + production web build |
| `npm run lint` | ESLint across the repo |
| `npm run test` | Vitest |
| `npm run format` | Prettier write |

## Project layout
| Path         | What it is                                                        |
|--------------|-------------------------------------------------------------------|
| `datasets/`  | Canonical CSVs — the tournament **structure** (teams, fixtures…)   |
| `shared/`    | `@sweepstake/shared`: domain types + REST contract                |
| `server/`    | Thin Express API: hides the API key, computes status/leaderboard  |
| `web/`       | React + Vite + Tailwind mobile app                                |
| `docs/`      | Plan, architecture, data & rules, development guide               |
| `CLAUDE.md`  | Conventions for contributors and AI agents                        |

## Docs
- [`docs/IMPLEMENTATION_PLAN.md`](./docs/IMPLEMENTATION_PLAN.md) — work packages & sequencing
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — structure, data flow, REST contract
- [`docs/DATA_AND_RULES.md`](./docs/DATA_AND_RULES.md) — datasets, normalization, 2026 rules
- [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) — everyday dev workflow and feature recipes
