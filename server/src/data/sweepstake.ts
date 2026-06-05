import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATASETS_DIR } from './paths';

/** A single sweepstake: which picks file to load and how many teams each player owns. */
export interface SweepstakeConfig {
  /** Folder name under datasets/sweepstakes/ and the value of the SWEEPSTAKE env var. */
  slug: string;
  /** Display name (e.g. "Friends", "Work"). */
  name: string;
  /** Teams owned per player. Must divide the 48-team field evenly (e.g. 8 → 6 players, 2 → 24). */
  teamsPerPlayer: number;
  /** Absolute path to this sweepstake's folder. */
  dir: string;
  /** Absolute path to this sweepstake's player_picks.csv. */
  picksPath: string;
}

const DEFAULT_SLUG = 'friends';

/**
 * Resolve the active sweepstake. Defaults to the SWEEPSTAKE env var, then `friends`.
 * Each sweepstake lives in `datasets/sweepstakes/<slug>/` with a `sweepstake.json`
 * config and a `player_picks.csv`. The tournament structure (teams, fixtures, …) is
 * shared across all sweepstakes from `datasets/`.
 */
export function resolveSweepstake(
  slug: string = process.env.SWEEPSTAKE ?? DEFAULT_SLUG,
): SweepstakeConfig {
  const dir = join(DATASETS_DIR, 'sweepstakes', slug);

  let raw: { name?: string; teamsPerPlayer?: number };
  try {
    raw = JSON.parse(readFileSync(join(dir, 'sweepstake.json'), 'utf8')) as typeof raw;
  } catch {
    throw new Error(
      `Unknown sweepstake "${slug}" — expected datasets/sweepstakes/${slug}/sweepstake.json. ` +
        'Set SWEEPSTAKE to a folder under datasets/sweepstakes/.',
    );
  }

  if (typeof raw.teamsPerPlayer !== 'number' || raw.teamsPerPlayer <= 0) {
    throw new Error(`sweepstake "${slug}": sweepstake.json must set a positive numeric teamsPerPlayer`);
  }

  return {
    slug,
    name: raw.name ?? slug,
    teamsPerPlayer: raw.teamsPerPlayer,
    dir,
    picksPath: join(dir, 'player_picks.csv'),
  };
}
