import type { GroupLetter, GroupTable, Match, StageName, Team, TeamOutcome, TeamStatus } from '@sweepstake/shared';
import type { QualificationResult } from './qualification';

const FINAL_MATCH_ID = 104;

/** Total goal difference per team across all finished matches (group + knockout). */
export function computeTeamGoalDifferences(matches: Match[]): Map<number, number> {
  const gds = new Map<number, number>();
  const add = (id: number, delta: number): void => { gds.set(id, (gds.get(id) ?? 0) + delta); };

  for (const m of matches) {
    if (m.status !== 'finished' || !m.result) continue;
    if (m.homeTeamId === null || m.awayTeamId === null) continue;
    const { homeScore, awayScore } = m.result;
    add(m.homeTeamId, homeScore - awayScore);
    add(m.awayTeamId, awayScore - homeScore);
  }
  return gds;
}

function makeStatus(teamId: number): TeamStatus {
  return { teamId, outcome: 'upcoming', alive: false, furthestStage: 'Group Stage' };
}

/**
 * Compute TeamStatus for every team from the current match state.
 *
 * - Group stage: teams become alive/eliminated once their group is decided.
 *   Rank-3 teams remain alive until all 12 groups are decided, at which point
 *   the best-8 rule is applied.
 * - Knockout: finished matches set the winner (alive/champion) and loser (eliminated).
 *   Scheduled/live matches with resolved team IDs set `nextMatchId`.
 */
export function computeTeamStatuses(
  teams: Team[],
  matches: Match[],
  groupTables: GroupTable[],
  decidedGroups: Set<GroupLetter>,
  qualification: QualificationResult,
): Map<number, TeamStatus> {
  const statuses = new Map<number, TeamStatus>(teams.map((t) => [t.id, makeStatus(t.id)]));

  const set = (id: number, update: Partial<TeamStatus>): void => {
    const s = statuses.get(id);
    if (s) statuses.set(id, { ...s, ...update });
  };

  // ── Group stage ───────────────────────────────────────────────────────────
  const { qualifyingThirds, allGroupsComplete } = qualification;
  const qualifyingThirdIds = new Set(qualifyingThirds.map((t) => t.row.teamId));

  for (const table of groupTables) {
    if (!decidedGroups.has(table.group)) continue;
    for (const { teamId, rank } of table.rows) {
      if (rank === 1 || rank === 2) {
        set(teamId, { outcome: 'alive', alive: true });
      } else if (rank === 4) {
        set(teamId, { outcome: 'eliminated', eliminatedAtStage: 'Group Stage' });
      } else {
        // rank === 3: alive (pending) until all 12 groups are decided
        if (allGroupsComplete) {
          const qualifies = qualifyingThirdIds.has(teamId);
          if (qualifies) {
            set(teamId, { outcome: 'alive', alive: true });
          } else {
            set(teamId, { outcome: 'eliminated', eliminatedAtStage: 'Group Stage' });
          }
        } else {
          set(teamId, { outcome: 'alive', alive: true });
        }
      }
    }
  }

  // ── Knockout stages ───────────────────────────────────────────────────────
  const knockouts = matches
    .filter((m) => m.stage !== 'Group Stage')
    .sort((a, b) => a.stageOrder - b.stageOrder || a.id - b.id);

  for (const match of knockouts) {
    const { homeTeamId: home, awayTeamId: away, status: ms, result, stage, id } = match;
    if (home === null || away === null) continue;

    if (ms === 'finished' && result?.winnerTeamId != null) {
      const winner = result.winnerTeamId;
      const loser = home === winner ? away : home;

      // Determine winner outcome. Third Place Playoff winner is done (can't win the
      // sweepstake); the winner earns 6 pts via furthestStage but alive = false.
      const isFinal = id === FINAL_MATCH_ID;
      const isThirdPlace = stage === 'Third Place Playoff';

      let winnerOutcome: TeamOutcome;
      let winnerAlive: boolean;
      if (isFinal) {
        winnerOutcome = 'champion';
        winnerAlive = true;
      } else if (isThirdPlace) {
        winnerOutcome = 'eliminated';
        winnerAlive = false;
      } else {
        winnerOutcome = 'alive';
        winnerAlive = true;
      }

      set(winner, {
        outcome: winnerOutcome,
        alive: winnerAlive,
        furthestStage: stage as StageName,
        nextMatchId: undefined,
      });
      set(loser, {
        outcome: 'eliminated',
        alive: false,
        furthestStage: stage as StageName,
        eliminatedAtStage: stage as StageName,
      });
    } else {
      // Scheduled / live with resolved team IDs — teams are alive and at this stage.
      // Update furthestStage so a finalist shows "Final" not "Semifinals".
      for (const teamId of [home, away]) {
        const s = statuses.get(teamId);
        if (s && !s.nextMatchId) {
          set(teamId, { nextMatchId: id, furthestStage: stage as StageName });
        }
      }
    }
  }

  return statuses;
}
