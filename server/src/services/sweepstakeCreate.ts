import type { GenerateMode, Player, Team } from '@sweepstake/shared';
import { normalizeName } from '../data/normalize';
import { createTeamResolver } from '../data/picks';

/** Raw roster submitted by the CLI / self-service form. */
export interface RosterInput {
  name: string;
  teamsPerPlayer: number;
  players: { name: string; picks: string[] }[];
  /** When set, the server draws the teams (ignoring `players[].picks`). */
  generate?: { mode: GenerateMode };
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

/** Fisher–Yates shuffle (in place). `rng` is injectable so draws can be tested deterministically. */
function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Draw the 48 teams across players automatically (the /new "generate" option). Returns the same
 * {@link BuildResult} shape as {@link buildTenant} — on success always a clean 48-team partition.
 *  - **chaos**: a fully random deal.
 *  - **balanced**: sort teams by FIFA rank, split into `teamsPerPlayer` equal tiers, and give every
 *    player exactly one team from each tier — so everyone ends up with a comparable spread of
 *    strong and weak sides.
 */
export function generateRoster(
  teams: Team[],
  input: RosterInput & { generate: { mode: GenerateMode } },
  rng: () => number = Math.random,
): BuildResult {
  const tpp = input.teamsPerPlayer;
  if (!Number.isInteger(tpp) || tpp <= 0 || 48 % tpp !== 0) {
    return { ok: false, errors: [`teams-per-player must be a divisor of 48 (got ${tpp})`] };
  }
  const expectedPlayers = 48 / tpp;
  const names = input.players.map((p) => p.name.trim()).filter(Boolean);
  const realTeams = teams.filter((t) => !t.isPlaceholder);

  const errors: string[] = [];
  if (names.length !== expectedPlayers) {
    errors.push(`expected ${expectedPlayers} players for ${tpp} teams each, got ${names.length}`);
  }
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    errors.push('player names must be unique');
  }
  if (realTeams.length !== 48) errors.push(`expected 48 teams, found ${realTeams.length}`);
  if (input.generate.mode === 'balanced' && realTeams.some((t) => t.fifaRank == null)) {
    errors.push('balanced draw needs FIFA rankings for every team');
  }
  if (errors.length) return { ok: false, errors };

  const players: Player[] = names.map((name, i) => ({ id: i + 1, name }));
  const picks: { playerId: number; teamId: number }[] = [];

  if (input.generate.mode === 'chaos') {
    const ids = shuffle(
      realTeams.map((t) => t.id),
      rng,
    );
    players.forEach((p, i) => {
      for (let k = 0; k < tpp; k++) picks.push({ playerId: p.id, teamId: ids[i * tpp + k] });
    });
  } else {
    // balanced: rank ascending → `tpp` tiers of `expectedPlayers` teams; one per tier per player.
    const ranked = [...realTeams].sort((a, b) => (a.fifaRank ?? 0) - (b.fifaRank ?? 0));
    for (let tier = 0; tier < tpp; tier++) {
      const slice = shuffle(ranked.slice(tier * expectedPlayers, (tier + 1) * expectedPlayers), rng);
      slice.forEach((team, j) => picks.push({ playerId: players[j].id, teamId: team.id }));
    }
  }
  return { ok: true, players, picks };
}
