import type {
  Match,
  Pick,
  Player,
  PlayerSummary,
  PlayerTeam,
  StageName,
  Team,
  TeamStatus,
} from '@sweepstake/shared';

// Stage display-order used for leaderboard sorting (a late tiebreaker) and for each player's
// "furthest stage" stat. Third Place Playoff sits at the same tier as Semifinals — those teams
// also lost a semi; 3rd place is an honorary continuation.
const STAGE_SORT_ORDER: Record<StageName | 'Did Not Qualify', number> = {
  'Did Not Qualify': 0,
  'Group Stage': 1,
  'Round of 32': 2,
  'Round of 16': 3,
  'Quarterfinals': 4,
  'Semifinals': 5,
  'Third Place Playoff': 5,
  'Final': 6,
};

export interface ScoringConfig {
  /** Points for winning a match — group or knockout (a penalty-shootout win counts as a win). */
  pointsPerWin: number;
  /** Points for each team in a drawn match (group stage only; knockouts always have a winner). */
  pointsPerDraw: number;
  /** Penalty for a player whose teams have played ≥1 game and lost every single one. */
  woodenSpoonPenalty: number;
}

/**
 * Default scoring rule (confirmed by user): **pure game points, with teeth**.
 *   Win +3 (group or knockout, incl. penalty-shootout wins) · Group draw +1 each.
 *   Loss → minus the goal-difference margin of that match (lose 1–3 → −2; level score lost on pens → 0).
 *   🥄 Wooden spoon → −50 to any player whose teams have played at least one game and lost them all.
 * Reaching later stages is rewarded implicitly — deeper teams play and win more games.
 * Goal difference is also tracked separately as a tiebreaker.
 */
export const DEFAULT_SCORING: ScoringConfig = {
  pointsPerWin: 3,
  pointsPerDraw: 1,
  woodenSpoonPenalty: -50,
};

/** Per-team running tally across counted matches (finished + live, the latter provisional). */
export interface TeamScoreRecord {
  /** Match points: win +pointsPerWin, draw +pointsPerDraw, loss + (negative) goal margin. */
  points: number;
  won: number;
  drawn: number;
  lost: number;
  played: number;
}

/**
 * Tally every team's record + match points across all counted matches (group + knockout).
 * Win → `pointsPerWin`; draw → `pointsPerDraw` (group stage only); loss → the loser's (negative)
 * goal difference for that match.
 *
 * **Live matches count provisionally** from their current scoreline — so an in-play game moves the
 * leaderboard. The one exception: a live knockout sitting level has no result yet (knockouts can't
 * draw), so it contributes nothing until someone leads or it finishes. Scheduled matches are skipped.
 */
export function computeTeamScores(
  matches: Match[],
  config: ScoringConfig = DEFAULT_SCORING,
): Map<number, TeamScoreRecord> {
  const records = new Map<number, TeamScoreRecord>();
  const rec = (id: number): TeamScoreRecord => {
    let r = records.get(id);
    if (!r) {
      r = { points: 0, won: 0, drawn: 0, lost: 0, played: 0 };
      records.set(id, r);
    }
    return r;
  };

  for (const m of matches) {
    if ((m.status !== 'finished' && m.status !== 'live') || !m.result) continue;
    if (m.homeTeamId === null || m.awayTeamId === null) continue;

    const { winnerTeamId, homeScore, awayScore } = m.result;

    // Resolve the winner from winnerTeamId when present, else from the scoreline.
    let winnerId: number | null;
    if (winnerTeamId != null) winnerId = winnerTeamId;
    else if (homeScore > awayScore) winnerId = m.homeTeamId;
    else if (awayScore > homeScore) winnerId = m.awayTeamId;
    else winnerId = null;

    // A level scoreline only counts as a draw in the group stage; a level knockout (only possible
    // while live) hasn't produced a result, so skip it entirely — no provisional points, no "played".
    if (winnerId === null && m.stage !== 'Group Stage') continue;

    const home = rec(m.homeTeamId);
    const away = rec(m.awayTeamId);
    home.played++;
    away.played++;

    if (winnerId === null) {
      home.drawn++;
      away.drawn++;
      home.points += config.pointsPerDraw;
      away.points += config.pointsPerDraw;
    } else {
      const homeWon = winnerId === m.homeTeamId;
      const winner = homeWon ? home : away;
      const loser = homeWon ? away : home;
      // The loser's goal difference for this match (≤ 0) is added straight to its points.
      const loserGd = homeWon ? awayScore - homeScore : homeScore - awayScore;
      winner.won++;
      winner.points += config.pointsPerWin;
      loser.lost++;
      loser.points += loserGd;
    }
  }
  return records;
}

/** A player's total goal difference across all their teams. */
export function computePlayerGoalDifference(
  teamIds: number[],
  teamGDs: Map<number, number>,
): number {
  return teamIds.reduce((sum, id) => sum + (teamGDs.get(id) ?? 0), 0);
}

function stageOrder(stage: StageName | 'Did Not Qualify'): number {
  return STAGE_SORT_ORDER[stage] ?? 0;
}

/**
 * Build a ranked `PlayerSummary[]` from the current tournament state.
 * Points = the sum of each team's match points (see `computeTeamScores`) plus the wooden-spoon
 * penalty when every one of a player's played games was a loss.
 * Sort order: points ↓ → goalDifference ↓ → aliveCount ↓ → furthestStage ↓ → playerId ↑.
 */
export function buildLeaderboard(
  players: Player[],
  picks: Pick[],
  teams: Team[],
  teamStatuses: Map<number, TeamStatus>,
  teamGDs: Map<number, number>,
  teamScores: Map<number, TeamScoreRecord>,
  config: ScoringConfig = DEFAULT_SCORING,
): PlayerSummary[] {
  const teamById = new Map(teams.map((t) => [t.id, t]));

  const raw = players.map((player) => {
    const playerTeams: PlayerTeam[] = picks
      .filter((p) => p.playerId === player.id && p.teamId !== null)
      .flatMap((p) => {
        const team = teamById.get(p.teamId!);
        const status = teamStatuses.get(p.teamId!);
        return team && status ? [{ team, status }] : [];
      });

    const aliveCount = playerTeams.filter((pt) => pt.status.alive).length;

    let basePoints = 0;
    let played = 0;
    let wins = 0;
    let draws = 0;
    for (const pt of playerTeams) {
      const r = teamScores.get(pt.team.id);
      if (!r) continue;
      basePoints += r.points;
      played += r.played;
      wins += r.won;
      draws += r.drawn;
    }
    // Wooden spoon: played at least one game and didn't manage a single win or draw.
    const woodenSpoon = played > 0 && wins === 0 && draws === 0 ? config.woodenSpoonPenalty : 0;
    const points = basePoints + woodenSpoon;

    const goalDifference = computePlayerGoalDifference(
      playerTeams.map((pt) => pt.team.id),
      teamGDs,
    );
    const furthestStage = playerTeams.reduce<StageName | 'Did Not Qualify'>(
      (best, pt) =>
        stageOrder(pt.status.furthestStage) > stageOrder(best) ? pt.status.furthestStage : best,
      'Group Stage',
    );

    return { player, aliveCount, furthestStage, points, goalDifference, teams: playerTeams };
  });

  raw.sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.aliveCount - a.aliveCount ||
      stageOrder(b.furthestStage) - stageOrder(a.furthestStage) ||
      a.player.id - b.player.id,
  );

  return raw.map((s, i) => ({ ...s, rank: i + 1 }));
}
