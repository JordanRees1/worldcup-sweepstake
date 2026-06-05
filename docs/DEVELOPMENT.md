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
1. Add the response type (and a path in `API_ROUTES`) to `shared/src/contract.ts`.
2. Implement the route in `server/src/routes/*` and return the typed shape.
3. Consume it in `web` through a typed hook (WP5's data layer).

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
| `npm run dev` | Default — all upcoming (pre-kickoff seed mode) |

The scenario files live in `datasets/scenarios/` and are committed. To regenerate them
(e.g. if you change the simulation rule):

```bash
npm run generate:scenarios
```

The simulation rule is deterministic: home team always wins 2-1. Best-third R32 slot
assignment uses "most constrained first" so groups K and L (which appear in only one slot)
are placed correctly.

## Multiple sweepstakes
One codebase + one shared tournament can run several sweepstakes. Each lives in
`datasets/sweepstakes/<slug>/` with a `player_picks.csv` and a `sweepstake.json`
(`{ "name", "teamsPerPlayer" }`). The active one is chosen by the `SWEEPSTAKE` env var
(default `friends`); `resolveSweepstake()` ([server/src/data/sweepstake.ts](../server/src/data/sweepstake.ts))
is the single resolver, consumed by `normalizePicks` and `validateDataset`.

```bash
npm run dev          # friends (default)
npm run dev:work     # work; or SWEEPSTAKE=<slug> npm run dev
npm run report:picks:work   # regenerate <slug>'s mapping report + normalized.json (for sign-off)
```

Validation derives its pick rules from `teamsPerPlayer` (players = 48 / teamsPerPlayer,
every team owned exactly once); only the tournament cardinalities (48/16/104/…) are fixed.
The generated `picks.normalized.json` / `PICKS_MAPPING_REPORT.md` are **review artifacts** —
the server normalises `player_picks.csv` directly at runtime and never reads the JSON.

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
