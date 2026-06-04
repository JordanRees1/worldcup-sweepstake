import type { Dataset } from './dataset';

const GROUP_LETTERS = 'ABCDEFGHIJKL'.split('');

/**
 * Assert the dataset's structure and referential integrity. Collects every problem and throws
 * a single combined error, so bad data fails loudly with an actionable message.
 */
export function validateDataset(ds: Dataset): void {
  const { teams, venues, stages, matches, players, picks } = ds;
  const issues: string[] = [];
  const check = (ok: boolean, msg: string): void => {
    if (!ok) issues.push(msg);
  };

  // Cardinalities.
  check(teams.length === 48, `expected 48 teams, got ${teams.length}`);
  check(venues.length === 16, `expected 16 venues, got ${venues.length}`);
  check(stages.length === 7, `expected 7 stages, got ${stages.length}`);
  check(matches.length === 104, `expected 104 matches, got ${matches.length}`);
  check(players.length === 6, `expected 6 players, got ${players.length}`);
  check(picks.length === 48, `expected 48 picks, got ${picks.length}`);

  const teamById = new Map(teams.map((t) => [t.id, t]));
  const venueIds = new Set(venues.map((v) => v.id));
  const stageNames = new Set(stages.map((s) => s.name));
  check(teamById.size === teams.length, 'duplicate team ids');
  check(venueIds.size === venues.length, 'duplicate venue ids');

  // 12 groups of 4.
  const groupCounts = new Map<string, number>();
  for (const t of teams) {
    if (t.group) groupCounts.set(t.group, (groupCounts.get(t.group) ?? 0) + 1);
  }
  for (const g of GROUP_LETTERS) {
    check(groupCounts.get(g) === 4, `group ${g}: ${groupCounts.get(g) ?? 0} teams (expected 4)`);
  }

  // 72 group-stage matches (the other 32 are knockouts).
  const groupMatches = matches.filter((m) => m.stage === 'Group Stage');
  check(groupMatches.length === 72, `expected 72 group matches, got ${groupMatches.length}`);

  // Per-match referential integrity.
  for (const m of matches) {
    check(stageNames.has(m.stage), `match ${m.id}: unknown stage "${m.stage}"`);
    check(venueIds.has(m.venueId), `match ${m.id}: unknown venueId ${m.venueId}`);
    check(!Number.isNaN(Date.parse(m.kickoffAt)), `match ${m.id}: bad kickoffAt "${m.kickoffAt}"`);

    for (const teamId of [m.homeTeamId, m.awayTeamId]) {
      if (teamId !== null) check(teamById.has(teamId), `match ${m.id}: unknown team ${teamId}`);
    }

    if (m.stage === 'Group Stage') {
      check(
        m.homeTeamId !== null && m.awayTeamId !== null,
        `group match ${m.id}: missing team id(s)`,
      );
      for (const teamId of [m.homeTeamId, m.awayTeamId]) {
        const team = teamId !== null ? teamById.get(teamId) : undefined;
        if (team && m.group) {
          check(team.group === m.group, `match ${m.id}: ${team.name} not in group ${m.group}`);
        }
      }
    }
  }

  // Picks integrity.
  for (const p of picks) {
    if (p.teamId !== null) check(teamById.has(p.teamId), `pick: unknown teamId ${p.teamId}`);
  }
  const pickedIds = picks.filter((p) => p.teamId !== null).map((p) => p.teamId);
  check(new Set(pickedIds).size === pickedIds.length, 'a team is picked by more than one player');
  for (const pl of players) {
    const n = picks.filter((p) => p.playerId === pl.id).length;
    check(n === 8, `player ${pl.name}: ${n} picks (expected 8)`);
  }

  if (issues.length > 0) {
    throw new Error(`Dataset validation failed:\n - ${issues.join('\n - ')}`);
  }
}
