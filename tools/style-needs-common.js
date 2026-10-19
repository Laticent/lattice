/**
 * The common style modules: the ones most decks end up needing.
 *
 * The Playground's style loader (docs/src/lib/style-loader.ts) fetches an index and the modules a
 * document needs. A module counts as "needed" when any selector's tokens are present, and a dozen
 * generic selectors (`section`, `h1`, `p`, `svg`) are present in every deck, so 60 of the 187 modules (13 unconditional, 47 common)
 * are needed by 70% or more of the example decks. Fetching them after the first render costs a round
 * trip and a request each; putting them in the FLOOR (what loads at start, in parallel with the engine
 * bundle) costs nothing in bytes, because most decks load them anyway. Measured over the 295 example
 * decks (2026-10-19, token index): the floor goes from 13 modules and 57 KB to 60 modules and 228 KB
 * minified, the median deck's post-render fetches fall from 43 modules to 5, and the median bytes
 * loaded stay at 243 KB (waste 2 KB) — engineering/decisions/2026-10-18-on-demand-styles.md §11.
 *
 * This list is an OPTIMIZATION, never a correctness input: a module in the floor is simply loaded, and
 * a module missing from it is loaded when a scan asks. So a stale list costs bytes or a round trip and
 * can never drop a style. That is why it is a committed file checked for shape only, not regenerated
 * on every docs build (rendering 292 decks takes about a minute).
 *
 *   node tools/style-needs-common.js            check the committed list names real modules
 *   node tools/style-needs-common.js --write    regenerate tools/style-needs-common.json from the examples
 *   node tools/style-needs-common.js --measure  recompute and report how far the committed list has drifted
 *
 * Needs `npm run css:build` (dist/styles/ and dist/styles-min/).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FILE = path.join(__dirname, 'style-needs-common.json');
/** A module joins the floor when at least this share of the example decks needs it. */
const THRESHOLD = 0.7;

/** Share of the example decks that need each module, by the token scan over the CLI engine's HTML. */
function measure() {
  const { JSDOM } = require('jsdom');
  const latticeEngine = require('../lib/engine');
  const { scanDocument, neededModules } = require('../lib/core/style-needs-scan.mjs');
  const { buildLatticeIndex } = require('./style-needs-lattice.js');
  const idx = buildLatticeIndex({ verified: false });
  const engine = latticeEngine.createEngine({});
  engine.addThemes([
    { name: 'lattice', css: fs.readFileSync(path.join(ROOT, 'dist/lattice-min.css'), 'utf8') },
    { name: 'indaco', css: fs.readFileSync(path.join(ROOT, 'dist/themes/indaco-min.css'), 'utf8') },
  ]);
  const decks = fs.readdirSync(path.join(ROOT, 'examples')).filter((f) => f.endsWith('.md')).sort();
  const counts = new Array(idx.modules.length).fill(0);
  let used = 0;
  for (const f of decks) {
    let html;
    try {
      html = engine.render(fs.readFileSync(path.join(ROOT, 'examples', f), 'utf8'), 'indaco').html;
    } catch {
      continue; // a deck that does not render says nothing about styles
    }
    const flags = neededModules(idx.index, scanDocument(new JSDOM(html).window.document.documentElement), undefined, idx.runtime);
    flags.forEach((on, i) => {
      if (on) counts[i]++;
    });
    used++;
  }
  return { decks: used, share: counts.map((c) => c / used), modules: idx.modules, always: idx.index.map((m) => m.always) };
}

function read() {
  return JSON.parse(fs.readFileSync(FILE, 'utf8'));
}

/** `id -> sha256` of every module in `dist/styles/manifest.json`. */
function currentHashes() {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist/styles/manifest.json'), 'utf8'));
  return new Map(manifest.modules.map((m) => [m.id, m.sha256]));
}

/**
 * Ids in the committed list that this build does not have, or has with different CSS. Chunk ids (`base:finish#finish~5`)
 * are numbered by position in their group, so a change to `main`'s CSS can renumber one onto a DIFFERENT module; the
 * content hash recorded beside each id (`sha`) is what tells a renumbered module from the one that was measured.
 * A list without hashes (an older file) trusts the ids.
 */
function unknownIds(list = read()) {
  const have = currentHashes();
  return list.ids.filter((id) => !have.has(id) || (list.sha?.[id] && list.sha[id] !== have.get(id)));
}

/**
 * How many ids may be stale before the list counts as broken. Chunk ids (`base:finish#finish~5`) are numbered by position
 * in their group, so any CSS change on `main` can renumber one; a stale id only costs the loader a round trip (it is
 * skipped), so one or two are noise. Past 10% the list is out of date enough to re-measure (`--write`).
 */
const STALE_TOLERANCE = 0.1;
const tooStale = (list = read()) => unknownIds(list).length > Math.ceil(list.ids.length * STALE_TOLERANCE);

module.exports = { FILE, THRESHOLD, STALE_TOLERANCE, measure, read, tooStale, unknownIds };

if (require.main === module) {
  const arg = process.argv[2];
  if (arg === '--write' || arg === '--measure') {
    const m = measure();
    const ids = m.modules.filter((_x, i) => !m.always[i] && m.share[i] >= THRESHOLD).map((x) => x.id);
    if (arg === '--write') {
      const hashes = currentHashes();
      const sha = Object.fromEntries(ids.map((id) => [id, hashes.get(id)]));
      fs.writeFileSync(FILE, `${JSON.stringify({ threshold: THRESHOLD, decks: m.decks, ids, sha }, null, 1)}\n`);
      console.log(`wrote ${path.relative(ROOT, FILE)}: ${ids.length} modules needed by at least ${THRESHOLD * 100}% of ${m.decks} decks`);
    } else {
      const have = new Set(read().ids);
      const now = new Set(ids);
      console.log(`measured ${ids.length} common modules over ${m.decks} decks; committed list has ${have.size}`);
      console.log(`  would add:    ${ids.filter((x) => !have.has(x)).join(', ') || '(none)'}`);
      console.log(`  would remove: ${[...have].filter((x) => !now.has(x)).join(', ') || '(none)'}`);
    }
  } else {
    const bad = unknownIds();
    if (tooStale()) {
      console.error(`style-needs-common: ${bad.length} id(s) are not modules any more: ${bad.join(', ')}. Run node tools/style-needs-common.js --write`);
      process.exit(1);
    }
    console.log(`style-needs-common: ${read().ids.length} ids, ${bad.length ? `${bad.length} stale (tolerated): ${bad.join(', ')}` : 'all real modules'}`);
  }
}
