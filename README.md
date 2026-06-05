# World Cup 2026 Sweepstake

A mobile-first local web app for tracking a 6-player FIFA World Cup 2026 sweepstake. Each player owns 8 national teams; the app shows who's still alive as the tournament unfolds, a live leaderboard, group standings, fixture schedule, and a knockout bracket.

Runs entirely on your laptop — no deployment, no accounts. Results come from **football-data.org** (live) or pre-built scenario files (demo/offline).

## Prerequisites

- **Node ≥22** (Node 22, 24, or 26 all work — pinned to 22 in `.nvmrc` but not enforced)
- **npm 10+** (ships with Node 22+)

## Getting started

```bash
npm install
npm run dev
```

Open **http://localhost:5173** — the app is designed for mobile (390×844); resize your browser or use DevTools device emulation.

The app starts in offline **seed mode** (`DATA_SOURCE=seed`) — no API key needed, all matches show as upcoming.

## Demo scenarios

To see the app at different tournament stages without a live API key:

```bash
npm run dev:group-stage   # Matchday 1+2 done — partial standings, everyone alive
npm run dev:quarters      # Groups + R32 + R16 done — 8 teams left in QFs
npm run dev:final         # SFs + 3rd-place done — Mexico vs Tunisia in the Final
```

## Multiple sweepstakes

You can run more than one sweepstake over the same tournament — e.g. a 6-player friends
game and a 24-player work game. Each lives in `datasets/sweepstakes/<name>/` with its own
`player_picks.csv` and a `sweepstake.json` (`{ "name": "...", "teamsPerPlayer": N }`). The
tournament structure (teams, fixtures, results) is shared across all of them.

```bash
npm run dev          # default: the "friends" sweepstake
npm run dev:work     # the "work" sweepstake
# any sweepstake by folder name:
#   PowerShell:  $env:SWEEPSTAKE="work"; npm run dev
#   macOS/Linux: SWEEPSTAKE=work npm run dev
```

To set up a new game: create `datasets/sweepstakes/<name>/`, add a `sweepstake.json` and a
`player_picks.csv`, then run `npm run report:picks:work` (or `SWEEPSTAKE=<name> npm run
report:picks -w @sweepstake/server`) to check every pick resolves. The draft model is
"every team owned exactly once", so `teamsPerPlayer × players = 48`.

## Live results

1. Create a free account at [football-data.org](https://www.football-data.org) and copy your API key
2. Copy the example env file and add your key:
   ```bash
   cp server/.env.example server/.env
   # then edit server/.env and set FOOTBALL_API_KEY=your_key_here
   ```
3. Set `DATA_SOURCE=live` in `server/.env`
4. `npm run dev`

The API is rate-limited to 10 calls/minute on the free tier; the server caches responses (default TTL 60s) and falls back to stale data if the API is temporarily unavailable.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API (`:8787`) + web (`:5173`) together (the `friends` sweepstake) |
| `npm run dev:work` | Same, for the `work` sweepstake |
| `npm run dev:group-stage` | Demo: matchday 1+2 complete |
| `npm run dev:quarters` | Demo: through Round of 16 |
| `npm run dev:final` | Demo: Mexico vs Tunisia final |
| `npm run build` | Typecheck all workspaces + production web build |
| `npm run test` | Vitest (86 tests) |
| `npm run lint` | ESLint |
| `npm run generate:scenarios` | Regenerate the demo scenario files |

## The sweepstake

6 players, 8 teams each:

| Player | Teams |
|---|---|
| Rogan | Scotland, Ecuador, Australia, Egypt, Colombia, Netherlands, South Africa, South Korea |
| Henri | Tunisia, Paraguay, Japan, Belgium, Switzerland, Germany, Norway, Argentina |
| Will | Côte d'Ivoire, Curaçao, Uruguay, Haiti, England, DR Congo, Uzbekistan, New Zealand |
| Dec | Senegal, Jordan, Sweden, Croatia†, Brazil, Türkiye, Cabo Verde, Algeria |
| Jordan | Portugal, Spain, Morocco, IR Iran, Mexico, Ghana, France, Czechia |
| James | Austria, Iraq, Saudi Arabia, Qatar, Canada, Panama, Bosnia and Herzegovina, USA |

† Dec originally picked Wales (did not qualify); Croatia swapped in as the unowned team.

## Project layout

| Path | What it is |
|---|---|
| `datasets/` | Shared tournament CSVs (teams, fixtures, venues) + `sweepstakes/<name>/` picks |
| `shared/` | `@sweepstake/shared`: domain types + REST contract (source of truth) |
| `server/` | Express API: data pipeline, engine, results provider, all routes |
| `web/` | React + Vite + Tailwind v4 mobile app |
| `docs/` | Architecture, data rules, development guide, agent handoff |

## Docs

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — data flow, REST contract, env config
- [`docs/DATA_AND_RULES.md`](./docs/DATA_AND_RULES.md) — datasets, normalization, 2026 tournament rules
- [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) — everyday commands and feature recipes
- [`CLAUDE.md`](./CLAUDE.md) — conventions for contributors and AI agents
