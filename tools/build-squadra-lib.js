#!/usr/bin/env node
/**
 * Build the Squadra library's consumable dist/ — the ESM + CJS entry and type declarations that
 * let ROOT CJS `require('@laticent/squadra')` and a plain Node-ESM or bundler consumer
 * `import` it, from `.` (the whole library) or `./driver` (the fix path alone)
 * (engineering/decisions/2026-10-26-squadra-lint-library/design.md §2.1).
 *   docs/src/lib/squadra/*.ts  →  dist/index.{mjs,cjs} + dist/*.d.ts
 * Squadra has no dependencies, so there is nothing to keep external.
 *
 * Flags:
 *   --check    Rebuild into a temp dir and diff against dist/. Exits 1 on drift.
 *   --silent   Suppress the success log line.
 */

const { defineLibraryBuild } = require('./lib/build-workspace-lib.js');

defineLibraryBuild({
  name: 'squadra',
  // `./driver` is the fix path without the rule compiler, for a browser bundle (driver.ts).
  entries: [{ entry: 'index.ts', out: 'index' }, { entry: 'driver.ts', out: 'driver' }],
}).run();
