# Implementation Plan

> **Progress:** repo setup ✅ · WP0 ✅ · WP1 ✅ · WP2 engine ✅ · WP5 web shell ✅ · next: WP3 (results provider) → WP4 (API routes) → WP6/WP7 (see §8).

## 1. Goal & MVP scope
A **local, mobile-first** web app that, for a World Cup 2026 sweepstake, shows **each player’s
teams and whether they’re still in** as the tournament unfolds, plus a **leaderboard** and a
**bracket** view. Data structure comes from the existing CSVs; live results come from a football
API (behind an abstraction with a working offline “seed” mode).

**In scope (MVP):** players & their teams with live status; leaderboard; group standings;
schedule; mobile bracket (vertical first). **Out of scope (now):** logins/accounts, running the
draw, editing data in-app, push notifications, multi-tournament support, deployment/hosting.
**Later:** radial “final-in-the-centre” bracket; richer live (minute-by-minute) updates.

## 2. Architecture at a glance
React+Vite (web) ⟶ thin Express API (server) ⟶ pure engine + `ResultsProvider` (seed|live),
with `shared/` holding the domain types + REST contract used by both sides. Full detail in
[`ARCHITECTURE.md`](./ARCHITECTURE.md); data/rules in [`DATA_AND_RULES.md`](./DATA_AND_RULES.md).

## 3. Critical path & parallelism

> **WP0 + WP1 are complete** — the `shared` contract and the validated data layer
> (`loadDataset()`) exist, so WP2 / WP3 / WP5 can now proceed in parallel.
```
WP0 scaffold + shared contract  ──┬─▶ WP1 data pipeline ─┐
   (unblocks everything)          ├─▶ WP2 engine ────────┼─▶ WP4 API server ─┐
                                  ├─▶ WP3 results provider┘                  ├─▶ WP6 player views (CORE)
                                  └─▶ WP5 web shell + mocks ─────────────────┴─▶ WP7 bracket view
                                                                                  WP8 polish/QA (cross-cutting)
```
- **WP0 must land first** — it defines `shared/` types + the REST contract everyone codes against.
- Then **WP1, WP2, WP3, WP5 run in parallel** (WP5 uses MSW mocks of the contract, so the web
  team never waits for the server).
- **WP4** integrates WP1+WP2+WP3 behind the real endpoints. **WP6** (the core ask) then **WP7**.
- **WP8** runs alongside from the moment there’s something to test.

## 4. Work packages
Each is sized to be handed to one agent/session. “Done” = acceptance criteria met + types from
`shared/` only + tests where noted + `lint` clean.

### WP0 — Scaffold & shared contract  ·  ✅ DONE (commit `64b9d5f`)
- npm-workspaces monorepo: `shared/`, `server/`, `web/`; root `dev/build/lint/test` scripts;
  `tsconfig.base.json` (strict); ESLint + Prettier; `.gitignore`; `git init`.
- `shared/src/types.ts` (domain model) + `shared/src/contract.ts` (endpoint paths + req/res shapes).
- Vite app + Express app that both **boot and compile** against `shared/`; `/api/health` returns ok.
- **Accept:** `npm install && npm run dev` serves an empty web app that successfully calls
  `/api/health`; `npm run lint && npm run build` pass; `shared` is importable from both.
- **Done:** verified end-to-end; Tailwind v4 wired in; the `npm run dev` proxy confirmed.

### WP1 — Data pipeline (CSV → typed model + normalization)  ·  ✅ DONE (commits `e8de619`…`9966689`)
- Loaders for all 5 CSVs → `shared` types (timezone-aware `kickoff_at`); fix match-#100 bug.
- Picks normalization (alias map + accent/case-insensitive match + placeholder mapping) →
  `datasets/picks.normalized.json`; generate `docs/PICKS_MAPPING_REPORT.md`.
- Validation: schema + referential integrity (every match’s team/city/stage id exists; 8 picks
  per player; no team double-picked; report unmatched + unpicked confirmed teams).
- **Accept:** loaders unit-tested; report lists every unmatched/contingent pick (the 7 playoff
  picks surfaced, the 6 placeholders identified); invalid data fails loudly with a clear message.
- **Done:** all 5 CSVs → shared types; picks **48/48** matched (playoffs resolved; Wales→Croatia
  swap); match-#100 fixed; ISO kickoffs; `loadDataset()` runs `validateDataset()`; 15 tests.

### WP2 — Tournament engine (pure functions)  ·  ✅ DONE (commit `4f9a1b5`)
- Group standings from results + configurable tie-break comparator; best-third ranking (top-8).
- Knockout resolution by following label encodings (`W##`, `RU##`, positional R32 slots);
  consume API-resolved slots when available, else compute what’s possible.
- Per-team `TeamStatus` (alive/eliminated/champion/did-not-qualify, furthest stage, next match);
  per-player leaderboard via `scoring.ts` (config-driven; default in DATA_AND_RULES §5).
- **Accept:** Vitest scenarios pass — completed group with ties, a group decided early, a full
  knockout path to champion, and an eliminated playoff pick. Pure (no I/O), 100% deterministic.
- **Done:** standings (FIFA tie-breakers), qualification (top-2 + 8 best thirds), team status
  (upcoming→alive/eliminated/champion), `buildLeaderboard` (sorted: alive ↓ → stage ↓ → pts ↓
  → GD ↓), `DEFAULT_SCORING` (confirmed), `computeTeamGoalDifferences`. 48 tests, 8 files.

### WP3 — Results provider (seed + live)  ·  *needs WP0*
- `ResultsProvider` interface; `seedProvider` (CSV + optional `datasets/results.seed.csv`);
  `footballApiProvider` (chosen vendor) with caching (TTL), retry/backoff, and seed fallback.
- `fixtureMatch`: reconcile vendor fixtures → our match IDs (stage+date+team codes; maintained
  id-map fallback). Vendor schema mapped to our `MatchResultDTO`/`ResolvedSlotDTO`.
- **Accept:** with `DATA_SOURCE=seed` the app needs no key and shows all-upcoming; provider
  swap is config-only; live path unit-tested against a recorded fixture sample.

### WP4 — Backend API server  ·  *needs WP1+WP2+WP3 contracts (can stub early)*
- Express routes for every endpoint in the contract; a `services/` layer that composes
  load→results→engine into the app-shaped responses; response caching; CORS for local dev;
  consistent error envelope; `/api/health` reports `dataSource` + `lastUpdated`.
- **Accept:** every endpoint returns contract-valid JSON in `seed` mode; `players`/`overview`
  reflect a seeded result set correctly; errors return structured messages, not stack traces.

### WP5 — Web shell, design system & data layer  ·  ✅ DONE (commit `eb6e7b9`)
- Vite app shell: mobile-first layout, bottom-tab nav (Players · Bracket · Schedule), theme
  tokens (colours/spacing/typography), `StatusChip`, `TeamRow`, `Crest`, loading/empty/error/stale.
- Typed API client + React Query hooks importing `shared/contract`; **MSW** handlers so the UI
  runs standalone before WP4.
- **Accept:** app renders on a 390×844 viewport with no horizontal scroll; nav works; all data
  flows through the typed hooks; swapping MSW→real API is a base-URL change only.
- **Done:** built in-house (the sub-agent was sandbox-blocked on `npm install`); react-router
  tabs, Tailwind v4 `@theme`, StatusChip/TeamRow/Crest, React Query hooks, MSW mocks of every
  endpoint; verified rendering at 375×812. `VITE_MOCKS=off` hits the real API.

### WP6 — Player views & leaderboard (CORE)  ·  *needs WP5 + contract*
- Leaderboard (ranked players, alive-count, furthest stage); player card → team status table;
  team detail (its fixtures/result). Clear at-a-glance alive vs out (colour **and** label/icon).
- **Accept:** from `/api/overview` + `/api/players/:id`, a non-technical user can tell in seconds
  who’s winning and which of their teams are still in; legible one-handed on a phone.

### WP7 — Bracket view  ·  *needs WP5 + `/api/bracket`*
- **Phase A (MVP):** readable vertical bracket, swipe/segment by round; tap a tie for detail;
  highlight the teams owned by a selected player.
- **Phase B (enhancement):** radial “group stages outside → final in the centre” layout.
- **Accept (A):** every round legible on a phone with no pinch-zoom; placeholders shown
  sensibly before teams resolve; reflects seeded results.

### WP8 — QA, accessibility, performance & docs  ·  *cross-cutting*
- Test coverage for engine + data; a11y pass (contrast, focus, non-colour status, tap targets);
  perf (no layout shift, cached data); `README.md` with newcomer run steps + screenshots.
- **Accept:** `lint`+`test`+`build` green; README lets a fresh clone run the app in seed mode in
  one command; documented how to switch to live with a key.

## 5. Suggested agent assignments
A measured split that minimises integration churn (you can also do these sequentially with me):
- **Agent A — Data & Engine:** WP1 + WP2 (shared domain mindset, pure/testable).
- **Agent B — Server & Integration:** WP3 + WP4 (provider, API, vendor reconciliation).
- **Agent C — Web:** WP5 + WP6, then WP7 Phase A (mobile UI).
- **WP0** and **WP8** stay with the orchestrator (me) for shared contracts and final integration.
Contracts in `shared/` + MSW mocks are what let A/B/C run concurrently without colliding.

## 6. Open decisions (need the user)
1. **Football API + key.** Recommend **football-data.org** (free tier, simple `X-Auth-Token`,
   covers the World Cup; good for post-match results) — or **API-Football** for richer live data.
   We’ll confirm 2026 coverage when wiring WP3; `seed` mode covers all dev until then.
2. **Scoring rule.** Confirm the proposed default (DATA_AND_RULES §5) or give your league’s rule.
3. **Picks report sign-off** — ✅ done (playoffs resolved; Wales→Croatia swap; 48/48 matched).

## 7. How we’ll work (new to Claude Code)
- I edit files directly; you see each change as a diff in the chat and can open the same folder
  in **VS Code** side-by-side (Claude Code and VS Code share the working tree — no conflict).
- To run things I use the terminal for you (e.g. `npm run dev`); I’ll report output and errors.
- “Multiple agents” = I can spin up focused sub-sessions per work package (§5) or we tackle them
  one at a time together. Recommended start: I build **WP0** (scaffold + contracts), we eyeball
  it, then parallelise A/B/C.
- Nothing is deployed or sent anywhere; everything runs on your machine.

## 8. Status & next steps
- ✅ **Repo setup** — git initialized, hygiene + dev environment (commit `c0b3a2e`).
- ✅ **WP0** — workspaces, shared contract, runnable API + web skeleton, Tailwind v4 (commit `64b9d5f`).
- ✅ **WP1** — 5 CSVs → typed model; picks normalized 48/48; match-#100 fixed; `loadDataset()`
  validates referential integrity; mapping report signed off.
- ✅ **WP5** — mobile web shell, design system, React Query + MSW data layer (commit `eb6e7b9`).
- ✅ **WP2** — full engine: standings, qualification, team status, scoring + GD metric (commit `4f9a1b5`).
- ▶️ **Next: WP3** (results provider: seedProvider + footballApiProvider with your token) →
  **WP4** (REST routes wiring engine → web) → **WP6/WP7** (player + bracket views on live data).
- ⏳ **From the user:** football-data.org API key when ready (runs in `seed` until then);
  confirm the scoring rule if it differs from the default.
