import type { GroupLetter, GroupTable, Match } from '@sweepstake/shared';
import { compareThirds, type RankedThird } from './qualification';
import { R32_THIRD_ALLOCATION, R32_THIRD_WINNER_ORDER } from './r32ThirdAllocation';

/**
 * Resolving knockout fixtures from group standings. The R32 fixtures in `matches.csv` use label
 * encodings — positional (`1C`, `2F`), best-third (`3ABCDF`), and reference (`W73`, `RU101`). This
 * module turns those into team ids, and projects an "as it stands" Round of 32 from the current
 * (possibly incomplete) standings. Shared by the runtime bracket and the scenario generator.
 */

// ── Best-third slot assignment ────────────────────────────────────────────────

/** Each R32 best-third slot accepts a 3rd-placed team from a specific set of groups. */
export const R32_BEST_THIRD_SLOTS: ReadonlyArray<{ matchId: number; groups: GroupLetter[] }> = [
  { matchId: 75, groups: ['A', 'B', 'C', 'D', 'F'] },
  { matchId: 78, groups: ['C', 'D', 'F', 'G', 'H'] },
  { matchId: 79, groups: ['C', 'E', 'F', 'H', 'I'] },
  { matchId: 80, groups: ['E', 'H', 'I', 'J', 'K'] },
  { matchId: 81, groups: ['A', 'E', 'H', 'I', 'J'] },
  { matchId: 82, groups: ['B', 'E', 'F', 'I', 'J'] },
  { matchId: 85, groups: ['E', 'F', 'G', 'I', 'J'] },
  { matchId: 88, groups: ['D', 'E', 'I', 'J', 'L'] },
];

/** Which R32 match each group-WINNER best-third slot is, keyed by the winner's group letter. */
const WINNER_TO_MATCH: Record<string, number> = { A: 79, B: 85, D: 82, E: 75, G: 81, I: 78, K: 88, L: 80 };

/**
 * The official allocation (FIFA regulations Annexe C): for the exact set of 8 qualifying thirds,
 * look up which group's third fills each winner slot. Returns null when fewer than 8 thirds are
 * known or the combination isn't in the table, so the caller can fall back to the heuristic.
 */
function officialBestThirds(qualifyingThirds: RankedThird[]): Map<number, number> | null {
  if (qualifyingThirds.length !== 8) return null;
  const teamByGroup = new Map<GroupLetter, number>(
    qualifyingThirds.map((t) => [t.group, t.row.teamId]),
  );
  const key = [...teamByGroup.keys()].sort().join('');
  const row = R32_THIRD_ALLOCATION[key];
  if (!row || row.length !== R32_THIRD_WINNER_ORDER.length) return null;

  const assignments = new Map<number, number>();
  R32_THIRD_WINNER_ORDER.forEach((winner, i) => {
    const thirdGroup = row[i] as GroupLetter;
    const teamId = teamByGroup.get(thirdGroup);
    const matchId = WINNER_TO_MATCH[winner];
    if (teamId !== undefined && matchId !== undefined) assignments.set(matchId, teamId);
  });
  return assignments.size === 8 ? assignments : null;
}

/**
 * Assign 8 qualifying thirds to R32 best-third slots. Uses the **official Annexe C** allocation when
 * the full set of 8 is known; otherwise falls back to a "most constrained first" heuristic (groups
 * with the fewest eligible slots, e.g. K/L, placed first) — used for partial "as it stands" sets.
 */
export function assignBestThirds(qualifyingThirds: RankedThird[]): Map<number, number> {
  const official = officialBestThirds(qualifyingThirds);
  if (official) return official;

  const assignments = new Map<number, number>(); // matchId → teamId
  const usedGroups = new Set<GroupLetter>();

  const ranked = qualifyingThirds.map((t) => ({
    third: t,
    eligible: R32_BEST_THIRD_SLOTS.filter((s) => s.groups.includes(t.group)),
  }));
  ranked.sort((a, b) => a.eligible.length - b.eligible.length);

  for (const { third, eligible } of ranked) {
    if (usedGroups.has(third.group)) continue;
    const remaining = ranked.filter(({ third: t }) => !usedGroups.has(t.group) && t !== third);
    const available = eligible.filter((s) => !assignments.has(s.matchId));
    // Prefer the slot with the fewest remaining options (keep constrained slots free).
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

// ── Label parsing / resolution ──────────────────────────────────────────────────

export type SlotSource =
  | { kind: 'rank'; rank: 1 | 2; group: GroupLetter }
  | { kind: 'best-third'; matchId: number }
  | { kind: 'winner'; matchId: number }
  | { kind: 'loser'; matchId: number };

export function parseSource(frag: string, r32MatchId?: number): SlotSource {
  const rankM = frag.match(/^([12])([A-L])$/);
  if (rankM) return { kind: 'rank', rank: Number(rankM[1]) as 1 | 2, group: rankM[2] as GroupLetter };
  if (frag.match(/^3[A-L]+$/) && r32MatchId !== undefined) return { kind: 'best-third', matchId: r32MatchId };
  const winM = frag.match(/^W(\d+)$/);
  if (winM) return { kind: 'winner', matchId: Number(winM[1]) };
  const loserM = frag.match(/^RU(\d+)$/);
  if (loserM) return { kind: 'loser', matchId: Number(loserM[1]) };
  throw new Error(`Unrecognised slot source: "${frag}"`);
}

export function resolveSource(
  source: SlotSource,
  tables: GroupTable[],
  bestThirds: Map<number, number>,
  winners: Map<number, number>,
  losers: Map<number, number>,
): number | null {
  switch (source.kind) {
    case 'rank':
      return (
        tables.find((t) => t.group === source.group)?.rows.find((r) => r.rank === source.rank)
          ?.teamId ?? null
      );
    case 'best-third':
      return bestThirds.get(source.matchId) ?? null;
    case 'winner':
      return winners.get(source.matchId) ?? null;
    case 'loser':
      return losers.get(source.matchId) ?? null;
  }
}

// ── "As it stands" Round of 32 projection ────────────────────────────────────────

/** Every group's current 3rd-placed team, ranked best → worst by the FIFA third-place criteria. */
export function rankAllThirds(tables: GroupTable[]): RankedThird[] {
  const thirds: RankedThird[] = [];
  for (const t of tables) {
    const row = t.rows.find((r) => r.rank === 3);
    if (row) thirds.push({ row, group: t.group });
  }
  return thirds.sort(compareThirds);
}

/**
 * For each knockout fixture whose sides aren't yet decided, work out the teams that *could* fill them:
 * a `W##`/`RU##` slot is fed by match `##`, so its candidates are that match's two participants —
 * but only once both of those are themselves known (the frontier of the bracket). Returns a new array
 * with `homeCandidates`/`awayCandidates` attached where applicable (display-only; e.g. "Germany / Paraguay").
 */
export function attachKnockoutCandidates(matches: Match[]): Match[] {
  const byId = new Map(matches.map((m) => [m.id, m]));
  const candidatesFor = (frag: string): number[] | undefined => {
    const ref = frag.match(/^(?:W|RU)(\d+)$/); // winner OR runner-up — both feed from match ##
    if (!ref) return undefined;
    const feed = byId.get(Number(ref[1]));
    return feed && feed.homeTeamId !== null && feed.awayTeamId !== null
      ? [feed.homeTeamId, feed.awayTeamId]
      : undefined;
  };
  return matches.map((m) => {
    if (m.stage === 'Group Stage') return m;
    const [hf, af] = m.label.split(' vs ').map((s) => s.trim());
    const homeCandidates = m.homeTeamId === null && hf ? candidatesFor(hf) : undefined;
    const awayCandidates = m.awayTeamId === null && af ? candidatesFor(af) : undefined;
    if (!homeCandidates && !awayCandidates) return m;
    return {
      ...m,
      ...(homeCandidates ? { homeCandidates } : {}),
      ...(awayCandidates ? { awayCandidates } : {}),
    };
  });
}

/** One side of a projected R32 fixture. `provisional` = the place isn't yet locked (group undecided). */
export interface ProjectedSide {
  teamId: number | null;
  provisional: boolean;
}

export interface ProjectedR32Match {
  matchId: number;
  home: ProjectedSide;
  away: ProjectedSide;
}

/**
 * Project the Round of 32 from the current group standings ("as it stands"):
 *  - rank slots (1X/2X) are provisional until group X is decided;
 *  - best-third slots are provisional until all 12 groups are decided (the thirds ranking is final).
 * Only the R32 is projected — deeper rounds depend on winners that don't exist yet.
 */
export function projectRound32(
  matches: Match[],
  tables: GroupTable[],
  decidedGroups: Set<GroupLetter>,
): Map<number, ProjectedR32Match> {
  const qualifyingThirds = rankAllThirds(tables).slice(0, 8);
  const bestThirds = assignBestThirds(qualifyingThirds);
  const allDecided = decidedGroups.size === 12;
  const empty = new Map<number, number>();

  const side = (frag: string, matchId: number): ProjectedSide => {
    const src = parseSource(frag, matchId);
    const teamId = resolveSource(src, tables, bestThirds, empty, empty);
    const provisional =
      src.kind === 'rank' ? !decidedGroups.has(src.group)
      : src.kind === 'best-third' ? !allDecided
      : true;
    return { teamId, provisional };
  };

  const out = new Map<number, ProjectedR32Match>();
  for (const m of matches) {
    if (m.stage !== 'Round of 32') continue;
    const [hf, af] = m.label.split(' vs ').map((s) => s.trim());
    if (!hf || !af) continue;
    out.set(m.id, { matchId: m.id, home: side(hf, m.id), away: side(af, m.id) });
  }
  return out;
}
