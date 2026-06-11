import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Locate the repo root so dataset/web paths are correct no matter how the server runs:
 *   - dev/tests  → TypeScript source via tsx/vitest  (this file at server/src/data/paths.ts)
 *   - production → the esbuild single-file bundle     (this file inlined into server/dist/index.js)
 *
 * The two layouts sit at different depths, so we can't hardcode a `../../../` literal. Instead we
 * walk up from this module until we find the folder containing `datasets/` (always present at the
 * root — the app can't run without it). `APP_ROOT` short-circuits the search when set (the
 * Dockerfile sets it to /app for an explicit, fast resolution).
 */
function findAppRoot(): string {
  if (process.env.APP_ROOT) return resolve(process.env.APP_ROOT);

  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'datasets'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break; // reached the filesystem root
    dir = parent;
  }
  throw new Error(
    `Could not locate the app root: no datasets/ directory found above ${fileURLToPath(import.meta.url)}. ` +
      'Set APP_ROOT to the repo root.',
  );
}

const APP_ROOT = findAppRoot();

export const DATASETS_DIR = join(APP_ROOT, 'datasets');
export const DOCS_DIR = join(APP_ROOT, 'docs');
/** The Vite-built web assets (`web/dist`), served by Express in production. */
export const WEB_DIST_DIR = join(APP_ROOT, 'web', 'dist');
