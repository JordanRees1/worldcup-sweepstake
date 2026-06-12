import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATASETS_DIR } from './paths';

/** A single sweepstake: which picks file to load and how many teams each player owns. */
export interface SweepstakeConfig {
  /** Folder name under datasets/sweepstakes/. */
  slug: string;
  /** Short code used in the URL (`/s/<code>`), lowercased. Defaults to the slug. */
  code: string;
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
 * Resolve a sweepstake by slug (folder `datasets/sweepstakes/<slug>/`). Defaults to the SWEEPSTAKE
 * env var, then `friends`. Each folder has a `sweepstake.json` (name, teamsPerPlayer, optional code)
 * + a `player_picks.csv`. The tournament structure is shared across all sweepstakes.
 */
export function resolveSweepstake(
  slug: string = process.env.SWEEPSTAKE ?? DEFAULT_SLUG,
): SweepstakeConfig {
  const dir = join(DATASETS_DIR, 'sweepstakes', slug);

  let raw: { name?: string; teamsPerPlayer?: number; code?: string };
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
    code: (raw.code ?? slug).trim().toLowerCase(),
    name: raw.name ?? slug,
    teamsPerPlayer: raw.teamsPerPlayer,
    dir,
    picksPath: join(dir, 'player_picks.csv'),
  };
}

/** Every sweepstake under datasets/sweepstakes/ — each a tenant in the multi-tenant gateway. */
export function listSweepstakes(): SweepstakeConfig[] {
  const root = join(DATASETS_DIR, 'sweepstakes');
  let slugs: string[];
  try {
    slugs = readdirSync(root, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return [];
  }
  return slugs.flatMap((slug) => {
    try {
      return [resolveSweepstake(slug)];
    } catch {
      return []; // skip folders without a valid sweepstake.json
    }
  });
}

/** Resolve a sweepstake by its URL code (case-insensitive), or null if no tenant has that code. */
export function resolveSweepstakeByCode(code: string): SweepstakeConfig | null {
  const norm = code.trim().toLowerCase();
  if (!norm) return null;
  return listSweepstakes().find((s) => s.code === norm) ?? null;
}
