import type { Match, Pick, Player, Stage, Team, Venue } from '@sweepstake/shared';
import { loadMatches } from './matches';
import { normalizePicks } from './picks';
import { loadStages } from './stages';
import { loadTeams } from './teams';
import { loadVenues } from './venues';
import { validateDataset } from './validate';

/** The full canonical tournament, loaded from `datasets/`. The structural source of truth. */
export interface Dataset {
  teams: Team[];
  venues: Venue[];
  stages: Stage[];
  matches: Match[];
  players: Player[];
  picks: Pick[];
}

/** Load (and, by default, validate) the entire tournament from the CSV datasets. */
export function loadDataset(options: { validate?: boolean } = {}): Dataset {
  const teams = loadTeams();
  const venues = loadVenues();
  const stages = loadStages();
  const matches = loadMatches(stages);
  const { players, picks } = normalizePicks(teams);

  const dataset: Dataset = { teams, venues, stages, matches, players, picks };
  if (options.validate ?? true) validateDataset(dataset);
  return dataset;
}
