#!/usr/bin/env node
/**
 * Build the Mosaico library's consumable dist/ — the ESM + CJS entry and type declarations that
 * let ROOT CJS `require('@laticent/mosaico')` (the collage transform) and a plain Node-ESM or
 * bundler consumer `import` it (engineering/decisions/2026-10-16-mosaico-layout-library.md §5).
 *   docs/src/lib/mosaico/*.ts  →  dist/index.{mjs,cjs} + dist/*.d.ts
 * Mosaico has no dependencies, so there is nothing to keep external.
 *
 * Flags:
 *   --check    Rebuild into a temp dir and diff against dist/. Exits 1 on drift.
 *   --silent   Suppress the success log line.
 */

const { defineLibraryBuild } = require('./lib/build-workspace-lib.js');

defineLibraryBuild({
  name: 'mosaico',
  entries: [{ entry: 'index.ts', out: 'index' }],
}).run();
