// Manual reconciliation tables for the messy `player_picks.csv`.
// Keys are NORMALIZED names (see normalize.ts). This is the single place to fix pick-name
// surprises.

/** Normalized raw pick name -> canonical FIFA code (fixes typos and English/variant names). */
export const PICK_ALIASES: Record<string, string> = {
  sengal: 'SEN', // typo of "Senegal"
  uzbekisan: 'UZB', // typo of "Uzbekistan"
  'ivory coast': 'CIV', // English variant of "Côte d'Ivoire"
  iran: 'IRN', // variant of "IR Iran"
  curacao: 'CUR', // spelling variant of "Curaçao"
  bosnia: 'BIH', // short form of "Bosnia and Herzegovina" (2026 UEFA playoff winner)
};

/**
 * Normalized raw pick name -> reason the pick is dead.
 *
 * After the March 2026 playoffs, six of the seven playoff-contingent picks won their slots and
 * are now real teams in `teams.csv`. Wales failed to qualify — but Dec later swapped Wales for
 * the (previously unowned) Croatia, so no current pick is a non-qualifier. This table is kept
 * as a guard in case a non-qualifying pick reappears.
 */
export const DID_NOT_QUALIFY: Record<string, string> = {
  wales: 'lost 2026 UEFA playoff',
};
