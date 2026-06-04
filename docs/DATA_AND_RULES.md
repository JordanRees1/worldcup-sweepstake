# Data & Tournament Rules

This is the domain reference for the data pipeline (WP1) and the engine (WP2).

## 1. Source datasets (`datasets/`)

| File                    | Rows | Columns                                                                      | Notes |
|-------------------------|------|------------------------------------------------------------------------------|-------|
| `teams.csv`             | 48   | `id, team_name, fifa_code, group_letter, is_placeholder`                     | 12 groups A–L, 4 each. 6 rows are placeholders. |
| `matches.csv`           | 104  | `id, match_number, home_team_id, away_team_id, city_id, stage_id, kickoff_at, match_label` | Group games have team IDs; knockouts have empty team IDs + a `match_label` encoding. |
| `tournament_stages.csv` | 7    | `id, stage_name, stage_order`                                                | Group Stage→Round of 32→Round of 16→Quarterfinals→Semifinals→Third Place Playoff→Final. |
| `host_cities.csv`       | 16   | `id, city_name, country, venue_name, region_cluster, airport_code`           | Venues across USA/Canada/Mexico; `region_cluster` ∈ East/Central/West. |
| `player_picks.csv`      | 48   | `player, team`                                                               | 6 players × 8 teams. Raw, messy names — see §3. |

### Placeholders in `teams.csv` (6 — now resolved)

> **Resolved (June 2026):** all six slots are filled with the March 2026 playoff winners, so
> `teams.csv` no longer contains placeholders. Historical context below.
`Winner UEFA Playoff A/B/C/D` (codes `UEPA/UEPB/UEPC/UEPD`) and `Winner FIFA Playoff 1/2`
(`FP01/FP02`). These slots are filled by playoff winners; treat `is_placeholder=True` teams as
“not yet a real team” until resolved (by the API, or by the user updating `teams.csv`).

### `matches.csv` label encodings
- **Group:** real `home_team_id`/`away_team_id`; `match_label` = `Group X`.
- **Round of 32 (73–88):** positional, e.g. `2A vs 2B` (runner-up A vs runner-up B),
  `1C vs 2F` (winner C vs runner-up F), and **best-thirds** like `1E vs 3ABCDF`
  (group-E winner vs the third-placed team from one of groups A/B/C/D/F per the FIFA table).
- **Round of 16 → Final (89–104):** reference encodings — `W73 vs W75` (winners of those
  matches), `RU101 vs RU102` (the two losing semfinalists → third-place playoff),
  `W101 vs W102` (the Final).
- `kickoff_at` carries a per-venue UTC offset (e.g. `-06`, `-04`, `-07`). Parse as timezone-aware.

> **Known bug:** match **#100** label is `W95 vs W100` (self-referential). It should be
> `W95 vs W96`. Fix this in the loader/normalization step and add a regression test.

## 2. Canonical data model
The authoritative TypeScript types live in `shared/src/types.ts`. Core entities:
`Team`, `Venue`, `Stage`, `Match` (+ `MatchResult`, `MatchStatus`), `GroupStandingRow`,
`TeamStatus`, `Player`, `Pick`, `PlayerSummary`. The loader’s job is CSV → these types; the
engine’s job is to fill the dynamic fields (`result`, `status`, standings, leaderboard).

## 3. Picks normalization & reconciliation (WP1)

> **Update (June 2026, signed off):** the March 2026 playoffs are resolved and applied to
> `teams.csv`. Six contingent picks became real teams (DR Congo, Iraq, Bosnia and Herzegovina,
> Sweden, Türkiye, Czechia); **Wales** is the only dead pick (did not qualify). Net result:
> **47 matched, 1 did-not-qualify, 0 unmatched**, and **Croatia** is the one team nobody picked.
> (UEFA winners were assigned to slots A–D in the order listed; adjust the `group` column in
> `teams.csv` if the official playoff-path → group mapping differs.) The tables below are kept
> as the original reconciliation context.
Decision: **normalize automatically, then hand the user a report to confirm.** Produce
`datasets/picks.normalized.json` plus `docs/PICKS_MAPPING_REPORT.md`.

### 3a. Direct name fixes (typos / variants → canonical)
| Raw in `player_picks.csv` | Canonical team        | FIFA |
|---------------------------|-----------------------|------|
| `Sengal`                  | Senegal               | SEN  |
| `Uzbekisan`               | Uzbekistan            | UZB  |
| `Ivory Coast`             | Côte d'Ivoire         | CIV  |
| `Curacao`                 | Curaçao               | CUR  |
| `Iran`                    | IR Iran               | IRN  |

Implement as a maintained alias map (`server/src/data/aliases.ts`). Matching should be
accent/case-insensitive first, then fall back to the alias map, then mark `matched:false`.

### 3b. Playoff-contingent picks (team not yet confirmed)
These raw picks are teams still competing in the inter-confederation / UEFA playoffs and map to
a *placeholder slot*, not a confirmed team:

| Raw pick   | Playoff route        | Resolution |
|------------|----------------------|------------|
| `Sweden`   | UEFA playoff         | maps to one of `UEPA…UEPD` **if** they qualify |
| `Wales`    | UEFA playoff         | ″ |
| `Turkiye`  | UEFA playoff         | ″ |
| `Czechia`  | UEFA playoff         | ″ |
| `Bosnia`   | UEFA playoff         | ″ |
| `DR Congo` | FIFA playoff         | maps to `FP01/FP02` if they qualify |
| `Iraq`     | FIFA playoff         | ″ |

There are **7 playoff-contingent picks for 6 placeholder slots**, so at least one is already
out. Handling: status `did_not_qualify` (counts as not-alive, furthest stage “Did Not
Qualify”). The exact slot each qualifier fills is determined by the API (preferred) or by the
user updating `teams.csv`; until then show “awaiting playoff”.

### 3c. Reconciliation outputs (acceptance)
The pipeline must report: total picks (expect 48), matched-confirmed, matched-placeholder,
unmatched; any **confirmed team that no player picked**; any team picked by **more than one**
player (should be none); and a per-player count (expect 8 each). The report is the artifact the
user signs off.

## 4. Tournament rules — World Cup 2026
- **Format:** 48 teams, 12 groups of 4, single round-robin (6 games/group → 72 group matches).
- **Advancement to Round of 32:** top 2 of every group (24) **+ the 8 best third-placed teams**
  of the 12.
- **Group standings order (configurable; FIFA default):**
  1. Points (W3/D1/L0) · 2. Goal difference · 3. Goals scored ·
  4. Head-to-head among teams still level (points → GD → goals) ·
  5. Disciplinary/fair-play points · 6. Drawing of lots.
  Implement with a clear, swappable comparator and unit tests for tie scenarios.
- **Best third-placed ranking:** rank all 12 third-placed teams by the same criteria; the top 8
  qualify. **Which R32 slot each occupies** follows FIFA’s published combination table keyed by
  *which* groups’ thirds qualified. This slot-assignment is complex — **prefer the API’s
  resolved R32 fixtures**; only implement the full table if we go API-independent. The engine
  must still compute *whether* a given third qualifies (top-8 ranking) for team status.
- **Knockouts:** single elimination; if level after 90′, extra time then penalties → there is
  always a winner. Resolve the tree by following the label encodings (W## / RU##).
- **Champion:** winner of match #104.

## 5. Team status & player scoring
### Status values (engine output per team)
`upcoming` (tournament/team not started or unresolved placeholder) · `alive` (still in,
annotated with current stage & next match) · `eliminated` (with the stage it went out) ·
`champion` · `did_not_qualify` (placeholder/playoff pick that never became a real entrant).

“Still in as of date D” = team has not lost a knockout tie and (group stage) is not yet
mathematically eliminated. Simplest correct rule for MVP: a team is `alive` until a finished
match eliminates it (group: fails to reach top-2/best-third once its group is decided;
knockout: loses its tie).

### Scoring / leaderboard (PROPOSED — needs user confirmation)
Default sort: **(1) teams still alive (desc) → (2) furthest stage reached → (3) points.**
Proposed points per team by furthest stage reached:
`Group 0 · R32 1 · R16 2 · QF 4 · SF 6 · Final 8 · Champion 12` (summed across a player’s teams).
Open question for the user: is the sweepstake “**owner of the winning team wins**”, a
cumulative-points league, or “**last player with a team standing**”? Make the rule a small
config (`server/src/engine/scoring.ts`) so it’s trivial to change.
