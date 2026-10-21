#!/usr/bin/env node
/**
 * Builds @laticent/tavola's dist/: ESM + CJS bundles of the core, of the Trystero adapter and
 * of the Yjs adapter, and `.d.ts` declarations. `trystero` stays an import: it is the adapter's
 * optional peer dependency, which the consumer installs. So do `yjs`, `y-protocols/*` and
 * `lib0/*` for the Yjs adapter: bundling a second copy of Yjs would make its checks (that two
 * parts share one copy) refuse. Run `--check` to verify.
 */
const { defineLibraryBuild } = require('./lib/build-workspace-lib.js');

defineLibraryBuild({
  name: 'tavola',
  entries: [
    { entry: 'index.ts', out: 'index' },
    { entry: 'adapters/trystero.ts', out: 'trystero' },
    { entry: 'adapters/yjs.ts', out: 'yjs' },
  ],
  external: ['trystero', 'trystero/*', 'yjs', 'y-protocols', 'y-protocols/*', 'lib0', 'lib0/*'],
  platform: 'browser',
}).run();
