import { STAGE_NAMES, type PlayerTeam, type TeamOutcome } from '@sweepstake/shared';

/** Ordinal of a stage in tournament order (Group Stage = 0 … Final = 6); -1 for 'Did Not Qualify'. */
export function stageRank(stage: string): number {
  return (STAGE_NAMES as readonly string[]).indexOf(stage);
}

const OUTCOME_RANK: Record<TeamOutcome, number> = {
  champion: 0,
  alive: 1,
  upcoming: 2,
  eliminated: 3,
  did_not_qualify: 4,
};

/**
 * Sort a player's teams for display: alive teams (and the champion) first, out teams last.
 * Within a tier, deeper tournament runs come first, then alphabetical for stable ordering.
 */
export function sortPlayerTeams(teams: PlayerTeam[]): PlayerTeam[] {
  return [...teams].sort((a, b) => {
    const byOutcome = OUTCOME_RANK[a.status.outcome] - OUTCOME_RANK[b.status.outcome];
    if (byOutcome !== 0) return byOutcome;
    const byStage = stageRank(b.status.furthestStage) - stageRank(a.status.furthestStage);
    if (byStage !== 0) return byStage;
    return a.team.name.localeCompare(b.team.name);
  });
}
