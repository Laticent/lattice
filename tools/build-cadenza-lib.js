#!/usr/bin/env node
/**
 * Build the Cadenza library's consumable dist/ — the ESM + CJS entries + type
 * declarations that let ROOT CJS `require('@laticent/cadenza')` AND a plain
 * Node-ESM / bundler consumer `import '@laticent/cadenza'`.
 *
 *   docs/src/lib/cadenza/*.ts  (source, docs-side ESM/TS)
 *     →  docs/src/lib/cadenza/dist/index.mjs   (bundled ESM, esbuild)
 *     →  docs/src/lib/cadenza/dist/index.cjs   (bundled CJS, esbuild)
 *     →  docs/src/lib/cadenza/dist/*.d.ts      (declarations, tsc)
 *
 * WHY: Cadenza is docs-side TypeScript with no node-importable artifact, so the
 * CJS export pipeline (lib/export/*, the CLI) can't use it — which is why the
 * read-along work grew hand-mirrors of two pure functions. This build gives
 * Cadenza real library shape (see 2026-07-08-library-shape-cadenza-vetrina.md):
 * an npm-workspace package whose `exports` map sends `require` → dist/index.cjs and
 * `import` → dist/index.mjs, while docs + Vitest import the TS SOURCE through the
 * `@/lib/*` path ALIAS (not the package name) — so the docs runtime is unaffected.
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

const path = require('node:path');
const { defineLibraryBuild } = require('./lib/build-workspace-lib.js');

// Cadenza's one dependency: the LTT format package, which owns the `Word` / `Cue` /
// `CaptionTrack` types and `validateTrack` (2026-09-24-lattice-timing-track.md §6). It is
// inlined from SOURCE: through the package's `exports` map esbuild
// would read docs/src/lib/ltt/dist/index.mjs, and tools/build.js runs the library builders in
// parallel, so this build must never wait for build-ltt-lib.js.
defineLibraryBuild({
  name: 'cadenza',
  alias: { '@laticent/ltt': path.join(__dirname, '..', 'docs', 'src', 'lib', 'ltt', 'index.ts') },
  entries: [{ entry: 'index.ts', out: 'index' }],
  target: 'node18',
  // As this library has always built: the node platform and bundler-mode declarations.
  platform: 'node',
  types: { module: 'esnext', moduleResolution: 'bundler', lib: null },
  outfile: true,
}).run();
