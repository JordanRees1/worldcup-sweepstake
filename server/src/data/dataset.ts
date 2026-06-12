import type { Match, Pick, Player, Stage, Team, Venue } from '@sweepstake/shared';
import { loadMatches } from './matches';
import { normalizePicks } from './picks';
import { loadStages } from './stages';
import { resolveSweepstake, type SweepstakeConfig } from './sweepstake';
import { loadTeams } from './teams';
import { loadVenues } from './venues';
import { validateDataset } from './validate';

/** Tournament structure shared across every sweepstake (the structural source of truth). */
export interface StructuralData {
  teams: Team[];
  venues: Venue[];
  stages: Stage[];
  matches: Match[];
}

/** The full tournament for one sweepstake: shared structure + that sweepstake's players/picks. */
export interface Dataset extends StructuralData {
  players: Player[];
  picks: Pick[];
  /** The sweepstake whose picks were loaded + its pick rules. */
  sweepstake: SweepstakeConfig;
}

/** Load the shared tournament structure (teams, venues, stages, matches) — sweepstake-independent. */
export function loadStructural(): StructuralData {
  const teams = loadTeams();
  const venues = loadVenues();
  const stages = loadStages();
  const matches = loadMatches(stages);
  return { teams, venues, stages, matches };
}

/** Combine shared structure with one sweepstake's normalised players/picks. */
export function loadTenantDataset(
  structural: StructuralData,
  sweepstake: SweepstakeConfig,
  options: { validate?: boolean } = {},
): Dataset {
  const { players, picks } = normalizePicks(structural.teams, sweepstake);
  const dataset: Dataset = { ...structural, players, picks, sweepstake };
  if (options.validate ?? true) validateDataset(dataset);
  return dataset;
}

/** Load (and, by default, validate) a single sweepstake (defaults to the SWEEPSTAKE env var). */
export function loadDataset(options: { validate?: boolean } = {}): Dataset {
  return loadTenantDataset(loadStructural(), resolveSweepstake(), options);
}
