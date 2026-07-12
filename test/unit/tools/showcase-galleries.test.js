/**
 * Gate: the consolidated showcase galleries can't go stale.
 *
 * The `data-viz` showcase (examples/data-viz-gallery.md) is GENERATED from the
 * live chart + math manifest set (tools/build-showcase-galleries.js). Two things
 * this locks, both fast + render-free so they BLOCK on every PR:
 *
 *   1. FRESHNESS — the committed deck must equal what the generator composes from
 *      the current manifests. Add/rename/retire a chart or math component (or edit
 *      its `sample`) without rebuilding the deck and CI goes red. This is the
 *      "a new component silently misses the gallery" worry, gated.
 *   2. PALETTE PARITY — the deck's component set must equal the set the compiled
 *      chart palette (tools/build-chart-palette-css.js) scans. The
 *      demonstration/test deck and the fix it demonstrates are driven off the same
 *      component dirs; this asserts they never drift apart.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadAll, groupByBucket } = require('../../../lib/components');
const {
  SHOWCASES, composeShowcase, galleryMarkdownPath, showcaseComponentNames,
} = require('../../../tools/build-showcase-galleries');
const { scannedFiles } = require('../../../tools/build-chart-palette-css');

const groups = groupByBucket(loadAll());

describe('showcase galleries', () => {
  for (const showcase of SHOWCASES) {
    test(`${showcase.id}: committed deck is in sync with the live manifests`, () => {
      const mdPath = galleryMarkdownPath(showcase.id);
      assert.ok(fs.existsSync(mdPath), `missing ${path.relative(process.cwd(), mdPath)} — run npm run build:showcase-galleries`);
      const composed = composeShowcase(showcase, groups);
      const committed = fs.readFileSync(mdPath, 'utf8');
      assert.equal(committed, composed,
        `${showcase.id}-gallery.md drifted from the manifests (a component was added/changed/removed) — run npm run build:showcase-galleries`);
    });
  }

  test('data-viz covers exactly the colour-fallback\'s scanned component set', () => {
    // Component names the fallback scans: lib/components/chart/<name>/<name>.styles.css
    // + math.styles.css (chart-family.css is shared kernel, not a component).
    const scanned = new Set(
      scannedFiles()
        .map((f) => f.match(/lib\/components\/(?:chart|math)\/(?:[a-z-]+\/)?([a-z-]+)\/\1\.styles\.css$/))
        .filter(Boolean)
        .map((m) => m[1]),
    );
    // math lives at lib/components/math/math/math.styles.css → captured as `math`.
    const inDeck = new Set(showcaseComponentNames('data-viz', groups));

    const missingFromDeck = [...scanned].filter((n) => !inDeck.has(n));
    const extraInDeck = [...inDeck].filter((n) => !scanned.has(n));
    assert.deepEqual(missingFromDeck, [],
      `components the fallback covers but the data-viz deck omits: ${missingFromDeck.join(', ')}`);
    assert.deepEqual(extraInDeck, [],
      `components in the data-viz deck the fallback does not scan: ${extraInDeck.join(', ')}`);
    assert.ok(inDeck.size >= 13, `expected the full chart+math set, got ${inDeck.size}`);
  });

  test('every chart+math component actually has a sample (no silent omission)', () => {
    // A component with no `sample` is COUNTED by name but the composer emits no
    // slide for it, so the deck would silently omit it while the freshness/parity
    // gates stay green. Assert every in-scope component carries a sample, closing
    // that false-green.
    const set = [...(groups.chart || []), ...(groups.math || [])];
    const sampleless = set.filter((m) => !(typeof m.sample === 'string' && m.sample.trim())).map((m) => m.name);
    assert.deepEqual(sampleless, [],
      `chart/math components with no manifest.sample (would be omitted from the deck): ${sampleless.join(', ')}`);
  });
});
