// Manual reconciliation tables for the messy `player_picks.csv`.
// Keys are NORMALIZED names (see normalize.ts). Keep this list as the single place to fix
// future pick-name surprises.

/** Normalized raw pick name -> canonical FIFA code (fixes typos and English/variant names). */
export const PICK_ALIASES: Record<string, string> = {
  sengal: 'SEN', // typo of "Senegal"
  uzbekisan: 'UZB', // typo of "Uzbekistan"
  'ivory coast': 'CIV', // English variant of "Côte d'Ivoire"
  iran: 'IRN', // variant of "IR Iran"
  curacao: 'CUR', // spelling variant of "Curaçao" (also matches by diacritic-stripping)
};

/**
 * Normalized raw pick name -> playoff route. These teams were still competing in the
 * inter-confederation / UEFA playoffs when the draw was made; each maps to a "Winner
 * Playoff" placeholder slot ONLY IF it qualifies, and is "did not qualify" otherwise.
 */
export const PLAYOFF_CONTINGENT: Record<string, string> = {
  sweden: 'UEFA playoff',
  wales: 'UEFA playoff',
  turkiye: 'UEFA playoff',
  turkey: 'UEFA playoff',
  czechia: 'UEFA playoff',
  'czech republic': 'UEFA playoff',
  bosnia: 'UEFA playoff',
  'bosnia and herzegovina': 'UEFA playoff',
  'dr congo': 'FIFA playoff',
  iraq: 'FIFA playoff',
};
