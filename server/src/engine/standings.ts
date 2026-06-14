import type { GroupLetter, GroupStandingRow, GroupTable, Match, Team } from '@sweepstake/shared';

interface Acc {
  teamId: number;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
}

const emptyAcc = (teamId: number): Acc => ({
  teamId,
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 0,
  goalsAgainst: 0,
});

const pointsOf = (a: Acc): number => a.won * 3 + a.drawn;
const gdOf = (a: Acc): number => a.goalsFor - a.goalsAgainst;

/** FIFA "overall" order: points, then goal difference, then goals scored (all descending). */
function compareOverall(a: Acc, b: Acc): number {
  return pointsOf(b) - pointsOf(a) || gdOf(b) - gdOf(a) || b.goalsFor - a.goalsFor;
}

/**
 * Accumulate counted matches into a stats table for the given teams. Matches involving a team
 * outside `teamIds` are ignored, which lets the same function build a head-to-head mini-table.
 * **Live matches count provisionally** from their current scoreline (so the table moves in-play);
 * scheduled matches are skipped.
 */
function accumulate(teamIds: number[], matches: Match[]): Map<number, Acc> {
  const accs = new Map<number, Acc>(teamIds.map((id) => [id, emptyAcc(id)]));
  for (const m of matches) {
    if ((m.status !== 'finished' && m.status !== 'live') || !m.result) continue;
    if (m.homeTeamId === null || m.awayTeamId === null) continue;
    const home = accs.get(m.homeTeamId);
    const away = accs.get(m.awayTeamId);
    if (!home || !away) continue;

    const { homeScore, awayScore } = m.result;
    home.played++;
    away.played++;
    home.goalsFor += homeScore;
    home.goalsAgainst += awayScore;
    away.goalsFor += awayScore;
    away.goalsAgainst += homeScore;
    if (homeScore > awayScore) {
      home.won++;
      away.lost++;
    } else if (homeScore < awayScore) {
      away.won++;
      home.lost++;
    } else {
      home.drawn++;
      away.drawn++;
    }
  }
  return accs;
}

/** Resolve a set of tied teams by head-to-head (points, GD, GF), then team id as a stable fallback. */
function headToHead(tied: Acc[], matches: Match[]): Acc[] {
  const mini = accumulate(
    tied.map((a) => a.teamId),
    matches,
  );
  return [...tied].sort((x, y) => {
    const mx = mini.get(x.teamId) ?? emptyAcc(x.teamId);
    const my = mini.get(y.teamId) ?? emptyAcc(y.teamId);
    return compareOverall(mx, my) || x.teamId - y.teamId;
  });
}

function rankTeams(accs: Acc[], matches: Match[]): Acc[] {
  const byOverall = [...accs].sort(compareOverall);
  const ranked: Acc[] = [];
  let i = 0;
  while (i < byOverall.length) {
    let j = i + 1;
    while (j < byOverall.length && compareOverall(byOverall[i], byOverall[j]) === 0) j++;
    const tied = byOverall.slice(i, j);
    ranked.push(...(tied.length === 1 ? tied : headToHead(tied, matches)));
    i = j;
  }
  return ranked;
}

const toRow = (a: Acc, index: number): GroupStandingRow => ({
  teamId: a.teamId,
  played: a.played,
  won: a.won,
  drawn: a.drawn,
  lost: a.lost,
  goalsFor: a.goalsFor,
  goalsAgainst: a.goalsAgainst,
  goalDifference: gdOf(a),
  points: pointsOf(a),
  rank: index + 1,
});

/** Standings table for one group, computed from its finished matches. */
export function computeGroupStandings(
  group: GroupLetter,
  teams: Team[],
  matches: Match[],
): GroupTable {
  const groupTeamIds = teams.filter((t) => t.group === group).map((t) => t.id);
  const groupMatches = matches.filter((m) => m.stage === 'Group Stage' && m.group === group);
  const accs = accumulate(groupTeamIds, groupMatches);
  const ranked = rankTeams([...accs.values()], groupMatches);
  return { group, rows: ranked.map(toRow) };
}

/** Standings for all 12 groups (A–L). */
export function computeAllGroupStandings(teams: Team[], matches: Match[]): GroupTable[] {
  const groups = [...new Set(teams.map((t) => t.group))]
    .filter((g): g is GroupLetter => g !== null)
    .sort();
  return groups.map((g) => computeGroupStandings(g, teams, matches));
}
