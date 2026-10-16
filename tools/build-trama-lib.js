#!/usr/bin/env node
/**
 * Build the Trama library's consumable dist/: the ESM and CJS entries and the type
 * declarations that let the engine `require('@laticent/trama')` and a plain Node-ESM or
 * bundler consumer `import` it.
 *
 *   docs/src/lib/trama/*.ts  (source, strict TypeScript)
 *     ->  docs/src/lib/trama/dist/index.mjs   (bundled ESM, esbuild)
 *     ->  docs/src/lib/trama/dist/index.cjs   (bundled CJS, esbuild)
 *     ->  docs/src/lib/trama/dist/*.d.ts      (declarations, tsc)
 *
 * WHY: Trama is the graph-chart library (engineering/decisions/
 * 2026-09-27-trama-graph-chart-library.md). The runtime bundle, the emulator's bootstrap
 * and the unit tests all consume it by name, through the package's `exports` map, so it
 * needs a node-importable artifact. Same shape as Cadenza's build
 * (2026-07-08-library-shape-cadenza-vetrina.md).
 *
 * SERIALIZATION. The kernel, the pipeline and every adapter are shipped as
 * `fn.toString()` source, so the bundle must inject no helper outside a function (a
 * `__spreadValues` at module scope would be a free variable inside the shipped function).
 * The target is modern enough that esbuild lowers nothing, and
 * test/unit/trama/serialization.test.js runs the built functions through `new Function`.
 *
 * Bundler = the in-tree esbuild; declarations = `tsc --emitDeclarationOnly`. No new
 * dependency (HARD RULE #15).
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

// Two entry points. `index` is the whole library. `radial` is the radial kernel alone, for a
// chart that runs only that kernel at render time (hub-spoke): requiring the barrel's CJS
// build would carry the graph kernel and the browser pipeline into its bundle, because
// esbuild cannot drop unused exports from a CommonJS module.
//
// es2022, not node18: like Calco's reader, Trama's functions ship as `fn.toString()` source
// (see SERIALIZATION in the header), so the bundle must inject no helper outside a function.
defineLibraryBuild({
  name: 'trama',
  target: 'es2022',
  entries: [
    { entry: 'index.ts', out: 'index' },
    { entry: 'radial.ts', out: 'radial' },
  ],
  // As this library has always built: the node platform and bundler-mode declarations.
  platform: 'node',
  types: { module: 'esnext', moduleResolution: 'bundler', lib: null },
  outfile: true,
}).run();
