import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

// Bundle the server (and the @sweepstake/shared TypeScript source it imports) into one JS file
// that `node` runs directly — no runtime TypeScript transpilation, so cold starts are fast.
//
// Real npm dependencies stay external (resolved from node_modules at runtime); only our own
// source + the shared workspace are inlined. @sweepstake/shared is intentionally NOT listed in
// package.json "dependencies" (it's a workspace import), so it isn't externalised here.

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
const external = Object.keys(pkg.dependencies ?? {}).flatMap((dep) => [dep, `${dep}/*`]);

await esbuild.build({
  entryPoints: [fileURLToPath(new URL('./src/index.ts', import.meta.url))],
  outfile: fileURLToPath(new URL('./dist/index.js', import.meta.url)),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  external,
  sourcemap: true,
  minify: false,
  logLevel: 'info',
  // Safeguard: lets any bundled CJS interop reference require() under ESM output.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
});
