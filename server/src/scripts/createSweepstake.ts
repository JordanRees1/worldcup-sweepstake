/**
 * CLI — scaffold a new sweepstake (tenant) from a local player_picks.csv.
 *
 *   npm run sweepstake:create -- --picks ./mates.csv --name "Dave's Mates" --teams-per-player 8
 *   npm run sweepstake:create -- --picks ./x.csv --name "X" --teams-per-player 2 --code aa26 --slug x
 *
 * The CSV needs `player,team` columns. Picks are validated against the canonical teams (typos
 * surfaced, 48-team partition enforced). A 6-hex code is generated if --code is omitted; a slug is
 * derived from the name if --slug is omitted. Writes datasets/sweepstakes/<slug>/ — then commit +
 * rebuild/redeploy the image to make the sweepstake live at https://sstake.co.uk/s/<code>.
 */
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadStructural } from '../data/dataset';
import { DATASETS_DIR } from '../data/paths';
import { normalizePicks } from '../data/picks';
import { listSweepstakes, type SweepstakeConfig } from '../data/sweepstake';
import { validateDataset } from '../data/validate';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function main(): void {
  const picksPath = arg('picks');
  const name = arg('name');
  const teamsPerPlayer = Number(arg('teams-per-player'));

  if (!picksPath || !existsSync(picksPath)) fail('--picks <path> is required and must exist');
  if (!name) fail('--name "<name>" is required');
  if (!Number.isInteger(teamsPerPlayer) || teamsPerPlayer <= 0) {
    fail('--teams-per-player <n> must be a positive integer');
  }

  const existing = listSweepstakes();
  const code = (arg('code') ?? randomBytes(3).toString('hex')).trim().toLowerCase();
  if (!/^[a-z0-9]+$/.test(code)) fail(`code "${code}" must be alphanumeric`);
  if (existing.some((s) => s.code === code)) fail(`code "${code}" is already in use`);

  const slug = arg('slug') ?? slugify(name);
  if (!slug) fail('could not derive a slug from the name — pass --slug');
  const dir = join(DATASETS_DIR, 'sweepstakes', slug);
  if (existsSync(dir)) fail(`slug "${slug}" already exists (${dir}) — pass a different --slug`);

  // Validate the picks against the canonical teams before writing anything.
  const structural = loadStructural();
  const probe: SweepstakeConfig = { slug, code, name, teamsPerPlayer, dir, picksPath };
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

  // Valid — scaffold the tenant folder.
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, 'sweepstake.json'),
    `${JSON.stringify({ name, teamsPerPlayer, code }, null, 2)}\n`,
    'utf8',
  );
  copyFileSync(picksPath, join(dir, 'player_picks.csv'));

  console.log(`✓ Created "${name}" — ${players.length} players, ${picks.length} picks`);
  console.log(`   code:   ${code}  →  https://sstake.co.uk/s/${code}`);
  console.log(`   folder: datasets/sweepstakes/${slug}/`);
  console.log('   Next: commit + rebuild/redeploy the image to make it live.');
}

main();
