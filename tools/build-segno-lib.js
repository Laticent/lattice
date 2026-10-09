#!/usr/bin/env node
/**
 * Build the Segno library's consumable dist/ — the ESM + CJS entries + type
 * declarations that let ROOT CJS `require('@laticent/segno')` AND a plain
 * Node-ESM / bundler consumer `import '@laticent/segno'`.
 *
 *   docs/src/lib/segno/*.ts  (source, docs-side ESM/TS)
 *     →  docs/src/lib/segno/dist/index.mjs   (bundled ESM, esbuild)
 *     →  docs/src/lib/segno/dist/index.cjs   (bundled CJS, esbuild)
 *     →  docs/src/lib/segno/dist/*.d.ts      (declarations, tsc)
 *
 * Segno is the grammar engine (engineering/decisions/2026-09-28-segno-unified-inline-notation.md).
 * It follows the library-shape recipe its siblings use
 * (2026-07-08-library-shape-cadenza-vetrina.md): the `exports` map sends `require` →
 * dist/index.cjs and `import` → dist/index.mjs, while docs + Vitest import the TS SOURCE
 * through the `@/lib/*` path alias, so the docs runtime never depends on this build.
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
// notation.generated.ts is committed SOURCE, written by its own step (build-segno-grammar.js)
// so that this step's write set stays wholly inside the gitignored dist/. Bundling a stale
// one would ship a parser that disagrees with notation-grammar.ts, so refuse instead.
const { generatedNotation, isFresh } = require('./build-segno-grammar.js');

defineLibraryBuild({
  name: 'segno',
  // The barrel; `values` — the number and time readers alone (`@laticent/segno/values`), for a
  // consumer that reads only values and is bundled by a tool that cannot tree-shake a CommonJS
  // `require` (Lattice's chart-values.js reaches the exported guide player that way); and
  // `read` — parse, the schema and the types without the grammar compiler
  // (`@laticent/segno/read`), which Lattice's lib/ takes for the same reason on the Studio's
  // startup path.
  entries: [
    { entry: 'index.ts', out: 'index' },
    { entry: 'values.ts', out: 'values' },
    { entry: 'read.ts', out: 'read' },
  ],
  async preflight() {
    if (!isFresh(await generatedNotation())) {
      console.error('[build-segno-lib] notation.generated.ts is stale — run `node tools/build-segno-grammar.js` (or `npm run segno-lib:build`) first.');
      process.exit(1);
    }
  },
  target: 'node18',
  // As this library has always built: the node platform and bundler-mode declarations.
  platform: 'node',
  types: { module: 'esnext', moduleResolution: 'bundler', lib: null },
  outfile: true,
}).run();
