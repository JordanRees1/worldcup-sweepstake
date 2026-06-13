import type { Player, Team } from '@sweepstake/shared';
import { normalizeName } from '../data/normalize';
import { createTeamResolver } from '../data/picks';

/** Raw roster submitted by the CLI / self-service form. */
export interface RosterInput {
  name: string;
  teamsPerPlayer: number;
  players: { name: string; picks: string[] }[];
}

export interface PickIssue {
  player: string;
  rawName: string;
  /** Closest canonical team name, if one is near enough ("did you mean …?"). */
  suggestion?: string;
}

export interface BuildResult {
  ok: boolean;
  players?: Player[];
  picks?: { playerId: number; teamId: number }[];
  /** Picks that didn't resolve to a team. */
  issues?: PickIssue[];
  /** Structural problems (counts, duplicates). */
  errors?: string[];
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
    }
  }
  return d[m][n];
}

function makeSuggester(teams: Team[]): (raw: string) => string | undefined {
  const confirmed = teams.filter((t) => !t.isPlaceholder).map((t) => ({ name: t.name, norm: normalizeName(t.name) }));
  return (raw: string) => {
    const norm = normalizeName(raw);
    let best: { name: string; dist: number } | undefined;
    for (const t of confirmed) {
      const dist = levenshtein(norm, t.norm);
      if (!best || dist < best.dist) best = { name: t.name, dist };
    }
    // Only suggest if reasonably close (≤ ~40% of the longer string).
    return best && best.dist <= Math.max(2, Math.ceil(norm.length * 0.4)) ? best.name : undefined;
  };
}

/**
 * Validate + resolve a roster into normalized players/picks, or return the issues/errors so the
 * caller (CLI or /new form) can surface them. Enforces the 48-team partition.
 */
export function buildTenant(teams: Team[], input: RosterInput): BuildResult {
  const errors: string[] = [];
  const tpp = input.teamsPerPlayer;
  if (!Number.isInteger(tpp) || tpp <= 0 || 48 % tpp !== 0) {
    errors.push(`teams-per-player must be a divisor of 48 (got ${tpp})`);
    return { ok: false, errors };
  }

  const expectedPlayers = 48 / tpp;
  const roster = input.players.filter((p) => p.name.trim());
  if (roster.length !== expectedPlayers) {
    errors.push(`expected ${expectedPlayers} players for ${tpp} teams each, got ${roster.length}`);
  }

  const resolve = createTeamResolver(teams);
  const suggest = makeSuggester(teams);
  const players: Player[] = [];
  const picks: { playerId: number; teamId: number }[] = [];
  const issues: PickIssue[] = [];
  const seen = new Set<number>();

  roster.forEach((p, idx) => {
    const id = idx + 1;
    const pname = p.name.trim();
    players.push({ id, name: pname });
    const teamNames = p.picks.map((s) => s.trim()).filter(Boolean);
    if (teamNames.length !== tpp) {
      errors.push(`player "${pname}" has ${teamNames.length} picks (expected ${tpp})`);
    }
    for (const raw of teamNames) {
      const r = resolve(raw);
      if (r.teamId === null) {
        issues.push({ player: pname, rawName: raw, suggestion: suggest(raw) });
        continue;
      }
      if (seen.has(r.teamId)) {
        errors.push(`team "${raw}" is picked by more than one player`);
        continue;
      }
      seen.add(r.teamId);
      picks.push({ playerId: id, teamId: r.teamId });
    }
  });

  if (issues.length === 0 && errors.length === 0 && picks.length !== 48) {
    errors.push(`expected 48 picks in total, got ${picks.length}`);
  }

  if (issues.length > 0 || errors.length > 0) {
    return {
      ok: false,
      ...(issues.length ? { issues } : {}),
      ...(errors.length ? { errors } : {}),
    };
  }
  return { ok: true, players, picks };
}
