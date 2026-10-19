/**
 * The Lattice adapter for `tools/style-needs.js`: the two things the generic core is handed.
 *
 *  - `RUNTIME_TOKENS`: classes and attributes that script adds after a document is scanned (the
 *    player prune's own keep-lists, solved once: HARD RULE #15, plus the two the checker found that
 *    no list named: the code-copy `data-copied` flag and the fluid view switch).
 *  - `buildLatticeIndex`: the index over `dist/styles/` (unminified: the selectors are the same as in
 *    `dist/styles-min/`, and the minified copy has the same ids in the same order), in the shape the
 *    docs Playground's loader fetches (`docs/scripts/sync-playground-assets.mjs` stages it).
 *
 * Shared by `tools/style-needs-audit.mjs` and the docs sync, so the audited index and the shipped
 * index are one function's output.
 */
const fs = require('node:fs');
const path = require('node:path');
const { buildIndex } = require('./style-needs.js');
const { PLAYER_PRUNE_SAFELIST, GUIDE_PRUNE_SAFELIST } = require('../lib/export/player-prune.js');

const ROOT = path.resolve(__dirname, '..');

function runtimeTokens() {
  const runtime = { c: [], a: ['data-copied', 'data-lattice-view'] };
  for (const sel of [...PLAYER_PRUNE_SAFELIST, ...GUIDE_PRUNE_SAFELIST]) {
    const m = sel.match(/^\.([\w-]+)$/) || sel.match(/^\[([\w-]+)\]$/);
    if (!m) throw new Error(`style-needs-lattice: cannot read runtime token ${sel}`);
    (sel.startsWith('.') ? runtime.c : runtime.a).push(m[1]);
  }
  runtime.c.push('lat-guide-dim');
  return runtime;
}
const RUNTIME_TOKENS = runtimeTokens();

/** `dist/styles/manifest.json` with each module's text read in. */
function readModules(root = ROOT) {
  const dir = path.join(root, 'dist/styles');
  const manifestPath = path.join(dir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) throw new Error('dist/styles/ is missing; run `npm run css:build` first');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.modules.map((m) => ({ ...m, text: fs.readFileSync(path.join(dir, m.file), 'utf8') }));
}

/**
 * The index a browser loader fetches. `floor` lists the module indexes (besides the always-needed ones) to
 * load at start. `modules[i]` and `index[i]` describe the same module, in
 * `lattice.css` order; `file` is a name under `dist/styles-min/`. `verified` adds the selector text
 * behind each alternative so the loader can ask the document (about 2.4x the bytes, fewer modules).
 */
function buildLatticeIndex({ verified = true, root = ROOT } = {}) {
  const modules = readModules(root);
  const index = buildIndex(modules, { selectors: verified });
  const min = JSON.parse(fs.readFileSync(path.join(root, 'dist/styles-min/manifest.json'), 'utf8'));
  if (min.modules.length !== modules.length || min.modules.some((m, i) => m.id !== modules[i].id)) {
    throw new Error('style-needs-lattice: dist/styles and dist/styles-min list different modules; run `npm run css:build`');
  }
  // The modules most decks need, loaded with the always-needed ones at start (tools/style-needs-common.js).
  // An optimization only: an id this build does not have is skipped, and a missing file means no floor.
  let common = [];
  try {
    common = JSON.parse(fs.readFileSync(path.join(__dirname, 'style-needs-common.json'), 'utf8')).ids;
  } catch {
    /* no committed list: the floor is the always-needed modules alone */
  }
  const floor = min.modules.flatMap((m, i) => (common.includes(m.id) ? [i] : []));
  return {
    version: 1,
    verified,
    floor,
    runtime: RUNTIME_TOKENS,
    modules: min.modules.map((m) => ({ id: m.id, file: m.file, bytes: m.bytes })),
    index,
  };
}

module.exports = { RUNTIME_TOKENS, readModules, buildLatticeIndex };
