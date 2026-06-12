/**
 * Scenario generator — produces pre-built tournament state JSON files for local dev/demo.
 * Run with: npm run generate:scenarios
 *
 * Four scenarios are written to datasets/scenarios/:
 *   group-stage    — matchdays 1 + 2 done, matchday 3 still to play
 *   quarterfinals  — all group + R32 + R16 done; QF slots resolved
 *   final          — everything through SF + 3rd-place; Final slot resolved
 *   live-demo      — matchdays 1 + 2 done + 3 matchday-3 games LIVE (for testing the in-play UI)
 *
 * All finished matches use a deterministic rule: home team always wins 2-1.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GroupLetter, GroupTable, Match } from '@sweepstake/shared';
import {
  computeAllGroupStandings,
  computeDecidedGroups,
  computeQualification,
  type RankedThird,
} from '../engine';
import { loadDataset } from './dataset';
import { DATASETS_DIR } from './paths';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SimResult {
  matchId: number;
  homeScore: number;
  awayScore: number;
  winnerTeamId: number;
}

interface SimSlot {
  matchId: number;
  homeTeamId: number;
  awayTeamId: number;
}

interface SimLive {
  matchId: number;
  homeScore: number;
  awayScore: number;
  minute: number;
}

interface ScenarioFile {
  name: string;
  description: string;
  results: SimResult[];
  slots: SimSlot[];
  live?: SimLive[];
}

// ── Best-third slot assignment ────────────────────────────────────────────────

// Each R32 best-third slot accepts thirds from a specific set of groups.
const R32_BEST_THIRD_SLOTS: ReadonlyArray<{ matchId: number; groups: GroupLetter[] }> = [
  { matchId: 75, groups: ['A', 'B', 'C', 'D', 'F'] },
  { matchId: 78, groups: ['C', 'D', 'F', 'G', 'H'] },
  { matchId: 79, groups: ['C', 'E', 'F', 'H', 'I'] },
  { matchId: 80, groups: ['E', 'H', 'I', 'J', 'K'] },
  { matchId: 81, groups: ['A', 'E', 'H', 'I', 'J'] },
  { matchId: 82, groups: ['B', 'E', 'F', 'I', 'J'] },
  { matchId: 85, groups: ['E', 'F', 'G', 'I', 'J'] },
  { matchId: 88, groups: ['D', 'E', 'I', 'J', 'L'] },
];

/**
 * Assign 8 qualifying thirds to R32 best-third slots.
 * "Most constrained first" — groups K (only 1 slot) and L (only 1 slot) are assigned
 * before groups that have many options, preventing impossible states.
 */
function assignBestThirds(qualifyingThirds: RankedThird[]): Map<number, number> {
  const assignments = new Map<number, number>(); // matchId → teamId
  const usedGroups = new Set<GroupLetter>();

  const ranked = qualifyingThirds.map((t) => ({
    third: t,
    eligible: R32_BEST_THIRD_SLOTS.filter((s) => s.groups.includes(t.group)),
  }));
  // Fewest eligible slots first = most constrained first.
  ranked.sort((a, b) => a.eligible.length - b.eligible.length);

  for (const { third, eligible } of ranked) {
    if (usedGroups.has(third.group)) continue;
    const remaining = ranked.filter(({ third: t }) => !usedGroups.has(t.group) && t !== third);
    const available = eligible.filter((s) => !assignments.has(s.matchId));

    // Among available slots, prefer the one with fewest remaining options (keep constrained slots free).
    available.sort((a, b) => {
      const aOpts = remaining.filter(({ third: t }) => a.groups.includes(t.group)).length;
      const bOpts = remaining.filter(({ third: t }) => b.groups.includes(t.group)).length;
      return aOpts - bOpts;
    });

    const slot = available[0];
    if (slot) {
      assignments.set(slot.matchId, third.row.teamId);
      usedGroups.add(third.group);
    }
  }

  return assignments;
}

// ── Label parsing ─────────────────────────────────────────────────────────────

type SlotSource =
  | { kind: 'rank'; rank: 1 | 2; group: GroupLetter }
  | { kind: 'best-third'; matchId: number }
  | { kind: 'winner'; matchId: number }
  | { kind: 'loser'; matchId: number };

function parseSource(frag: string, r32MatchId?: number): SlotSource {
  const rankM = frag.match(/^([12])([A-L])$/);
  if (rankM) return { kind: 'rank', rank: Number(rankM[1]) as 1 | 2, group: rankM[2] as GroupLetter };
  if (frag.match(/^3[A-L]+$/) && r32MatchId !== undefined) return { kind: 'best-third', matchId: r32MatchId };
  const winM = frag.match(/^W(\d+)$/);
  if (winM) return { kind: 'winner', matchId: Number(winM[1]) };
  const loserM = frag.match(/^RU(\d+)$/);
  if (loserM) return { kind: 'loser', matchId: Number(loserM[1]) };
  throw new Error(`Unrecognised slot source: "${frag}"`);
}

function resolveSource(
  source: SlotSource,
  tables: GroupTable[],
  bestThirds: Map<number, number>,
  winners: Map<number, number>,
  losers: Map<number, number>,
): number | null {
  switch (source.kind) {
    case 'rank':
      return tables.find((t) => t.group === source.group)?.rows.find((r) => r.rank === source.rank)?.teamId ?? null;
    case 'best-third':
      return bestThirds.get(source.matchId) ?? null;
    case 'winner':
      return winners.get(source.matchId) ?? null;
    case 'loser':
      return losers.get(source.matchId) ?? null;
  }
}

// ── Simulation state ──────────────────────────────────────────────────────────

class BracketState {
  readonly results: SimResult[] = [];
  readonly slots: SimSlot[] = [];
  readonly winners = new Map<number, number>();
  readonly losers = new Map<number, number>();

  record(matchId: number, homeTeamId: number, awayTeamId: number): void {
    // Home always wins 2-1.
    this.results.push({ matchId, homeScore: 2, awayScore: 1, winnerTeamId: homeTeamId });
    this.slots.push({ matchId, homeTeamId, awayTeamId });
    this.winners.set(matchId, homeTeamId);
    this.losers.set(matchId, awayTeamId);
  }

  resolveSlotOnly(matchId: number, homeTeamId: number, awayTeamId: number): void {
    // Record the slot without a result (upcoming match whose participants are known).
    this.slots.push({ matchId, homeTeamId, awayTeamId });
  }

  /** Hydrate the dataset matches with current results for engine re-computation. */
  hydrateMatches(matches: Match[]): Match[] {
    return matches.map((m) => {
      const result = this.results.find((r) => r.matchId === m.id);
      if (!result) return m;
      return {
        ...m,
        status: 'finished' as const,
        result: {
          homeScore: result.homeScore,
          awayScore: result.awayScore,
          winnerTeamId: result.winnerTeamId,
        },
      };
    });
  }
}

// ── Stage simulators ──────────────────────────────────────────────────────────

function runGroupStage(matches: Match[], matchdays: 1 | 2 | 3, state: BracketState): void {
  const group = matches
    .filter((m) => m.stage === 'Group Stage')
    .sort((a, b) => a.id - b.id)
    .slice(0, matchdays === 1 ? 24 : matchdays === 2 ? 48 : 72);

  for (const m of group) {
    if (m.homeTeamId !== null && m.awayTeamId !== null) {
      state.record(m.id, m.homeTeamId, m.awayTeamId);
    }
  }
}

function runR32(
  matches: Match[],
  tables: GroupTable[],
  qualifyingThirds: RankedThird[],
  state: BracketState,
): void {
  const bestThirds = assignBestThirds(qualifyingThirds);
  const r32 = matches.filter((m) => m.stage === 'Round of 32').sort((a, b) => a.id - b.id);

  for (const m of r32) {
    const [hf, af] = m.label.split(' vs ').map((s) => s.trim());
    if (!hf || !af) continue;

    const hId = resolveSource(parseSource(hf, m.id), tables, bestThirds, state.winners, state.losers);
    const aId = resolveSource(parseSource(af, m.id), tables, bestThirds, state.winners, state.losers);

    if (hId === null || aId === null) {
      console.warn(`  ⚠ R32 match ${m.id} (${m.label}): could not resolve teams — skipping`);
      continue;
    }
    state.record(m.id, hId, aId);
  }
}

function runKnockoutRound(matches: Match[], stage: string, state: BracketState): void {
  const round = matches.filter((m) => m.stage === stage).sort((a, b) => a.id - b.id);

  for (const m of round) {
    const [hf, af] = m.label.split(' vs ').map((s) => s.trim());
    if (!hf || !af) continue;

    const hId = resolveSource(parseSource(hf), [], new Map(), state.winners, state.losers);
    const aId = resolveSource(parseSource(af), [], new Map(), state.winners, state.losers);

    if (hId === null || aId === null) {
      console.warn(`  ⚠ ${stage} match ${m.id} (${m.label}): could not resolve teams — skipping`);
      continue;
    }
    state.record(m.id, hId, aId);
  }
}

function resolveUpcomingRound(matches: Match[], stage: string, state: BracketState): void {
  const round = matches.filter((m) => m.stage === stage).sort((a, b) => a.id - b.id);

  for (const m of round) {
    const [hf, af] = m.label.split(' vs ').map((s) => s.trim());
    if (!hf || !af) continue;

    const hId = resolveSource(parseSource(hf), [], new Map(), state.winners, state.losers);
    const aId = resolveSource(parseSource(af), [], new Map(), state.winners, state.losers);

    if (hId !== null && aId !== null) state.resolveSlotOnly(m.id, hId, aId);
  }
}

function computeStandings(state: BracketState, dataset: ReturnType<typeof loadDataset>) {
  const hydrated = state.hydrateMatches(dataset.matches);
  const tables = computeAllGroupStandings(dataset.teams, hydrated);
  const decided = computeDecidedGroups(hydrated);
  const qual = computeQualification(tables, decided);
  return { tables, qual };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function write(outDir: string, filename: string, scenario: ScenarioFile): void {
  const path = join(outDir, filename);
  writeFileSync(path, `${JSON.stringify(scenario, null, 2)}\n`, 'utf8');
  console.log(`  ✓ ${scenario.results.length} results, ${scenario.slots.length} slots → ${filename}`);
}

function main(): void {
  const ds = loadDataset();
  const outDir = join(DATASETS_DIR, 'scenarios');
  mkdirSync(outDir, { recursive: true });
  console.log('[generate:scenarios] Dataset loaded — 4 scenarios to build\n');

  // ── Scenario 1: Group Stage (matchday 1+2) ──────────────────────────────────
  console.log('1/4  group-stage  (matchdays 1+2 complete, matchday 3 pending)');
  {
    const state = new BracketState();
    runGroupStage(ds.matches, 2, state);
    write(outDir, 'group-stage.json', {
      name: 'Group Stage — Matchday 2 Complete',
      description:
        'Matchdays 1 and 2 are finished for all 12 groups (48 of 72 group matches played). ' +
        'Matchday 3 is still to come — no group winners are confirmed yet, but some teams are safe or in danger.',
      results: state.results,
      slots: state.slots,
    });
  }

  // ── Scenario 2: Quarterfinals ─────────────────────────────────────────────
  console.log('2/4  quarterfinals  (groups + R32 + R16 done, QF fixtures set)');
  {
    const state = new BracketState();
    runGroupStage(ds.matches, 3, state);
    const { tables, qual } = computeStandings(state, ds);
    runR32(ds.matches, tables, qual.qualifyingThirds, state);
    runKnockoutRound(ds.matches, 'Round of 16', state);
    resolveUpcomingRound(ds.matches, 'Quarterfinals', state);
    write(outDir, 'quarterfinals.json', {
      name: 'Quarterfinals',
      description:
        'All 72 group matches, all 16 Round-of-32 matches, and all 8 Round-of-16 matches are complete. ' +
        '8 teams remain — the Quarterfinal fixtures are set.',
      results: state.results,
      slots: state.slots,
    });
  }

  // ── Scenario 3: Final ────────────────────────────────────────────────────────
  console.log('3/4  final  (through SF + 3rd-place done, Final slot set)');
  {
    const state = new BracketState();
    runGroupStage(ds.matches, 3, state);
    const { tables, qual } = computeStandings(state, ds);
    runR32(ds.matches, tables, qual.qualifyingThirds, state);
    runKnockoutRound(ds.matches, 'Round of 16', state);
    runKnockoutRound(ds.matches, 'Quarterfinals', state);
    runKnockoutRound(ds.matches, 'Semifinals', state);
    runKnockoutRound(ds.matches, 'Third Place Playoff', state);
    resolveUpcomingRound(ds.matches, 'Final', state);
    write(outDir, 'final.json', {
      name: 'World Cup Final',
      description:
        'Every match through the Semifinals and Third Place Playoff is complete. ' +
        'Two finalists remain — the Final is tomorrow.',
      results: state.results,
      slots: state.slots,
    });
  }

  // ── Scenario 4: Live demo (matchday 1+2 done, a few matchday-3 games in progress) ──
  console.log('4/4  live-demo  (matchdays 1+2 done, 3 matchday-3 games LIVE)');
  {
    const state = new BracketState();
    runGroupStage(ds.matches, 2, state);
    // The first three matchday-3 group games (ids just past the 48 already played) go in-play.
    const md3 = ds.matches
      .filter((m) => m.stage === 'Group Stage')
      .sort((a, b) => a.id - b.id)
      .slice(48, 51);
    const liveScores = [
      { home: 1, away: 0, minute: 23 },
      { home: 2, away: 2, minute: 67 },
      { home: 0, away: 1, minute: 88 },
    ];
    const live: SimLive[] = md3.map((m, i) => ({
      matchId: m.id,
      homeScore: liveScores[i].home,
      awayScore: liveScores[i].away,
      minute: liveScores[i].minute,
    }));
    write(outDir, 'live-demo.json', {
      name: 'Live Demo — Matchday 3 In Progress',
      description:
        'Matchdays 1 and 2 are complete; three matchday-3 group games are currently LIVE ' +
        '(running scores + clock) for testing the in-play UI offline.',
      results: state.results,
      slots: state.slots,
      live,
    });
  }

  console.log('\n[generate:scenarios] All done ✓');
}

main();
