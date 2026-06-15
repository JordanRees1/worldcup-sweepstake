# World Cup 2026 Sweepstake

A mobile-first web app for running FIFA World Cup 2026 sweepstakes. Players each own a slice
of the 48 national teams; the app shows who's still alive as the tournament unfolds, a live
leaderboard, group standings, fixture schedule, and a knockout bracket.

It runs two ways from the same codebase:

- **Hosted, multi-tenant** — one server hosts **many** sweepstakes, each at its own short code
  (`sstake.co.uk/s/<code>`), with self-service creation. No accounts, no personal data —
  players are nicknames only.
- **Local** — `npm install && npm run dev` runs the whole thing on your laptop for development
  or offline demos.

Results come from **football-data.org** (live) or pre-built scenario files (demo/offline).

## Using a hosted sweepstake (no setup)

- **Open one:** `sstake.co.uk/s/<code>` — e.g. `/s/crackers` or `/s/aa26`. Bookmark it, add it
  to your home screen, or drop the link in the group chat. The code is never re-typed; the
  device remembers the sweepstakes you've opened.
- **Create one:** `sstake.co.uk/new` — add your players and the teams they drew, **or tick "Draw
  the teams for me"** to have them assigned: *50/50* (an even split of strong & weak sides — top 24
  / bottom 24), *Pots* (one team from each FIFA-ranking tier), or *Complete chaos* (fully random).
  You'll need the **create password** (ask the organiser). It's **one-time** — it expires the moment
  you create, so a draw is final and can't be re-rolled. On success you get a share link plus a
  one-time **owner token** to manage it later.
- **Manage one:** `sstake.co.uk/s/<code>/manage` — rename, edit the roster, or delete it, using
  the owner token you saved at creation (or the global admin token).

Every team across the 48-team field must be picked exactly once, so
`teamsPerPlayer × players = 48` (e.g. 6 players × 8 teams, or 24 players × 2 teams).

## Local development

### Prerequisites

- **Node ≥22** (Node 22, 24, or 26 all work — pinned to 22 in `.nvmrc` but not enforced)
- **npm 10+** (ships with Node 22+)

### Getting started

```bash
npm install
npm run dev
```

Open **http://localhost:5173** — the app is designed for mobile (390×844); resize your browser
or use DevTools device emulation. A responsive desktop layout kicks in at wider widths.

The app starts in offline **seed mode** (`DATA_SOURCE=seed`) — no API key needed, all matches
show as upcoming. The two committed sweepstakes are served at `/s/crackers` and `/s/aa26`; the
landing page (`/`) is the picker / "enter a code" / "create" screen.

### Demo scenarios

To see the app at different tournament stages without a live API key:

```bash
npm run dev:group-stage   # Matchday 1+2 done — partial standings, everyone alive
npm run dev:quarters      # Groups + R32 + R16 done — 8 teams left in QFs
npm run dev:final         # SFs + 3rd-place done — Mexico vs Tunisia in the Final
npm run dev:live-demo     # Some matches mid-play — exercises the LIVE badge + minute
```

### Live results

1. Create a free account at [football-data.org](https://www.football-data.org) and copy your API key
2. Copy the example env file and add your key:
   ```bash
   cp server/.env.example server/.env
   # then edit server/.env and set FOOTBALL_API_KEY=your_key_here
   ```
3. Set `DATA_SOURCE=live` in `server/.env`
4. `npm run dev`

The API is rate-limited (10 calls/min on the free tier; in-play scores need the "Free w/
Livescores" tier). The server fetches results **once** and caches them (default TTL 60s, 30s in
prod) — so N concurrent viewers and any number of sweepstakes still cost ≤2 upstream calls/min —
and falls back to stale data if the API is temporarily unavailable.

## Multi-tenant gateway

One server hosts many sweepstakes, each addressed by a short **code**:

- **Shared layer (computed once):** the tournament structure (teams, fixtures, venues) + live
  results → standings, team status, bracket. Identical for every sweepstake; cached.
- **Per-tenant layer (per code):** that sweepstake's players + picks → its own leaderboard.

Two kinds of sweepstake coexist:

- **Baked** — committed under `datasets/sweepstakes/<slug>/` (e.g. `crackers`, `aa26`). Shipped
  in the image, read-only at runtime.
- **Custom** — created at runtime (self-service or CLI) and stored in a `TenantStore`
  (**Azure Blob** in prod via managed identity; a local directory in dev).

### Permissions (no logins, three tokens)

- **Create password** — required to create a sweepstake. **One-time + rotating:** it expires on each
  create and a fresh one is generated server-side (visible only on `/a/admin` as "Current creation
  password"), so the code can't be shared and draws stay final. Seeded once from `CREATE_TOKEN`.
- **Owner token** — generated per sweepstake, shown once at creation; lets that creator
  edit/delete **only their** sweepstake.
- **Admin token** (`ADMIN_TOKEN`) — global: edit/delete any sweepstake and open the admin panel
  at `/a/admin` (sweepstake count, codes, player counts, best-effort usage).

All three are host-managed secrets — **never committed**. View codes grant read-only access.

### Create from a CSV (CLI)

```bash
npm run sweepstake:create -- --picks ./player_picks.csv --name "Dave's Mates" \
  --teams-per-player 8 [--code dave99] [--slug dave]
```

Reuses the same pick normalization and 48-team validation as the web flow, writes the tenant to
the store, and prints the share code + owner token. The CLI bypasses the create gate (run locally
by a trusted operator).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | API (`:8787`) + web (`:5173`) together (Vite proxies `/api` → API) |
| `npm run dev:server` / `dev:web` | Run one side only |
| `npm run dev:group-stage` | Demo: matchday 1+2 complete |
| `npm run dev:quarters` | Demo: through Round of 16 |
| `npm run dev:final` | Demo: Mexico vs Tunisia final |
| `npm run dev:live-demo` | Demo: some matches in play (LIVE badge) |
| `npm run sweepstake:create -- …` | Scaffold a sweepstake from a `player_picks.csv` |
| `npm run report:picks` | Check a baked sweepstake's picks all resolve |
| `npm run build` | Typecheck all workspaces + production web build |
| `npm run test` | Vitest (97 tests) |
| `npm run lint` | ESLint |
| `npm run generate:scenarios` | Regenerate the demo scenario files |

## Project layout

| Path | What it is |
|---|---|
| `datasets/` | Shared tournament CSVs (teams, fixtures, venues) + baked `sweepstakes/<slug>/` picks |
| `shared/` | `@sweepstake/shared`: domain types + REST contract (source of truth) |
| `server/` | Express gateway: data pipeline, engine, results provider, tenant store, all routes |
| `web/` | React + Vite + Tailwind v4 app (mobile-first, responsive desktop) |
| `docs/` | Architecture, data rules, development guide, deployment guide |

## Docs

- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — data flow, gateway, REST contract, env config
- [`docs/DATA_AND_RULES.md`](./docs/DATA_AND_RULES.md) — datasets, normalization, 2026 tournament rules
- [`docs/DEVELOPMENT.md`](./docs/DEVELOPMENT.md) — everyday commands and feature recipes
- [`docs/DEPLOYMENT.md`](./docs/DEPLOYMENT.md) — local → container → Azure (multi-tenant gateway)
- [`docs/MULTI_TENANT_PLAN.md`](./docs/MULTI_TENANT_PLAN.md) — the multi-tenant design + phases
- [`CLAUDE.md`](./CLAUDE.md) — conventions for contributors and AI agents
