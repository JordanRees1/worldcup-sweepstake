# Development Guide

Practical guide for working in this repo (humans **and** AI agents). Pairs with
[`ARCHITECTURE.md`](./ARCHITECTURE.md) (the design) and
[`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md) (what to build next).

## Install & run
```bash
nvm use            # Node 22 (see .nvmrc)
npm install        # all workspaces
npm run dev        # API :8787 + web :5173 (Vite proxies /api → server)
```
Other commands: `npm run dev:server`, `npm run dev:web`, `npm run build`, `npm run lint`,
`npm run format`, `npm run test`.

## Resolved stack (as installed at WP0)
This machine resolves recent majors — pin ranges live in each `package.json`.

| Area        | Packages (major) |
|-------------|------------------|
| Language    | TypeScript 6 (`strict`, ESM, `moduleResolution: bundler`) |
| Web         | React 18, Vite 8, `@vitejs/plugin-react` 6, Tailwind CSS **4** (`@tailwindcss/vite`) |
| Server      | Express 4, `cors`, `dotenv`, run via `tsx` |
| Lint/format | ESLint 10 (flat config), Prettier 3 |
| Test        | Vitest 4 |

## How the workspaces fit together
- **`shared/`** — the contract. `src/types.ts` (domain model) + `src/contract.ts` (routes +
  response shapes). Consumed as **TypeScript source**: its `package.json` `exports` points at
  `src/index.ts`, and `web/vite.config.ts` aliases `@sweepstake/shared` to that file so Vite
  transpiles it. Edit here once; both sides see it.
- **`server/`** — Express API. WP1–WP4 add `src/data/` (CSV load + normalization),
  `src/engine/` (pure standings/status/scoring), `src/providers/` (`ResultsProvider`:
  seed + live), and `src/routes/`.
- **`web/`** — Vite + React + Tailwind. WP5 adds the shell, design tokens, and a typed data
  layer (React Query + MSW mocks); WP6/WP7 add the player and bracket features.

## Conventions
- **ESM only**, TypeScript `strict`. Domain types live **only** in `shared/`.
- Cross-workspace imports use the package name `@sweepstake/shared` — never relative paths.
- **Engine logic = pure functions** in `server/src/engine`, each with a co-located
  `*.test.ts`. No I/O, fully deterministic.
- **Tailwind v4 is CSS-first** — there is no `tailwind.config.js`. Customize via `@theme` in
  `web/src/index.css`. Build mobile-first; design at ~390×844 and verify up to 440×956.
- The live API is always behind `ResultsProvider`; the app must work with `DATA_SOURCE=seed`.

## Recipes
### Add or change a shared type / contract field
Edit `shared/src/types.ts` or `shared/src/contract.ts`. Both `server` and `web` pick it up
immediately. Run `npm run build` to typecheck everywhere.

### Add an API endpoint
1. Add the response type (and a path in `API_ROUTES`) to `shared/src/contract.ts`. Tenant reads
   take a `code` (`(code) => '/api/s/${code}/…'`); global routes are plain strings.
2. Implement the route in `server/src/routes/index.ts`. For a tenant read, wrap the handler in
   `tenant(...)` (resolves `code` → `AppState`, 404s unknown codes). Guard mutations with the
   `createAllowed` / `ownerOrAdmin` / `isAdmin` helpers.
3. Consume it in `web` through a typed, code-aware hook in `lib/api.ts` (`useSweepstakeCode()`).

### Add a web feature/page
Create `web/src/features/<name>/`, build small components, and wire it into the shell's tab
nav (WP5). Keep everything legible one-handed on a phone.

### Add engine logic
Add a pure function in `server/src/engine/<name>.ts` plus `server/src/engine/<name>.test.ts`.
Feed it fixtures; assert outputs. Run `npm run test`.

## Demo scenarios (local testing at different tournament stages)

Run the app at a simulated tournament stage without touching any real API calls:

| Command | Stage |
|---|---|
| `npm run dev:group-stage` | Matchday 1+2 done — matchday 3 to come; partial standings |
| `npm run dev:quarters` | R32 + R16 done — 8 teams left, QF fixtures set |
| `npm run dev:final` | SFs + 3rd-place done — 2 finalists, Final tomorrow |
| `npm run dev:live-demo` | Some matchday-3 games mid-play — exercises the LIVE badge + minute |
| `npm run dev` | Default — all upcoming (pre-kickoff seed mode) |

The scenario files live in `datasets/scenarios/` and are committed. To regenerate them
(e.g. if you change the simulation rule):

```bash
npm run generate:scenarios
```

The simulation rule is deterministic: home team always wins 2-1. Best-third R32 slot
assignment uses "most constrained first" so groups K and L (which appear in only one slot)
are placed correctly.

## Multiple sweepstakes (the gateway)
One server hosts **many** sweepstakes, each addressed by a short `code` at `/s/<code>`. The
tournament structure + results are shared (computed once, cached); each sweepstake overlays only
its own players + picks. There are two kinds of tenant — see [ARCHITECTURE.md §6a](./ARCHITECTURE.md#6a-multi-tenant-gateway):

**Baked** — committed under `datasets/sweepstakes/<slug>/` (a `player_picks.csv` + a
`sweepstake.json` `{ "name", "teamsPerPlayer", "code" }`). Resolved by `resolveSweepstakeByCode`
([server/src/data/sweepstake.ts](../server/src/data/sweepstake.ts)); read-only at runtime. The two
shipped today: `crackers` (6×8) and `aa26` (24×2). Check picks resolve before committing:

```bash
SWEEPSTAKE=<slug> npm run report:picks -w @sweepstake/server   # regenerates the mapping report
```

**Runtime** — created at runtime and stored in a `TenantStore`
([server/src/data/tenantStore.ts](../server/src/data/tenantStore.ts)): a local directory in dev
(`datasets/tenants/*.json`, gitignored), Azure Blob in prod (set `AZURE_STORAGE_ACCOUNT`). Create one:

```bash
# CLI (bypasses the create gate; run locally):
npm run sweepstake:create -- --picks ./player_picks.csv --name "Dave's Mates" --teams-per-player 8

# or the web flow: /new (needs CREATE_TOKEN), manage at /s/:code/manage, admin at /a/admin
```

Validation (shared by CLI + web, in `services/sweepstakeCreate.ts`) derives its rules from
`teamsPerPlayer` (players = 48 / teamsPerPlayer, every team owned exactly once); only the tournament
cardinalities (48/16/104/…) are fixed. Messy names resolve via `createTeamResolver` with a
"did you mean…?" suggester. For baked sweepstakes the generated `picks.normalized.json` /
`PICKS_MAPPING_REPORT.md` are **review artifacts** — the server normalises `player_picks.csv`
directly at runtime and never reads the JSON.

To exercise tokens locally, set `CREATE_TOKEN` / `ADMIN_TOKEN` in `server/.env` (unset = creation
open / admin disabled).

## Data & environment
- `DATA_SOURCE=seed` (default): no key; structure comes from `datasets/`, results are empty
  /seeded. `live`: copy `server/.env.example` → `server/.env`, set `FOOTBALL_API_KEY`
  (football-data.org). Selection happens behind `ResultsProvider` — never call the vendor
  from `web`.

## Gotchas
- **Cold-start 502**: on `npm run dev`, Vite may be ready ~1s before the API, so the first
  proxied `/api` request can fail briefly. Expected; WP5's React Query adds retries.
- **No `tailwind.config.js`** (v4). Don't add one expecting v3 behaviour.
- **Don't redefine domain types** in `web`/`server` — import from `@sweepstake/shared`.
