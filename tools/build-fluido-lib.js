#!/usr/bin/env node
/**
 * Build the Fluido library's consumable dist/ — the ESM + CJS entry and type declarations that
 * let ROOT CJS `require('@laticent/fluido')` (the split kernels) and a plain Node-ESM or
 * bundler consumer `import` it (engineering/decisions/2026-10-27-fluid-layout-library.md §5.1).
 *   docs/src/lib/fluido/*.ts  →  dist/index.{mjs,cjs} + dist/*.d.ts
 * Fluido has no dependencies, so there is nothing to keep external.
 *
 * Flags:
 *   --check    Rebuild into a temp dir and diff against dist/. Exits 1 on drift.
 *   --silent   Suppress the success log line.
 */

const { defineLibraryBuild } = require('./lib/build-workspace-lib.js');

defineLibraryBuild({
  name: 'fluido',
  entries: [{ entry: 'index.ts', out: 'index' }],
}).run();
