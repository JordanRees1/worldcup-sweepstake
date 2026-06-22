import {
  STAGE_NAMES,
  type BracketNode,
  type BracketResponse,
  type GroupsResponse,
  type HealthResponse,
  type Match,
  type MatchesResponse,
  type MetaResponse,
  type OverviewResponse,
  type PlayerDetailResponse,
  type PlayersResponse,
  type ScheduleResponse,
  type StageName,
  type TeamsResponse,
  type VenuesResponse,
} from '@sweepstake/shared';
import { computeDecidedGroups, projectRound32, rankAllThirds } from '../engine';
import type { AppState } from './appState';

export function buildHealth(state: AppState, version: string): HealthResponse {
  return { ok: true, dataSource: state.dataSource, lastUpdated: state.lastUpdated, version };
}

/**
 * The round the tournament is currently at: the stage of the next match still to be played
 * (earliest unfinished by stage order, then kickoff). A live match counts as the current
 * round. Once every match is finished, the last stage (the Final).
 */
function currentStage(state: AppState): StageName {
  let next: Match | undefined;
  let last: Match | undefined;
  for (const m of state.matches) {
    if (!last || m.stageOrder > last.stageOrder) last = m;
    if (m.status === 'finished') continue;
    if (
      !next ||
      m.stageOrder < next.stageOrder ||
      (m.stageOrder === next.stageOrder && m.kickoffAt < next.kickoffAt)
    ) {
      next = m;
    }
  }
  return (next ?? last)?.stage ?? 'Group Stage';
}

export function buildMeta(state: AppState): MetaResponse {
  return {
    code: state.sweepstake.code,
    name: state.sweepstake.name,
    teamsPerPlayer: state.sweepstake.teamsPerPlayer,
    playerCount: state.leaderboard.length,
  };
}

/** True when a match is in play — the leaderboard/standings include provisional live scores. */
function hasLiveMatch(state: AppState): boolean {
  return state.matches.some((m) => m.status === 'live');
}

export function buildOverview(state: AppState): OverviewResponse {
  return {
    asOf: new Date().toISOString(),
    dataSource: state.dataSource,
    currentStage: currentStage(state),
    leaderboard: state.leaderboard,
    provisional: hasLiveMatch(state),
  };
}

export function buildPlayers(state: AppState): PlayersResponse {
  return { players: state.leaderboard, provisional: hasLiveMatch(state) };
}

export function buildPlayerDetail(state: AppState, playerId: number): PlayerDetailResponse | null {
  const player = state.leaderboard.find((p) => p.player.id === playerId);
  if (!player) return null;

  const teamIds = new Set(player.teams.map((t) => t.team.id));
  const fixtures = state.matches
    .filter(
      (m) =>
        (m.homeTeamId !== null && teamIds.has(m.homeTeamId)) ||
        (m.awayTeamId !== null && teamIds.has(m.awayTeamId)),
    )
    .sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt));

  return { player, fixtures };
}

export function buildTeams(state: AppState): TeamsResponse {
  return {
    teams: state.teams.map((team) => ({
      team,
      status: state.teamStatuses.get(team.id) ?? {
        teamId: team.id,
        outcome: 'upcoming',
        alive: false,
        furthestStage: 'Group Stage',
      },
    })),
  };
}

export function buildVenues(state: AppState): VenuesResponse {
  return { venues: state.venues };
}

/** True once any group match has kicked off — before that, "as it stands" projections are noise. */
function groupStageStarted(state: AppState): boolean {
  return state.matches.some(
    (m) => m.stage === 'Group Stage' && (m.status === 'finished' || m.status === 'live'),
  );
}

export function buildGroups(state: AppState): GroupsResponse {
  const liveGroups = new Set(
    state.matches
      .filter((m) => m.stage === 'Group Stage' && m.status === 'live' && m.group)
      .map((m) => m.group),
  );
  const groups = state.groupTables.map((t) => (liveGroups.has(t.group) ? { ...t, live: true } : t));

  if (!groupStageStarted(state)) return { groups };

  const thirdPlace = rankAllThirds(state.groupTables).map((t, i) => ({
    teamId: t.row.teamId,
    group: t.group,
    rank: i + 1,
    qualifying: i < 8,
    played: t.row.played,
    points: t.row.points,
    goalDifference: t.row.goalDifference,
    goalsFor: t.row.goalsFor,
  }));
  return { groups, thirdPlace };
}

export function buildBracket(state: AppState): BracketResponse {
  const byStage = new Map<StageName, BracketNode[]>();

  // Project the Round of 32 "as it stands" from current standings (only once a group game has begun).
  const projection = groupStageStarted(state)
    ? projectRound32(state.matches, state.groupTables, computeDecidedGroups(state.matches))
    : null;

  for (const m of state.matches) {
    if (m.stage === 'Group Stage') continue;
    let homeTeamId = m.homeTeamId;
    let awayTeamId = m.awayTeamId;
    let homeProvisional = false;
    let awayProvisional = false;

    // Fill empty R32 slots with the projection so the bracket shows the current picture.
    const proj = m.stage === 'Round of 32' ? projection?.get(m.id) : undefined;
    if (proj) {
      if (homeTeamId === null && proj.home.teamId !== null) {
        homeTeamId = proj.home.teamId;
        homeProvisional = proj.home.provisional;
      }
      if (awayTeamId === null && proj.away.teamId !== null) {
        awayTeamId = proj.away.teamId;
        awayProvisional = proj.away.provisional;
      }
    }

    const node: BracketNode = {
      matchId: m.id,
      stage: m.stage,
      label: m.label,
      homeTeamId,
      awayTeamId,
      winnerTeamId: m.result?.winnerTeamId ?? null,
      ...(homeProvisional ? { homeProvisional: true } : {}),
      ...(awayProvisional ? { awayProvisional: true } : {}),
    };
    byStage.set(m.stage, [...(byStage.get(m.stage) ?? []), node]);
  }

  const rounds = STAGE_NAMES.filter((s) => s !== 'Group Stage' && byStage.has(s)).map((stage) => ({
    stage,
    nodes: (byStage.get(stage) ?? []).sort((a, b) => a.matchId - b.matchId),
  }));

  return { rounds };
}

export interface MatchFilters {
  stage?: string;
  group?: string;
  date?: string;
}

export function buildMatches(state: AppState, filters: MatchFilters): MatchesResponse {
  let matches = state.matches;
  if (filters.stage) matches = matches.filter((m) => m.stage === filters.stage);
  if (filters.group) matches = matches.filter((m) => m.group === filters.group);
  if (filters.date) matches = matches.filter((m) => m.kickoffAt.slice(0, 10) === filters.date);
  return { matches: [...matches].sort((a, b) => a.matchNumber - b.matchNumber) };
}

export function buildSchedule(state: AppState): ScheduleResponse {
  const byDate = new Map<string, Match[]>();
  for (const m of state.matches) {
    const date = m.kickoffAt.slice(0, 10); // venue-local date
    byDate.set(date, [...(byDate.get(date) ?? []), m]);
  }

  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, matches]) => ({
      date,
      matches: matches.sort((a, b) => a.kickoffAt.localeCompare(b.kickoffAt)),
    }));

  return { days };
}
