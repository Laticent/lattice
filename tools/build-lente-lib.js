#!/usr/bin/env node
/**
 * Build the Lente library's consumable dist/ — the ESM + CJS entries + type
 * declarations that let ROOT CJS `require('@laticent/lente')` AND a plain
 * Node-ESM / bundler consumer `import '@laticent/lente'`.
 *
 *   docs/src/lib/lente/*.ts  (source, docs-side ESM/TS)
 *     →  docs/src/lib/lente/dist/index.mjs   (bundled ESM, esbuild)
 *     →  docs/src/lib/lente/dist/index.cjs   (bundled CJS, esbuild)
 *     →  docs/src/lib/lente/dist/*.d.ts      (declarations, tsc)
 *
 * WHY: Lente's package.json already declares `main`/`require` → ./dist/index.cjs
 * and it is an npm-workspace member, but no build ever produced that dist/ — so
 * `require('@laticent/lente')` (and any npm publish) resolves a missing file.
 * This completes the library-shape recipe the Lente ADR always called for
 * (2026-07-13-lente-reader-lenses.md, following 2026-07-08-library-shape-cadenza-vetrina.md):
 * the `exports` map sends `require` → dist/index.cjs and `import` → dist/index.mjs, while
 * docs + Vitest import the TS SOURCE through the `@/lib/*` path ALIAS (not the package
 * name) — so the docs runtime is unaffected. Lente is the fourth spin-off sibling; this
 * makes it node-consumable and publishable like Cadenza and Vetrina.
 *
 * Bundler = the in-tree esbuild (dist/engineering/capabilities.md names it the house
 * bundler); declarations = `tsc --emitDeclarationOnly` (esbuild can't emit .d.ts).
 * No new bundler dependency (HARD RULE #15).
 *
 * The build itself is tools/lib/build-workspace-lib.js, one builder for every workspace
 * library; this script states only what is particular to this one.
 *
 * Flags:
 *   --check    Rebuild into a temp dir and diff the whole tree against the
 *              committed dist/. Exits 1 on drift (the freshness gate).
 *   --silent   Suppress the success log line.
 */

const { defineLibraryBuild } = require('./lib/build-workspace-lib.js');

defineLibraryBuild({
  name: 'lente',
  entries: [{ entry: 'index.ts', out: 'index' }],
  target: 'node18',
  // As this library has always built: the node platform and bundler-mode declarations.
  platform: 'node',
  types: { module: 'esnext', moduleResolution: 'bundler', lib: null },
  outfile: true,
}).run();
