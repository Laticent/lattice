#!/usr/bin/env node
/**
 * Build the LTT library's consumable dist/ — the ESM entry + the CJS entry + type
 * declarations that let ROOT CJS `require('@laticent/ltt')` AND a plain Node-ESM /
 * bundler consumer `import '@laticent/ltt'`.
 *
 *   docs/src/lib/ltt/*.ts  (source, docs-side ESM/TS)
 *     →  docs/src/lib/ltt/dist/index.mjs   (bundled ESM, esbuild)
 *     →  docs/src/lib/ltt/dist/index.cjs   (bundled CJS, esbuild)
 *     →  docs/src/lib/ltt/dist/*.d.ts      (declarations, tsc)
 *
 * WHY: the LTT format package ships the library-shape recipe its siblings use
 * (2026-07-08-library-shape-cadenza-vetrina.md): a per-lib package.json whose `exports`
 * map sends `require` to dist/index.cjs and `import` to dist/index.mjs. The docs runtime
 * does not read this dist/: the docs, Vitest and Cadenza's own build all resolve
 * `@laticent/ltt` to the TS SOURCE through an alias (see tools/build-cadenza-lib.js), so
 * this build has no ordering dependency on anything. What reads it is root CJS — the
 * `lib/core/` producers that `require('@laticent/ltt')` — and an npm publish. The format
 * is pure data and pure functions, so every export is node-safe.
 * Design: engineering/decisions/2026-09-24-lattice-timing-track.md §6; spec: spec/LTT-1.0.md.
 *
 * Bundler = the in-tree esbuild (engineering/capabilities.md names it the house
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
  name: 'ltt',
  entries: [{ entry: 'index.ts', out: 'index' }],
  target: 'node18',
  // As this library has always built: the node platform and bundler-mode declarations.
  platform: 'node',
  types: { module: 'esnext', moduleResolution: 'bundler', lib: null },
  outfile: true,
}).run();
