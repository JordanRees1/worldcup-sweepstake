# Architecture

## 1. Overview

```
                ┌──────────────────────────────────────────────┐
   datasets/    │                  server/ (Node + TS)         │
   *.csv  ──────┼─▶ data loader ─▶ normalization ─┐            │
 (structure)    │                                 ▼            │
                │                              tournament      │      web/ (React+Vite)
  Football API ─┼─▶ ResultsProvider ─▶ results ▶ engine ─▶ REST ┼────▶ typed client ─▶ UI
  (results)     │   (seed | live)               (status,  /api │      (React Query)   (mobile)
                │                                 standings,    │
                └─────────────────────── leaderboard) ─────────┘
```

**Principle:** the CSVs are the source of truth for *structure* (teams, groups, all 104
fixtures, the bracket skeleton, venues, picks). The football API only provides *results*
(scores, statuses, and — once the knockouts begin — which teams fill each slot). The engine
joins the two and derives everything the UI needs.

## 2. Why a backend at all
The user chose a live API. A browser SPA must not call it directly because:
- the **API key would be exposed** in client code / network tab;
- football APIs commonly **block cross-origin** browser calls (CORS);
- we want **caching + rate-limit control** (free tiers are limited) in one place;
- we want a **stable, app-shaped contract** so the UI never has to know the vendor's schema.

The server is deliberately thin: load data → ask a `ResultsProvider` for results → run pure
engine functions → serve JSON. No database (in-memory + cache); state is the CSVs + API.

## 3. Folder structure (target)
```
sweepstake/
├─ CLAUDE.md
├─ package.json                # root: npm workspaces + dev/build/lint/test scripts
├─ tsconfig.base.json
├─ datasets/                   # canonical source CSVs (already present)
├─ docs/
├─ shared/                     # @sweepstake/shared
│  └─ src/
│     ├─ types.ts              # domain model (Team, Match, Standing, TeamStatus, …)
│     ├─ contract.ts           # REST request/response shapes + endpoint paths
│     └─ index.ts
├─ server/                     # @sweepstake/server  (Express + TS, tsx watch)
│  ├─ .env.example
│  └─ src/
│     ├─ index.ts              # app bootstrap, port 8787
│     ├─ data/                 # WP1: CSV loaders, normalization, validation, mapping report
│     ├─ engine/               # WP2: standings, third-place ranking, bracket resolve, status, scoring
│     ├─ providers/            # WP3: ResultsProvider — seedProvider, footballApiProvider, fixtureMatch
│     ├─ services/             # composition: build the “app state” the routes serve
│     └─ routes/               # WP4: REST endpoints
└─ web/                        # @sweepstake/web (Vite + React + TS, port 5173)
   └─ src/
      ├─ main.tsx, app/        # WP5: shell, routing, tab nav, theme tokens
      ├─ lib/api/              # WP5: typed fetch client + React Query hooks (imports shared/contract)
      ├─ mocks/                # WP5: MSW handlers (lets UI build before the server is ready)
      ├─ components/           # shared UI (StatusChip, TeamRow, Crest, …)
      ├─ features/players/     # WP6: leaderboard, player cards, team status table (CORE)
      ├─ features/bracket/     # WP7: mobile bracket (vertical → radial enhancement)
      └─ styles/
```

## 4. Data flow
1. **Load** CSVs → typed structural model (teams, groups, fixtures, venues, stages, picks).
2. **Normalize** picks → map raw names to canonical teams / placeholder slots; emit a report.
3. **Fetch results** via the active `ResultsProvider`.
4. **Reconcile** API fixtures → our match IDs (`fixtureMatch`), attach scores/status.
5. **Compute** (pure engine): group standings → ranks → qualifiers; resolve knockout slots;
   per-team status (alive / eliminated / champion / did-not-qualify); per-player leaderboard.
6. **Serve** app-shaped JSON; the web client renders. Results are cached with a short TTL.

## 5. The ResultsProvider seam
```ts
export interface ResultsProvider {
  // Match results keyed to OUR match ids (1..104). Unknown/unplayed → omitted.
  getResults(): Promise<MatchResultDTO[]>;
  // Optional: knockout slot resolutions once the API knows who plays whom.
  getResolvedSlots?(): Promise<ResolvedSlotDTO[]>;
  meta(): { source: 'seed' | 'live'; lastUpdated: string | null };
}
```
- **seedProvider** — derives from CSVs (+ an optional hand-edited `datasets/results.seed.csv`
  for local testing). Everything defaults to *scheduled*. Works with no key, before kickoff.
- **footballApiProvider** — calls the chosen vendor, maps via `fixtureMatch` (match by stage +
  date + the two teams’ codes; fall back to a maintained `match_id ↔ vendor_fixture_id` map),
  caches, retries with backoff, and **falls back to seed** on failure.

Selected by `DATA_SOURCE` env. This is why no other workstream blocks on the API key.

## 6. REST API contract (served under `/api`)
Exact TypeScript shapes live in `shared/src/contract.ts`. Endpoints:

| Method & path             | Purpose                                                                 |
|---------------------------|-------------------------------------------------------------------------|
| `GET /api/health`         | `{ ok, dataSource, lastUpdated }`                                       |
| `GET /api/overview`       | `asOf`, leaderboard (`PlayerSummary[]`), current stage, `dataSource`   |
| `GET /api/players`        | `PlayerSummary[]` (each: teams + status, aliveCount, furthestStage, rank)|
| `GET /api/players/:id`    | One player + each team’s fixtures & detailed status                     |
| `GET /api/teams`          | `Team[]` each with `TeamStatus`                                         |
| `GET /api/groups`         | Per group: 4 teams + `GroupStandingRow[]`                              |
| `GET /api/bracket`        | Knockout tree: nodes (stage, match, resolved teams, winner)            |
| `GET /api/matches`        | `Match[]` filterable by `?stage=&group=&date=`                          |
| `GET /api/schedule`       | Matches grouped by local date                                          |

Example `PlayerSummary` (sketch):
```jsonc
{
  "player": { "id": 5, "name": "Jordan" },
  "rank": 1,
  "aliveCount": 6,
  "furthestStage": "Round of 16",
  "points": 14,
  "teams": [
    { "team": { "id": 29, "name": "Spain", "fifaCode": "ESP", "group": "H" },
      "status": { "alive": true, "furthestStage": "Round of 16", "isChampion": false } },
    { "team": { "id": 27, "name": "IR Iran", "fifaCode": "IRN", "group": "G" },
      "status": { "alive": false, "eliminatedAtStage": "Group Stage", "furthestStage": "Group Stage" } }
  ]
}
```

## 7. Config & environment
`server/.env` (gitignored; documented by `.env.example`):
```
PORT=8787
DATA_SOURCE=seed            # seed | live
FOOTBALL_API_PROVIDER=football-data
FOOTBALL_API_KEY=           # required only when DATA_SOURCE=live
RESULTS_CACHE_TTL_SECONDS=60
```
`web/.env` (optional): `VITE_API_BASE=/api` (default). Vite dev server proxies `/api` → `:8787`.

## 8. Running locally
- One command: `npm run dev` (root) starts the API (`tsx watch`) and web (`vite`) together.
- Web on `http://localhost:5173`, API on `:8787`. The phone-sized preview is the primary target;
  test at 390×844 (iPhone 12–15) up to 440×956 (Pro Max / 16–17 class).
- Pre-tournament / no key: leave `DATA_SOURCE=seed` — full structure renders, all matches “upcoming”.

## 9. Testing
- **Engine (WP2):** Vitest unit tests with fixture scenarios (full group, ties, knockouts, an
  eliminated playoff pick) — this is where correctness lives.
- **Data (WP1):** schema + referential-integrity tests; snapshot of the mapping report.
- **Web:** component tests for `StatusChip`/`TeamRow`; MSW-backed render tests for the player view.

## 10. Non-functional targets
- Mobile-first; legible at a glance; large tap targets; works one-handed.
- Accessible status (never colour alone — pair colour with a label/icon).
- Graceful loading / empty / error / “stale data” states.
- Fast: data is small; cache API results; avoid layout shift.
