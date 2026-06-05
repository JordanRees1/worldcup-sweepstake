# Agent Handoff — World Cup 2026 Sweepstake

**Written at the end of the first full build session.** This document gives the next agent everything
it needs to continue without reading the full transcript. Read this, `CLAUDE.md`, and
`docs/DEVELOPMENT.md` before touching any code.

---

## 1. Project in one paragraph

A **mobile-first local web app** for a 6-player World Cup 2026 sweepstake. Each of the 6 players
owns 8 national teams. The app shows who's still alive as the tournament progresses, a ranked
leaderboard (alive count → furthest stage → points → goal-difference), group standings, a fixture
schedule, and a knockout bracket. It runs entirely on the owner's Mac — no deployment, no accounts.
Results come from **football-data.org** (live) or pre-built JSON scenario files (demo/testing).

---

## 2. Complete build status

Every work package is done:

| WP  | What                                                                                                         | Commit    | Tests |
| --- | ------------------------------------------------------------------------------------------------------------ | --------- | ----- |
| 0   | Scaffold: npm workspaces, shared contract, Vite+React+Tailwind v4, Express `/api/health`                     | `64b9d5f` | —     |
| 1   | CSV data pipeline: all 5 datasets → typed model, normalization, `loadDataset()` + validation                 | `9b83c67` | 15    |
| 2   | Tournament engine: standings, qualification (best-thirds), team status, scoring, leaderboard                 | `4f9a1b5` | 48    |
| 3   | Results provider: `seedProvider` (offline) + `footballApiProvider` (live, TLA reconciliation)                | `8060ebf` | —     |
| 4   | REST API: all 9 endpoints (`/api/health,overview,players,teams,groups,bracket,matches,schedule,players/:id`) | `66fdf97` | 82    |
| 5   | Web shell: tab nav, Tailwind design tokens, `StatusChip`/`TeamRow`/`Crest`, React Query + MSW                | `eb6e7b9` | —     |
| 6   | Player detail + Groups screen; real-API default (VITE_MOCKS=on for offline)                                  | `3dab5c3` | —     |
| 7   | Bracket: round selector, player filter, `BracketMatchCard`, auto-active stage                                | `0429591` | —     |
| —   | Scenario system: `npm run dev:group-stage,quarters,final` for demo testing                                   | `943ebba` | —     |
| —   | Bug fixes: Third Place alive=false; upcoming match updates `furthestStage`                                   | `c024c82` | 84    |

**Current totals: 84 tests passing, build clean, lint clean.**

---

## 3. Running the app

```bash
npm run dev                  # Normal seed mode — all upcoming (pre-kickoff)
npm run dev:group-stage      # Demo: matchday 1+2 done, matchday 3 to come
npm run dev:quarters         # Demo: groups + R32 + R16 done, 8 teams in QFs
npm run dev:final            # Demo: SFs + 3rd-place done, Mexico vs Tunisia final
```

To regenerate scenario files (e.g. after changing simulation rules):

```bash
npm run generate:scenarios
```

To enable live results (requires `server/.env` with your `FOOTBALL_API_KEY`):

```bash
# Edit server/.env:  DATA_SOURCE=live
npm run dev
```

The web proxies `/api` → `localhost:8787`. The API serves on `:8787`, web on `:5173`.

---

## 4. Architecture — the critical parts

```
datasets/*.csv (structure)   footballApiProvider (live results)
       ↓                              ↓
   loadDataset()  ←——  applyResults() ←—— getResults() / getResolvedSlots()
       ↓
   engine (pure functions in server/src/engine/)
   ├─ computeAllGroupStandings()    ← standings + FIFA tie-breakers
   ├─ computeDecidedGroups()        ← group complete when all 6 matches finished
   ├─ computeQualification()        ← top-2 + 8 best thirds (most-constrained-first)
   ├─ computeTeamStatuses()         ← upcoming/alive/eliminated/champion/3rd-place
   ├─ computeTeamGoalDifferences()  ← GD across all finished matches
   └─ buildLeaderboard()            ← ranked PlayerSummary[] via DEFAULT_SCORING
       ↓
   createAppStateService() [cached, shared in-flight, stale-on-failure]
       ↓
   Express routes → JSON → React Query hooks → UI
```

### Key invariants the engine relies on

- `Match.homeTeamId` / `awayTeamId` are **null** for unresolved knockout slots.
  The provider fills these via `ResolvedSlotDTO`. The engine only processes
  knockout matches where both IDs are non-null.
- `Match.status = 'finished'` and `Match.result.winnerTeamId != null` together
  mean the match has a decided result. Draws in knockouts don't exist.
- `Match.id === 104` is hardcoded as `FINAL_MATCH_ID`. The champion is the winner of 104.
- Third Place Playoff (`stage === 'Third Place Playoff'`) — **winner is NOT alive**
  (`alive: false`). Both teams are done. They still earn 6 pts via `furthestStage`.
- When a scheduled match has resolved team IDs (slots), the engine now advances
  `furthestStage` to the upcoming round's stage (e.g. finalists show `Final`, not `Semifinals`).

---

## 5. Shared contract — the single source of truth

`shared/src/types.ts` — all domain types (`Team`, `Match`, `TeamStatus`, `PlayerSummary`, etc.)
`shared/src/contract.ts` — all REST endpoint paths (`API_ROUTES`) and response shapes.

**Never redefine types in `server/` or `web/`. Always import from `@sweepstake/shared`.**

`web/vite.config.ts` aliases `@sweepstake/shared` → `../shared/src/index.ts` so Vite
transpiles it directly. `server/` imports it as TypeScript source too — no compilation step.

### Adding a new field to the contract

1. Add type/field to `shared/src/types.ts` or `shared/src/contract.ts`
2. Implement it in the relevant `server/src/services/responses.ts` builder
3. Add it to the mock fixtures in `web/src/mocks/fixtures.ts`
4. Consume in the web via the existing typed hook or a new one in `web/src/lib/api.ts`

---

## 6. The sweepstake players and their teams

| Player     | Teams (8 each)                                                                        |
| ---------- | ------------------------------------------------------------------------------------- |
| **Rogan**  | Scotland, Ecuador, Australia, Egypt, Colombia, Netherlands, South Africa, South Korea |
| **Henri**  | Tunisia, Paraguay, Japan, Belgium, Switzerland, Germany, Norway, Argentina            |
| **Will**   | Côte d'Ivoire, Curaçao, Uruguay, Haiti, England, Croatia, Uzbekistan, New Zealand     |
| **Dec**    | Senegal, Jordan, Sweden, Croatia†, Brazil, Türkiye, Cabo Verde, Algeria               |
| **Jordan** | Portugal, Spain, Morocco, IR Iran, Mexico, Ghana, France, Czechia                     |
| **James**  | Austria, Iraq, Saudi Arabia, Qatar, Canada, Panama, Bosnia and Herzegovina, USA       |

† Dec originally picked Wales (did not qualify). Croatia was the unowned team and was swapped in.

**Playoff qualifiers** (March 2026 — all resolved in `datasets/teams.csv`):
Czechia (Group A), Bosnia and Herzegovina (Group B), Türkiye (Group D), Sweden (Group F),
Iraq (Group I), DR Congo (Group K).

---

## 7. Scenario files — how they work

`datasets/scenarios/group-stage.json`, `quarterfinals.json`, `final.json` are committed
pre-built JSON files. The seed provider reads `SEED_SCENARIO=<name>` env var at startup.

**Simulation rule**: home team wins 2-1 for every match. Bracket resolution uses
"most constrained first" greedy for best-third R32 slots (groups K and L each appear
in only one slot — they're assigned before groups with more options).

The final scenario produces: **Mexico vs Tunisia in the Final** (fictional but deterministic).

**If the scenario simulation produces wrong results**, check:

1. `server/src/data/generateScenarios.ts` — the `R32_BEST_THIRD_SLOTS` constant (must match
   `matches.csv` labels exactly)
2. The `computeStandings()` call mid-generator — it uses our real engine, so it's correct
   if the engine is correct

---

## 8. Football-data.org API

- **Provider**: football-data.org v4
- **Competition**: `WC` (id 2000), current season 2026 (id 2398)
- **Free tier**: 10 calls/minute — the provider caches with a configurable TTL (default 60s)
- **API key**: stored in `server/.env` (gitignored) — **never commit it**
- **TLA mismatches fixed** (in `server/src/providers/footballApiProvider.ts`):
  - `CUW` → `CUR` (Curaçao)
  - `URY` → `URU` (Uruguay)
- **Match reconciliation**: primary = (homeTeam.tla, awayTeam.tla) pair lookup;
  fallback = UTC kickoff time ±minutes. The TLA map covers all 48 teams.
- **Status mapping**: API `TIMED` → our `scheduled`; `IN_PLAY`/`PAUSED` → `live`;
  `FINISHED` → `finished`; `POSTPONED` → `postponed`

---

## 9. Tailwind v4 specifics

**There is no `tailwind.config.js`**. Tailwind v4 is CSS-first.

Customisation lives in `web/src/index.css`:

```css
@import 'tailwindcss';
@theme {
  --color-brand-300: #6ee7b7;
  --color-brand-400: #34d399;
  --color-brand-500: #10b981;
}
```

Use `bg-brand-400`, `text-brand-500` etc. as custom utilities. **Do not create a
`tailwind.config.js`** — it won't be picked up and will confuse v4.

---

## 10. Known issues / tracked follow-ups

### ⚠️ Knockout bracket slot resolution (R32 positional slots)

The R32 matches are labelled `2A vs 2B`, `1E vs 3ABCDF` etc. The server resolves these
by looking up group-standings ranks. **However**, the "3XXXX best-third" assignment
(which qualifying third goes to which R32 slot) uses a simplified greedy algorithm, not
the full FIFA combination table. This is correct in seed/scenario mode but the live
`footballApiProvider` gets resolved team IDs directly from the API — no engine logic
needed for live data. Only an issue if we ever need to compute best-third slots
_without_ the API (e.g. for a "what-if" simulation).

### ⚠️ `currentStage` in overview vs bracket auto-select

`/api/overview` returns `currentStage` as the most advanced stage with a **finished** match.
The bracket's auto-select finds the first round with an **unresolved** match. These differ
by one stage (e.g. if QFs are all finished, overview says "Quarterfinals" but bracket jumps
to "Semifinals"). This is intentional and correct — overview shows where we've been;
bracket shows what's next.

### ⚠️ Mock fixtures are out of date

`web/src/mocks/fixtures.ts` was written for early dev and uses fictional data. It is now
**opt-in** only (`VITE_MOCKS=on`) and the real API is the default. The mocks don't need
updating unless you want offline UI development without the API running.

---

## 11. File structure reference

```
sweepstake/
├─ CLAUDE.md                    ← read every session (conventions + state)
├─ package.json                 ← root scripts incl. dev:group-stage / dev:quarters / dev:final
├─ datasets/
│  ├─ teams.csv                 ← 48 teams (all placeholders now resolved)
│  ├─ matches.csv               ← 104 matches (match #100 label bug fixed in loader)
│  ├─ player_picks.csv          ← 6 players × 8 teams (messy; normalized by WP1 pipeline)
│  ├─ picks.normalized.json     ← generated; 48/48 matched
│  └─ scenarios/
│     ├─ group-stage.json       ← demo: matchday 1+2 done
│     ├─ quarterfinals.json     ← demo: through R16
│     └─ final.json             ← demo: Mexico vs Tunisia final
├─ shared/src/
│  ├─ types.ts                  ← ALL domain types (source of truth)
│  ├─ contract.ts               ← ALL REST routes + response shapes
│  └─ index.ts
├─ server/src/
│  ├─ index.ts                  ← bootstrap (dotenv, loadDataset, createProvider, app.listen)
│  ├─ app.ts                    ← createApp() factory (used by routes + tests)
│  ├─ env.ts                    ← typed config from process.env
│  ├─ data/
│  │  ├─ dataset.ts             ← loadDataset() — the unified entry point
│  │  ├─ teams.ts / matches.ts / stages.ts / venues.ts / picks.ts
│  │  ├─ validate.ts            ← referential integrity checks
│  │  ├─ normalize.ts / aliases.ts  ← picks name normalization
│  │  ├─ generateScenarios.ts   ← scenario builder (run via npm run generate:scenarios)
│  │  └─ generatePicksReport.ts ← picks audit report (npm run report:picks)
│  ├─ engine/
│  │  ├─ standings.ts           ← group tables + FIFA tie-breakers
│  │  ├─ qualification.ts       ← top-2 + best-8 thirds
│  │  ├─ status.ts              ← TeamStatus per team + GDs
│  │  ├─ scoring.ts             ← DEFAULT_SCORING + buildLeaderboard()
│  │  └─ index.ts               ← re-exports all engine functions
│  ├─ providers/
│  │  ├─ types.ts               ← ResultsProvider interface + DTOs
│  │  ├─ seedProvider.ts        ← offline / scenario file loader
│  │  ├─ footballApiProvider.ts ← live football-data.org provider
│  │  └─ index.ts               ← createProvider(teams, matches, config)
│  ├─ services/
│  │  ├─ applyResults.ts        ← overlay provider data onto canonical matches
│  │  ├─ appState.ts            ← computeAppState() + createAppStateService() (cached)
│  │  └─ responses.ts           ← pure builders for each endpoint response shape
│  └─ routes/
│     └─ index.ts               ← Express Router — all 9 /api/* endpoints
├─ web/src/
│  ├─ main.tsx                  ← entry point; MSW opt-in (VITE_MOCKS=on)
│  ├─ App.tsx                   ← routes: / /players /players/:id /groups /bracket /schedule
│  ├─ lib/
│  │  ├─ api.ts                 ← queryClient + all useXxx hooks + useTeamMap + useMatchMap
│  │  └─ format.ts              ← formatDay / formatTime
│  ├─ components/
│  │  ├─ Crest.tsx              ← FIFA code badge (no external images needed)
│  │  ├─ StatusChip.tsx         ← alive/out/upcoming/champion chips (colour + label)
│  │  ├─ TeamRow.tsx            ← team name + group + status in a list row
│  │  ├─ FixtureRow.tsx         ← home vs score/time vs away with player highlight
│  │  ├─ BracketMatchCard.tsx   ← single bracket match card (home, score/time, away)
│  │  ├─ chrome.tsx             ← <Header> + <BottomNav> (Players/Groups/Bracket/Schedule)
│  │  └─ states.tsx             ← <LoadingState> <EmptyState> <ErrorState>
│  ├─ features/
│  │  ├─ players/
│  │  │  ├─ PlayersScreen.tsx   ← leaderboard (tappable cards → detail)
│  │  │  └─ PlayerDetailScreen.tsx ← player card + teams + fixtures
│  │  ├─ groups/
│  │  │  └─ GroupsScreen.tsx    ← 12 group standings tables
│  │  ├─ bracket/
│  │  │  └─ BracketScreen.tsx   ← round selector (auto-active) + player filter + cards
│  │  └─ schedule/
│  │     └─ ScheduleScreen.tsx  ← matches grouped by local date
│  └─ mocks/                    ← MSW handlers + fixtures (opt-in only, VITE_MOCKS=on)
└─ docs/
   ├─ HANDOFF.md                ← this file
   ├─ IMPLEMENTATION_PLAN.md    ← work packages + status
   ├─ ARCHITECTURE.md           ← data flow, REST contract, env/config
   ├─ DATA_AND_RULES.md         ← dataset docs, normalization, 2026 tournament rules
   ├─ DEVELOPMENT.md            ← commands, scenario system, feature recipes
   └─ PICKS_MAPPING_REPORT.md   ← generated; 48/48 picks matched, signed off
```

---

## 12. What WP8 (the final work package) covers

WP8 is cross-cutting polish. Prioritise in this order:

### 12a. Accessibility

- Status chips must never rely on colour alone (they already have labels/icons — verify contrast)
- Tab / focus order should flow naturally on the Players and Bracket screens
- Touch targets: minimum 44×44px (especially the round selector chips and player filter)
- `aria-label` on icon-only buttons; `role="status"` on loading states
- Run Lighthouse / axe in Chrome DevTools on each screen

### 12b. Live API smoke test

- Set `DATA_SOURCE=live` in `server/.env` with the real API key
- Verify all 9 endpoints return valid data
- Verify the `/api/health` `lastUpdated` timestamp updates on each fetch
- Verify the provider correctly falls back to stale cache if the API is rate-limited

### 12c. Edge-case UI states

- What does the Players screen look like mid-group-stage when 0 teams are eliminated? (all "upcoming")
- What does the bracket show pre-R32 (all knockout slots null)?
- What does the player detail show for a player whose team did not qualify (null teamId pick)?
  Currently there are no null teamId picks (all 48/48 matched) but the code should handle it gracefully.

### 12d. README

Write `README.md` that lets a fresh clone get running in one command:

- Prerequisites (Node 22, npm 10+)
- `npm install && npm run dev` → web at http://localhost:5173
- How to use live mode (copy `.env.example`, add key)
- How to use scenario commands for demo/testing
- Screenshot of the leaderboard, group standings, and bracket

### 12e. Performance

- Lighthouse on the Players screen (largest render). Target ≥90 Performance score.
- React Query's `staleTime: 30_000` is already set. Verify the API TTL cache works.
- No layout shift on initial load (StatusChip sizes are fixed; `Crest` uses a fixed square)

---

## 13. Scoring rules (confirmed, do not change without asking the user)

**Sort order:** aliveCount ↓ → furthestStage ↓ → points ↓ → goalDifference ↓ → playerId ↑

**Points per furthest stage reached:**

```
Group Stage: 0 pts
Round of 32: 1 pt
Round of 16: 2 pts
Quarterfinals: 4 pts
Semifinals: 6 pts
Third Place Playoff: 6 pts  (same as SF — losers of both SFs played here)
Final: 8 pts
Champion (wins Final): 12 pts  (8 + 4 bonus)
```

**Goal difference** is a _tracked display metric_, not a tiebreaker that changes rank.
It shows as `GD ±n` alongside points on leaderboard cards and player detail headers.

---

## 14. Conventions reminder (critical for the next agent)

- **ESM only.** No `require()`, no CommonJS.
- **TypeScript `strict`** everywhere. No `any`, no type assertions unless unavoidable.
- **Types only from `@sweepstake/shared`** — never re-declare domain types in `server/` or `web/`.
- **Tailwind v4 — no `tailwind.config.js`.** Customise via `@theme` in `web/src/index.css`.
- **Engine = pure functions.** No I/O in `server/src/engine/`. Each has a co-located `.test.ts`.
- **Live API always behind `ResultsProvider`.** Never call football-data.org from `web/`.
- **Never commit secrets.** API key lives in `server/.env` (gitignored).
- **Prefer editing existing files** to creating new ones.
- **No comments unless the WHY is genuinely non-obvious.**
- When a feature is done: run `npm run build && npm run lint && npm run test`, verify in preview at 390×844, then commit.
