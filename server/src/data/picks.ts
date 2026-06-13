import type { Pick, Player, Team } from '@sweepstake/shared';
import { DID_NOT_QUALIFY, PICK_ALIASES } from './aliases';
import { readCsv } from './csv';
import { normalizeName } from './normalize';
import { resolveSweepstake, type SweepstakeConfig } from './sweepstake';

type PickRow = {
  player: string;
  team: string;
};

export interface NormalizedPicks {
  players: Player[];
  picks: Pick[];
}

export interface ResolvedTeam {
  teamId: number | null;
  matched: boolean;
  note?: string;
}

/**
 * Build a reusable matcher: raw pick name → canonical team. Matches exact (diacritic-insensitive),
 * known typos/variants (alias table), flags playoff non-qualifiers, else unmatched. Used by the
 * CSV loader and the runtime create/validate APIs.
 */
export function createTeamResolver(teams: Team[]): (rawName: string) => ResolvedTeam {
  const confirmedByNorm = new Map<string, Team>();
  const byFifa = new Map<string, Team>();
  for (const team of teams) {
    byFifa.set(team.fifaCode, team);
    if (!team.isPlaceholder) confirmedByNorm.set(normalizeName(team.name), team);
  }

  return (rawName: string): ResolvedTeam => {
    const norm = normalizeName(rawName);

    const exact = confirmedByNorm.get(norm);
    if (exact) return { teamId: exact.id, matched: true };

    const aliasCode = PICK_ALIASES[norm];
    const aliased = aliasCode ? byFifa.get(aliasCode) : undefined;
    if (aliased) return { teamId: aliased.id, matched: true, note: `variant of ${aliased.name}` };

    const dnqReason = DID_NOT_QUALIFY[norm];
    if (dnqReason) return { teamId: null, matched: false, note: `did not qualify: ${dnqReason}` };

    return { teamId: null, matched: false, note: 'UNMATCHED — needs review' };
  };
}

/**
 * Reconcile a sweepstake's `player_picks.csv` against the canonical team list.
 */
export function normalizePicks(
  teams: Team[],
  sweepstake: SweepstakeConfig = resolveSweepstake(),
): NormalizedPicks {
  const rows = readCsv<PickRow>(sweepstake.picksPath);

  // Players, in first-appearance order, get ids 1..n.
  const players: Player[] = [];
  const playerIds = new Map<string, number>();
  for (const row of rows) {
    if (!playerIds.has(row.player)) {
      const id = players.length + 1;
      playerIds.set(row.player, id);
      players.push({ id, name: row.player });
    }
  }

  const resolve = createTeamResolver(teams);
  const picks = rows.map((row): Pick => {
    const playerId = playerIds.get(row.player) ?? 0;
    const r = resolve(row.team);
    return {
      playerId,
      teamId: r.teamId,
      rawName: row.team,
      matched: r.matched,
      ...(r.note ? { note: r.note } : {}),
    };
  });

  return { players, picks };
}
