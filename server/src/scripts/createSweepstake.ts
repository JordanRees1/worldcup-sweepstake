/**
 * CLI — create a new sweepstake (tenant) from a local player_picks.csv.
 *
 *   npm run sweepstake:create -- --picks ./mates.csv --name "Dave's Mates" --teams-per-player 8
 *   npm run sweepstake:create -- --picks ./x.csv --name "X" --teams-per-player 2 --code aa27
 *
 * The CSV needs `player,team` columns. Picks are validated against the canonical teams (typos
 * surfaced, 48-team partition enforced). A 6-hex code is generated if --code is omitted. The
 * tenant is written to the store — local `datasets/tenants/` in dev (commit it, or it stays local),
 * Azure Blob in prod (live immediately at https://sstake.co.uk/s/<code>).
 */
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { loadStructural } from '../data/dataset';
import { normalizePicks } from '../data/picks';
import { resolveSweepstakeByCode, type SweepstakeConfig } from '../data/sweepstake';
import { createTenantStore, type TenantRecord } from '../data/tenantStore';
import { validateDataset } from '../data/validate';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function main(): Promise<void> {
  const picksPath = arg('picks');
  const name = arg('name');
  const teamsPerPlayer = Number(arg('teams-per-player'));

  if (!picksPath || !existsSync(picksPath)) fail('--picks <path> is required and must exist');
  if (!name) fail('--name "<name>" is required');
  if (!Number.isInteger(teamsPerPlayer) || teamsPerPlayer <= 0) {
    fail('--teams-per-player <n> must be a positive integer');
  }

  const code = (arg('code') ?? randomBytes(3).toString('hex')).trim().toLowerCase();
  if (!/^[a-z0-9]+$/.test(code)) fail(`code "${code}" must be alphanumeric`);

  const store = createTenantStore();
  if (resolveSweepstakeByCode(code) || (await store.resolve(code))) {
    fail(`code "${code}" is already in use`);
  }

  // Validate the picks against the canonical teams.
  const structural = loadStructural();
  const probe: SweepstakeConfig = { slug: code, code, name, teamsPerPlayer, dir: '', picksPath };
  const { players, picks } = normalizePicks(structural.teams, probe);

  const unmatched = picks.filter((p) => p.teamId === null);
  if (unmatched.length > 0) {
    console.error(`✗ ${unmatched.length} pick(s) didn't match a team — fix the CSV (or add aliases):`);
    for (const p of unmatched) console.error(`   • "${p.rawName}"`);
    process.exit(1);
  }
  try {
    validateDataset({ ...structural, players, picks, sweepstake: probe });
  } catch (err) {
    fail((err as Error).message);
  }

  const record: TenantRecord = {
    code,
    name,
    teamsPerPlayer,
    players,
    picks: picks.map((p) => ({ playerId: p.playerId, teamId: p.teamId as number })),
    createdAt: new Date().toISOString(),
  };
  await store.save(record);

  console.log(`✓ Created "${name}" — ${players.length} players, ${picks.length} picks`);
  console.log(`   code: ${code}  →  https://sstake.co.uk/s/${code}`);
}

main().catch((err: unknown) => fail(err instanceof Error ? err.message : String(err)));
