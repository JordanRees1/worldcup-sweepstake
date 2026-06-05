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

/**
 * Reconcile a sweepstake's `player_picks.csv` against the canonical team list. Each pick
 * resolves to one of:
 *  - a confirmed team (exact, diacritic-insensitive, or via the alias table);
 *  - playoff-contingent (a team still in the playoffs → not yet a real entrant);
 *  - unmatched (needs human review — should be empty once aliases are complete).
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

  const confirmedByNorm = new Map<string, Team>();
  const byFifa = new Map<string, Team>();
  for (const team of teams) {
    byFifa.set(team.fifaCode, team);
    if (!team.isPlaceholder) confirmedByNorm.set(normalizeName(team.name), team);
  }

  const picks = rows.map((row): Pick => {
    const playerId = playerIds.get(row.player) ?? 0;
    const norm = normalizeName(row.team);

    // 1) Exact (diacritic-insensitive) match to a confirmed team.
    const exact = confirmedByNorm.get(norm);
    if (exact) {
      return { playerId, teamId: exact.id, rawName: row.team, matched: true };
    }

    // 2) Known typo / name variant.
    const aliasCode = PICK_ALIASES[norm];
    const aliased = aliasCode ? byFifa.get(aliasCode) : undefined;
    if (aliased) {
      return {
        playerId,
        teamId: aliased.id,
        rawName: row.team,
        matched: true,
        note: `variant of ${aliased.name}`,
      };
    }

    // 3) Picked a team that did not qualify (lost its 2026 playoff).
    const dnqReason = DID_NOT_QUALIFY[norm];
    if (dnqReason) {
      return {
        playerId,
        teamId: null,
        rawName: row.team,
        matched: false,
        note: `did not qualify: ${dnqReason}`,
      };
    }

    // 4) Could not be resolved.
    return {
      playerId,
      teamId: null,
      rawName: row.team,
      matched: false,
      note: 'UNMATCHED — needs review',
    };
  });

  return { players, picks };
}
