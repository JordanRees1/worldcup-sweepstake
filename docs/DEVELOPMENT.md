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
