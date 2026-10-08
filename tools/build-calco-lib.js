#!/usr/bin/env node
/**
 * Build the Calco library's consumable dist/: the ESM and CJS entries and the type
 * declarations that let the CLI `require('@laticent/calco')` and a plain Node-ESM or
 * bundler consumer `import` it.
 *
 *   docs/src/lib/calco/*.ts  (source, strict TypeScript)
 *     ->  docs/src/lib/calco/dist/index.mjs   (bundled ESM, esbuild)
 *     ->  docs/src/lib/calco/dist/index.cjs   (bundled CJS, esbuild)
 *     ->  docs/src/lib/calco/dist/*.d.ts      (declarations, tsc)
 *
 * WHY: Calco is the office-export library (engineering/decisions/
 * 2026-10-06-calco-office-export-library.md), in the library shape of
 * 2026-07-08-library-shape-cadenza-vetrina.md.
 *
 * SERIALIZATION. `readSlide` and `restoreSlide` ship into a headless page as
 * `fn.toString()` source, so the bundle must inject no helper outside a function. The
 * target is modern enough that esbuild lowers nothing, and
 * test/unit/calco/serialization.test.js runs the built functions through `new Function`.
 *
 * The build itself is tools/lib/build-workspace-lib.js, one builder for every workspace
 * library; this script states only what is particular to this one.
 *
 * Flags:
 *   --check    Rebuild into a temp dir and diff the whole tree against dist/. Exits 1 on
 *              drift (the freshness gate).
 *   --silent   Suppress the success log line.
 */

const { defineLibraryBuild } = require('./lib/build-workspace-lib.js');

// es2022, not node18: `readSlide` and `restoreSlide` ship into a page as `fn.toString()`
// source, so the bundle must inject no helper outside a function (see the header).
defineLibraryBuild({
  name: 'calco',
  target: 'es2022',
  entries: [{ entry: 'index.ts', out: 'index' }],
  // As this library has always built: the node platform and bundler-mode declarations.
  platform: 'node',
  types: { module: 'esnext', moduleResolution: 'bundler', lib: null },
  outfile: true,
}).run();
