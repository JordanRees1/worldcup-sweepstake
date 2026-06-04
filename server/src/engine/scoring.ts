import type {
  Pick,
  Player,
  PlayerSummary,
  PlayerTeam,
  StageName,
  Team,
  TeamStatus,
} from '@sweepstake/shared';

// Stage display-order used for leaderboard sorting.
// Third Place Playoff is intentionally at the same tier as Semifinals —
// those teams also lost a semi; 3rd place is an honorary continuation.
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
  /** Points awarded per team based on the furthest stage it reached. */
  pointsByStage: Partial<Record<StageName | 'Did Not Qualify', number>>;
  /** Extra points on top of `Final` for the tournament champion. */
  championBonus: number;
}

/**
 * Default scoring rule (confirmed by user):
 * Group 0 · R32 1 · R16 2 · QF 4 · SF 6 · Final 8 · Champion 12 (8 + 4 bonus).
 * Third Place Playoff = 6 (same as SF, since those teams also reached the semis).
 * Goal difference is a separate tracked metric, not a points component.
 */
export const DEFAULT_SCORING: ScoringConfig = {
  pointsByStage: {
    'Did Not Qualify': 0,
    'Group Stage': 0,
    'Round of 32': 1,
    'Round of 16': 2,
    'Quarterfinals': 4,
    'Semifinals': 6,
    'Third Place Playoff': 6,
    'Final': 8,
  },
  championBonus: 4,
};

/** Points for a single team. */
export function scoreTeam(status: TeamStatus, config: ScoringConfig): number {
  if (status.outcome === 'champion') {
    return (config.pointsByStage['Final'] ?? 8) + config.championBonus;
  }
  return config.pointsByStage[status.furthestStage] ?? 0;
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
 * Sort order: aliveCount ↓ → furthestStage ↓ → points ↓ → goalDifference ↓ → playerId ↑.
 */
export function buildLeaderboard(
  players: Player[],
  picks: Pick[],
  teams: Team[],
  teamStatuses: Map<number, TeamStatus>,
  teamGDs: Map<number, number>,
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
    const points = playerTeams.reduce((s, pt) => s + scoreTeam(pt.status, config), 0);
    const goalDifference = computePlayerGoalDifference(
      playerTeams.map((pt) => pt.team.id),
      teamGDs,
    );
    const furthestStage = playerTeams.reduce<StageName | 'Did Not Qualify'>(
      (best, pt) =>
        stageOrder(pt.status.furthestStage) > stageOrder(best)
          ? pt.status.furthestStage
          : best,
      'Group Stage',
    );

    return { player, aliveCount, furthestStage, points, goalDifference, teams: playerTeams };
  });

  raw.sort(
    (a, b) =>
      b.aliveCount - a.aliveCount ||
      stageOrder(b.furthestStage) - stageOrder(a.furthestStage) ||
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      a.player.id - b.player.id,
  );

  return raw.map((s, i) => ({ ...s, rank: i + 1 }));
}
