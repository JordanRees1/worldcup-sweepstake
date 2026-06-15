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
fixtures, the bracket skeleton, venues). The football API only provides *results*
(scores, statuses, and — once the knockouts begin — which teams fill each slot). The engine
joins the two and derives everything the UI needs.

**Multi-tenant:** one server hosts **many** sweepstakes, each addressed by a short `code`
(`/s/<code>`). The tournament *structure + results* are shared and computed once (cached); each
sweepstake overlays only its own **players + picks** to produce its leaderboard. See §6a for the
gateway, tenant store, and permission model.

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
├─ server/                     # @sweepstake/server  (Express gateway; tsx in dev, bundled in prod)
│  ├─ .env.example
│  └─ src/
│     ├─ index.ts              # app bootstrap: build gateway + tenant store, listen on :8787
│     ├─ app.ts                # Express app (routes, static web in prod, vanity-host redirects)
│     ├─ data/                 # CSV loaders, normalization (createTeamResolver), validation;
│     │                        #   sweepstake.ts (baked tenants by code), tenantStore.ts (runtime)
│     ├─ engine/               # standings, third-place ranking, bracket resolve, status, scoring
│     ├─ providers/            # ResultsProvider — seedProvider, footballApiProvider, fixtureMatch
│     ├─ services/             # appState (computeAppState + createGateway), responses,
│     │                        #   sweepstakeCreate (validate roster), metrics (best-effort usage)
│     ├─ scripts/              # createSweepstake.ts — the `sweepstake:create` CLI
│     └─ routes/               # all REST endpoints (tenant reads + create/edit/delete + admin)
└─ web/                        # @sweepstake/web (Vite + React + TS, port 5173)
   └─ src/
      ├─ App.tsx               # React Router: /, /new, /a/admin, /s/:code/* (tenant shell)
      ├─ lib/                  # api.ts (code-aware React Query hooks + mutations), sweepstake.tsx
      │                        #   (code context), savedSweeps.ts, clientId.ts (anon id + admin token)
      ├─ mocks/                # MSW handlers (VITE_MOCKS=on for offline UI dev)
      ├─ components/           # shared UI (chrome, StatusChip, TeamRow, LiveBadge, states, …)
      ├─ features/players/     # leaderboard, player cards, team status table (CORE)
      ├─ features/groups/      # group standings
      ├─ features/bracket/     # mobile + desktop knockout bracket
      ├─ features/landing/     # landing picker / enter-a-code / create entry
      ├─ features/create/      # /new (CreateScreen) + /s/:code/manage (ManageScreen) + SweepstakeForm
      └─ features/admin/       # /a/admin (AdminScreen) — global-token panel
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
Exact TypeScript shapes + canonical paths live in `shared/src/contract.ts` (`API_ROUTES`). All
read endpoints are **tenant-scoped** by `code` (`/api/s/<code>/…`); a handful of global routes
handle health, create/validate, edit/delete, and admin.

**Global**

| Method & path                  | Purpose                                                              |
|--------------------------------|----------------------------------------------------------------------|
| `GET /api/health`              | `{ ok, dataSource, lastUpdated, version }` (cheap; no tenant)        |
| `POST /api/sweepstakes/validate` | Dry-run a roster → `{ ok, issues?, errors? }` ("did you mean…?")    |
| `POST /api/sweepstakes`        | Create a sweepstake → `{ code, ownerToken }`. **Needs `x-create-token`** |
| `PATCH /api/s/:code`           | Edit name/roster. **Needs `x-owner-token` or `x-admin-token`** (baked → 403) |
| `DELETE /api/s/:code`          | Delete. **Needs owner/admin token** (baked → 403)                    |
| `GET /api/a/admin`             | Admin overview. **Needs `x-admin-token`** — see §6a                  |

**Tenant reads** (`<code>` = e.g. `crackers`, `aa26`, a 6-hex custom code)

| Method & path                  | Purpose                                                              |
|--------------------------------|----------------------------------------------------------------------|
| `GET /api/s/:code/meta`        | `{ code, name, teamsPerPlayer, playerCount }` — validates the code; records a best-effort view (`x-client-id`) |
| `GET /api/s/:code/overview`    | `asOf`, leaderboard (`PlayerSummary[]`), current stage, `dataSource` |
| `GET /api/s/:code/players`     | `PlayerSummary[]` (teams + status, aliveCount, furthestStage, rank)  |
| `GET /api/s/:code/players/:id` | One player + each team's fixtures & detailed status                  |
| `GET /api/s/:code/teams`       | `Team[]` each with `TeamStatus`                                      |
| `GET /api/s/:code/groups`      | Per group: 4 teams + `GroupStandingRow[]`                            |
| `GET /api/s/:code/bracket`     | Knockout tree: nodes (stage, match, resolved teams, winner)          |
| `GET /api/s/:code/matches`     | `Match[]` filterable by `?stage=&group=&date=`                       |
| `GET /api/s/:code/schedule`    | Matches grouped by local date                                        |

An unknown code → `404`. Tokens are passed as request headers (`x-create-token` /
`x-owner-token` / `x-admin-token`), never in the URL.

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

## 6a. Multi-tenant gateway
One server, many sweepstakes — addressed by short `code`.

- **Gateway** (`createGateway` in `services/appState.ts`): resolves a `code` → a `Dataset`, runs
  the pipeline (§4), and memoizes per-code state for the cache TTL. All tenants share the single
  `ResultsProvider`, so the upstream results fetch happens **once** regardless of how many
  sweepstakes exist — API usage stays flat (≤2 calls/min). `gateway.invalidate(code)` drops a
  tenant's cached state after it's edited/deleted.
- **Two tenant sources**, resolved in order:
  1. **Baked** — committed `datasets/sweepstakes/<slug>/` (CSV + `sweepstake.json` with a `code`),
     via `resolveSweepstakeByCode`. Read-only at runtime (PATCH/DELETE → 403).
  2. **Runtime store** — a `TenantStore` (`data/tenantStore.ts`) holding `TenantRecord`s with picks
     **already resolved to team ids** at creation (so reads never re-parse a CSV).
- **TenantStore seam** (mirrors `ResultsProvider`): `createBlobTenantStore` (Azure Blob, one JSON
  per tenant, authed by the container's **managed identity** — no secret) in prod;
  `createLocalTenantStore` (a local directory) in dev + the CLI. Selected by the
  `AZURE_STORAGE_ACCOUNT` env var.
- **Creation/validation** (`services/sweepstakeCreate.ts`): enforces the 48-team partition
  (`teamsPerPlayer × players = 48`, every team exactly once) and resolves messy pick names with the
  shared `createTeamResolver` + a Levenshtein "did you mean…?" suggester. Same code path for the
  web `/new` flow and the `sweepstake:create` CLI. Alternatively `generateRoster` **draws the teams
  automatically** (`SweepstakeInput.generate`): `chaos` (random deal) or `balanced` (sort by
  `fifaRank`, split into N tiers, one per tier per player). Both yield a valid partition; the create
  response returns the drawn `roster` so `/new` can reveal it.
- **Permissions — three tokens, no accounts** (all host-managed secrets, never in source):
  - **`CREATE_TOKEN`** — shared anti-bot gate on `POST /api/sweepstakes`. Unset = creation open (dev).
  - **owner token** — random per-sweepstake, returned once at creation, stored only as a SHA-256
    hash; lets that creator edit/delete their own sweepstake.
  - **`ADMIN_TOKEN`** — global: edit/delete any sweepstake + the `/a/admin` panel.

  The CLI bypasses the create gate (run locally by a trusted operator). View codes are read-only.
- **Admin metrics** (`services/metrics.ts`): the panel's priority numbers (sweepstake/player counts)
  are exact (from the store); **views / active-now are best-effort**, held in-memory per replica
  (reset on restart, approximate under scale-out). "Active now" counts distinct anonymous
  `x-client-id`s (a localStorage UUID — no PII) seen in the last ~5 min.

## 7. Config & environment
`server/.env` (gitignored; documented by `.env.example`):
```
PORT=8787
DATA_SOURCE=seed            # seed | live
FOOTBALL_API_PROVIDER=football-data
FOOTBALL_API_KEY=           # required only when DATA_SOURCE=live
RESULTS_CACHE_TTL_SECONDS=60   # 30 in prod (in-play scores)
CREATE_TOKEN=               # shared create password; unset = creation open (dev)
ADMIN_TOKEN=                # global admin (edit any + /a/admin); unset = admin disabled
AZURE_STORAGE_ACCOUNT=      # set → Blob tenant store (prod); unset → local dir (dev)
```
`SWEEPSTAKE` is **no longer used** by the gateway (it hosts all tenants by code); it survives only
in the legacy single-sweepstake path. `web/.env` (optional): `VITE_API_BASE=/api` (default), and
`VITE_MOCKS=on` to serve MSW fixtures offline. Vite dev proxies `/api` → `:8787`.

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
