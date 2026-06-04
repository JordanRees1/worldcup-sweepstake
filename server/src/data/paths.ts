import { fileURLToPath } from 'node:url';

// Resolve repo-root folders relative to THIS file (server/src/data/paths.ts → repo root),
// so paths are correct no matter which directory a script or test is run from.
export const DATASETS_DIR = fileURLToPath(new URL('../../../datasets/', import.meta.url));
export const DOCS_DIR = fileURLToPath(new URL('../../../docs/', import.meta.url));
