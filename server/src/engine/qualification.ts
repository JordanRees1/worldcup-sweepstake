import type { GroupLetter, GroupStandingRow, GroupTable, Match } from '@sweepstake/shared';

export interface RankedThird {
  row: GroupStandingRow;
  group: GroupLetter;
}

export interface QualificationResult {
  /** top-2 qualifiers from each decided group, keyed by teamId */
  groupQualifiers: Map<number, { rank: 1 | 2; group: GroupLetter }>;
  /** all thirds from decided groups, sorted best → worst */
  rankedThirds: RankedThird[];
  /** the top-8 qualifying thirds (empty until all 12 groups are decided) */
  qualifyingThirds: RankedThird[];
  /** union of top-2 qualifiers + qualifying thirds */
  qualifiedTeamIds: Set<number>;
  allGroupsComplete: boolean;
}

/** Groups where all 6 group-stage matches are finished. */
export function computeDecidedGroups(matches: Match[]): Set<GroupLetter> {
  const decided = new Set<GroupLetter>();
  for (const g of 'ABCDEFGHIJKL') {
    const gl = g as GroupLetter;
    const gm = matches.filter((m) => m.stage === 'Group Stage' && m.group === gl);
    if (gm.length === 6 && gm.every((m) => m.status === 'finished')) decided.add(gl);
  }
  return decided;
}

/**
 * FIFA ranking criteria for best third-placed teams:
 * points → GD → GF → wins → teamId (stable tiebreak — stand-in for drawing of lots).
 */
function compareThirds(a: RankedThird, b: RankedThird): number {
  return (
    b.row.points - a.row.points ||
    b.row.goalDifference - a.row.goalDifference ||
    b.row.goalsFor - a.row.goalsFor ||
    b.row.won - a.row.won ||
    a.row.teamId - b.row.teamId
  );
}

export function computeQualification(
  tables: GroupTable[],
  decidedGroups: Set<GroupLetter>,
): QualificationResult {
  const groupQualifiers = new Map<number, { rank: 1 | 2; group: GroupLetter }>();
  const rankedThirds: RankedThird[] = [];

  for (const table of tables) {
    if (!decidedGroups.has(table.group)) continue;
    for (const row of table.rows) {
      if (row.rank === 1) groupQualifiers.set(row.teamId, { rank: 1, group: table.group });
      else if (row.rank === 2) groupQualifiers.set(row.teamId, { rank: 2, group: table.group });
      else if (row.rank === 3) rankedThirds.push({ row, group: table.group });
    }
  }

  rankedThirds.sort(compareThirds);

  const allGroupsComplete = decidedGroups.size === 12;
  const qualifyingThirds = allGroupsComplete ? rankedThirds.slice(0, 8) : [];
  const qualifiedTeamIds = new Set<number>([
    ...groupQualifiers.keys(),
    ...qualifyingThirds.map((t) => t.row.teamId),
  ]);

  return { groupQualifiers, rankedThirds, qualifyingThirds, qualifiedTeamIds, allGroupsComplete };
}
