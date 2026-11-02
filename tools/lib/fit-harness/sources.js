/**
 * sources — the decks the fit harness scores: the baseline gallery, every component gallery, and,
 * with `corpus: 'all'`, every example deck.
 *
 * The component galleries come from every component corpus root (`componentCorpusRoots`: the
 * buckets AND the plugins' kinds). This walk once rooted at `lib/components` alone, so when the
 * chart kinds moved into the chart-family plugin, 28 galleries dropped out of the nightly ratchet
 * and the baseline's entries for them went unscored with nothing failing.
 */
const fs = require('node:fs');
const path = require('node:path');
const { componentCorpusRoots } = require('../../../lib/packages/fs.js');

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));

/** @returns {string[]} absolute paths, sorted */
function fitSources(root, { corpus = 'galleries', only = '' } = {}) {
  let list = [
    path.join(root, 'test/integration/baseline-decks/gallery.md'),
    ...componentCorpusRoots(path.join(root, 'lib/components')).flatMap(walk).filter((f) => f.endsWith('.gallery.md')),
  ];
  if (corpus === 'all') list = list.concat(fs.readdirSync(path.join(root, 'examples')).filter((f) => f.endsWith('.md')).map((f) => path.join(root, 'examples', f)));
  return list.filter((f) => !only || f.includes(only)).sort();
}

module.exports = { fitSources };
