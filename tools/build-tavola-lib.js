#!/usr/bin/env node
/**
 * Builds @laticent/tavola's dist/: ESM + CJS bundles of the core and of the Trystero
 * adapter, and `.d.ts` declarations. `trystero` stays an import: it is the adapter's
 * optional peer dependency, which the consumer installs. Run `--check` to verify.
 */
const { defineLibraryBuild } = require('./lib/build-workspace-lib.js');

defineLibraryBuild({
  name: 'tavola',
  entries: [
    { entry: 'index.ts', out: 'index' },
    { entry: 'adapters/trystero.ts', out: 'trystero' },
  ],
  external: ['trystero', 'trystero/*'],
  platform: 'browser',
}).run();
