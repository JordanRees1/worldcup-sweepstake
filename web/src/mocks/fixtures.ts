// Mock fixtures for standalone web development (MSW). Shaped exactly per `@sweepstake/shared`.
// These are placeholder values — the real server supplies live data in later work packages.

import type {
  BracketResponse,
  HealthResponse,
  Match,
  MatchesResponse,
  OverviewResponse,
  PlayerSummary,
  PlayersResponse,
  PlayerTeam,
  ScheduleResponse,
  StageName,
  Team,
  TeamOutcome,
} from '@sweepstake/shared';

let seq = 0;
const mkTeam = (name: string, fifaCode: string, group: Team['group']): Team => ({
  id: ++seq,
  name,
  fifaCode,
  group,
  isPlaceholder: false,
});

const pt = (team: Team, outcome: TeamOutcome, furthestStage: PlayerTeam['status']['furthestStage']): PlayerTeam => ({
  team,
  status: {
    teamId: team.id,
    outcome,
    alive: outcome === 'alive' || outcome === 'champion',
    furthestStage,
  },
});

function makePlayer(
  id: number,
  name: string,
  rank: number,
  points: number,
  goalDifference: number,
  furthestStage: StageName | 'Did Not Qualify',
  teams: PlayerTeam[],
): PlayerSummary {
  return {
    player: { id, name },
    rank,
    aliveCount: teams.filter((t) => t.status.alive).length,
    furthestStage,
    points,
    goalDifference,
    teams,
  };
}

const leaderboard: PlayerSummary[] = [
  makePlayer(5, 'Jordan', 1, 14, 7, 'Quarterfinals', [
    pt(mkTeam('Spain', 'ESP', 'H'), 'alive', 'Quarterfinals'),
    pt(mkTeam('Brazil', 'BRA', 'C'), 'alive', 'Quarterfinals'),
    pt(mkTeam('Portugal', 'POR', 'K'), 'eliminated', 'Round of 16'),
    pt(mkTeam('Mexico', 'MEX', 'A'), 'upcoming', 'Group Stage'),
  ]),
  makePlayer(2, 'Henri', 2, 10, 4, 'Round of 16', [
    pt(mkTeam('Argentina', 'ARG', 'J'), 'alive', 'Round of 16'),
    pt(mkTeam('Germany', 'GER', 'E'), 'alive', 'Round of 16'),
    pt(mkTeam('Japan', 'JPN', 'F'), 'eliminated', 'Group Stage'),
    pt(mkTeam('Belgium', 'BEL', 'G'), 'upcoming', 'Group Stage'),
  ]),
  makePlayer(3, 'Will', 3, 7, 2, 'Round of 16', [
    pt(mkTeam('England', 'ENG', 'L'), 'alive', 'Round of 16'),
    pt(mkTeam('Netherlands', 'NED', 'F'), 'eliminated', 'Round of 16'),
    pt(mkTeam('Uruguay', 'URU', 'H'), 'eliminated', 'Group Stage'),
    pt(mkTeam('Croatia', 'CRO', 'L'), 'upcoming', 'Group Stage'),
  ]),
  makePlayer(1, 'Rogan', 4, 6, 1, 'Round of 16', [
    pt(mkTeam('Colombia', 'COL', 'K'), 'alive', 'Round of 16'),
    pt(mkTeam('Ecuador', 'ECU', 'E'), 'eliminated', 'Group Stage'),
    pt(mkTeam('Egypt', 'EGY', 'G'), 'eliminated', 'Group Stage'),
    pt(mkTeam('South Korea', 'KOR', 'A'), 'upcoming', 'Group Stage'),
  ]),
  makePlayer(4, 'Dec', 5, 3, -3, 'Round of 16', [
    pt(mkTeam('Senegal', 'SEN', 'I'), 'eliminated', 'Round of 16'),
    pt(mkTeam('Sweden', 'SWE', 'F'), 'eliminated', 'Group Stage'),
    pt(mkTeam('Algeria', 'ALG', 'J'), 'upcoming', 'Group Stage'),
    pt(mkTeam('Cabo Verde', 'CPV', 'H'), 'eliminated', 'Group Stage'),
  ]),
  makePlayer(6, 'James', 6, 1, -6, 'Group Stage', [
    pt(mkTeam('USA', 'USA', 'D'), 'eliminated', 'Group Stage'),
    pt(mkTeam('Canada', 'CAN', 'B'), 'eliminated', 'Group Stage'),
    pt(mkTeam('Wales', 'WAL', null), 'did_not_qualify', 'Did Not Qualify'),
    pt(mkTeam('Saudi Arabia', 'KSA', 'H'), 'eliminated', 'Group Stage'),
  ]),
];

export const healthFixture: HealthResponse = {
  ok: true,
  dataSource: 'seed',
  lastUpdated: new Date().toISOString(),
  version: '0.0.0',
};

export const overviewFixture: OverviewResponse = {
  asOf: new Date().toISOString(),
  dataSource: 'seed',
  currentStage: 'Round of 16',
  leaderboard,
};

export const playersFixture: PlayersResponse = { players: leaderboard };

export const bracketFixture: BracketResponse = {
  rounds: [
    {
      stage: 'Round of 16',
      nodes: [
        { matchId: 89, stage: 'Round of 16', label: 'W73 vs W75', homeTeamId: 1, awayTeamId: 9, winnerTeamId: 1 },
        { matchId: 90, stage: 'Round of 16', label: 'W74 vs W77', homeTeamId: 13, awayTeamId: 21, winnerTeamId: 21 },
      ],
    },
    {
      stage: 'Quarterfinals',
      nodes: [
        { matchId: 97, stage: 'Quarterfinals', label: 'W89 vs W90', homeTeamId: 1, awayTeamId: 21, winnerTeamId: null },
      ],
    },
    {
      stage: 'Final',
      nodes: [
        { matchId: 104, stage: 'Final', label: 'W101 vs W102', homeTeamId: null, awayTeamId: null, winnerTeamId: null },
      ],
    },
  ],
};

const mkMatch = (id: number, label: string, kickoffAt: string, stage: StageName): Match => ({
  id,
  matchNumber: id,
  stage,
  stageOrder: 3,
  label,
  kickoffAt,
  venueId: 1,
  homeTeamId: null,
  awayTeamId: null,
  status: 'scheduled',
});

// A handful of R32 knockout matches for offline dev
const knockoutMatches: Match[] = [
  mkMatch(73, '2A vs 2B', '2026-06-28T22:00:00-07:00', 'Round of 32'),
  mkMatch(74, '1C vs 2F', '2026-06-29T18:00:00-05:00', 'Round of 32'),
  mkMatch(75, '1E vs 3ABCDF', '2026-06-29T20:30:00-04:00', 'Round of 32'),
  mkMatch(76, '1F vs 2C', '2026-06-30T03:00:00-06:00', 'Round of 32'),
  mkMatch(89, 'W73 vs W75', '2026-07-04T18:00:00-05:00', 'Round of 16'),
  mkMatch(90, 'W74 vs W77', '2026-07-04T22:00:00-04:00', 'Round of 16'),
  mkMatch(97, 'W89 vs W90', '2026-07-09T21:00:00-04:00', 'Quarterfinals'),
  mkMatch(101, 'W97 vs W98', '2026-07-14T20:00:00-05:00', 'Semifinals'),
  mkMatch(103, 'RU101 vs RU102', '2026-07-18T22:00:00-04:00', 'Third Place Playoff'),
  mkMatch(104, 'W101 vs W102', '2026-07-19T20:00:00-04:00', 'Final'),
];

export const matchesFixture: MatchesResponse = {
  matches: knockoutMatches,
};

export const scheduleFixture: ScheduleResponse = {
  days: [
    {
      date: '2026-07-04',
      matches: [
        mkMatch(89, 'W73 vs W75', '2026-07-04T13:00:00-05:00', 'Round of 16'),
        mkMatch(90, 'W74 vs W77', '2026-07-04T17:00:00-04:00', 'Round of 16'),
      ],
    },
    {
      date: '2026-07-05',
      matches: [
        mkMatch(91, 'W76 vs W78', '2026-07-05T16:00:00-04:00', 'Round of 16'),
        mkMatch(92, 'W79 vs W80', '2026-07-05T20:00:00-06:00', 'Round of 16'),
      ],
    },
  ],
};
