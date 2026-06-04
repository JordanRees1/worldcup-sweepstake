/**
 * Normalize a team/country name for tolerant matching:
 * strip diacritics, lowercase, collapse any non-alphanumeric run to a single space, trim.
 *
 *   "Côte d'Ivoire" -> "cote d ivoire"
 *   "Curaçao"       -> "curacao"
 *   "IR Iran"       -> "ir iran"
 */
export function normalizeName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
