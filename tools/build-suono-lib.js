#!/usr/bin/env node
/**
 * Build the Suono library's consumable dist/ — the ESM entry + the CJS entry + type
 * declarations that let ROOT CJS `require('@laticent/suono')` AND a plain Node-ESM /
 * bundler consumer `import '@laticent/suono'`.
 *
 *   docs/src/lib/suono/*.ts  (source, docs-side ESM/TS)
 *     →  docs/src/lib/suono/dist/index.mjs   (bundled ESM, esbuild)
 *     →  docs/src/lib/suono/dist/index.cjs   (bundled CJS, esbuild)
 *     →  docs/src/lib/suono/dist/*.d.ts      (declarations, tsc)
 *
 * WHY: Suono ships the library-shape recipe from 2026-07-08-library-shape-cadenza-vetrina.md
 * (the packaging follow-up named in 2026-07-12-suono-audio-library.md §8): a per-lib
 * package.json whose `exports` map sends `require` to dist/index.cjs and `import` to
 * dist/index.mjs. The docs runtime is unaffected because docs + Vitest import the TS SOURCE
 * through the `@/lib/*` path ALIAS (not the package name), so these dist artifacts are only
 * what an external consumer / npm publish resolves. The `import` condition used to point at
 * raw ./index.ts, which crashed a plain Node-ESM consumer with ERR_UNKNOWN_FILE_EXTENSION —
 * emitting a real .mjs is the fix. (The WebAudio playback surface is browser-only at runtime;
 * the encode/cache helpers are node-safe, and the built artifact is what a consumer imports.)
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
  name: 'suono',
  entries: [{ entry: 'index.ts', out: 'index' }],
  target: 'node18',
  // As this library has always built: the node platform and bundler-mode declarations.
  platform: 'node',
  types: { module: 'esnext', moduleResolution: 'bundler', lib: null },
  outfile: true,
}).run();
