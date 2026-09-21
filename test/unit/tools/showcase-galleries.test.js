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
 *   2. COVERAGE — the deck walks the full chart+math component set, and every one
 *      of those components carries a `sample` (so none is silently omitted).
 *   3. THE BUILD'S SKIP TEST — `buildFreshness`. Neither gate above can see a stale
 *      PDF: both compare MARKDOWN, and the deck's markdown is identical whether or not
 *      anyone re-rendered it. #2253 is two bugs in that skip, and the second one only
 *      shows across two themes in one run, so it is pinned here rather than left to a
 *      render.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadAll, groupByBucket } = require('../../../lib/components');
const {
  SHOWCASES, composeShowcase, galleryMarkdownPath, galleryPdfPath, showcaseComponentNames,
  buildFreshness,
} = require('../../../tools/build-showcase-galleries');

const groups = groupByBucket(loadAll());
const ROOT = path.join(__dirname, '..', '..', '..');

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

  test('math is NOT in the data-viz showcase', () => {
    // Math was a member until 2026-09 and is its own showcase now. It is rendered
    // EVIDENCE, which is not the same as being a chart: a chart plots a dataset and a
    // math slide typesets an expression — no shared transform, no shared dataset shape,
    // no shared reflow — and a reader comparing bar against waterfall does not want an
    // equation in the middle of the walk. Asserted rather than left to the roster,
    // because the roster is one line and this is the reasoning behind it.
    const dv = SHOWCASES.find((s) => s.id === 'data-viz');
    assert.ok(dv, 'the data-viz showcase must exist');
    assert.deepEqual(dv.buckets, ['chart'], 'data-viz surveys charts only');
    // AND IT DID NOT GET A SHOWCASE OF ITS OWN. A showcase composes one
    // `manifest.sample` per component, so a single-component bucket makes a two-slide
    // deck that duplicates the bucket gallery. The eight-variant survey is the COMPONENT
    // gallery; asserted here so nobody adds the redundant one back.
    assert.equal(SHOWCASES.find((s) => s.id === 'math'), undefined,
      'a single-component showcase duplicates the bucket gallery — math has none');
  });

  test('data-viz covers the full chart component set', () => {
    // The showcase must walk every chart component plus math — the same surfaces
    // the per-bucket family galleries cover, in one consolidated deck.
    const inDeck = new Set(showcaseComponentNames('data-viz', groups));
    assert.ok(inDeck.size >= 13, `expected the full chart set, got ${inDeck.size}`);
    assert.ok(!inDeck.has('math'), 'math has its own showcase — it must not be in data-viz');
  });

  describe('buildFreshness — the build path\'s skip test (#2253)', () => {
    const dv = SHOWCASES.find((s) => s.id === 'data-viz');

    test('a drifted deck is stale for EVERY theme, not just the first', () => {
      // The bug: `buildOne` recomputed `mdFresh` per theme, and the LIGHT pass writes
      // the deck. By the time dark ran, its own compare found the file light had just
      // written, called it fresh and skipped — so a manifest change rebuilt light and
      // left the dark PDF stale, silently, every time. `mdFresh` is measured once per
      // showcase now and passed in, which is exactly what this asserts: the same false
      // must produce the same verdict for both themes.
      for (const theme of ['light', 'dark']) {
        const f = buildFreshness(dv, theme, false);
        assert.equal(f.fresh, false, `${theme} must not be skipped when the deck drifted`);
        assert.match(f.reason, /drifted/, `${theme} should say why`);
      }
    });

    test('a missing PDF is stale even when the deck matches', () => {
      const bogus = { ...dv, id: `no-such-showcase-${process.pid}` };
      const f = buildFreshness(bogus, 'light', true);
      assert.equal(f.fresh, false);
      assert.equal(f.reason, 'missing PDF');
    });

    test('the verdict consults render inputs, not just the deck', () => {
      // The headline of #2253: engine CSS and chart transforms move every rendered
      // slide and no manifest, so the markdown compare is byte-identical while the
      // PDF is stale. Driven through a real dirty input rather than a stub, because
      // the whole failure was a check that looked right and asked the wrong question.
      const probe = path.join(ROOT, 'lib', `.showcase-input-probe-${process.pid}.css`);
      const { _resetCache, changedPaths } = require('../../../tools/lib/render-inputs');
      const pdf = galleryPdfPath(dv.id, 'light');
      assert.ok(fs.existsSync(pdf), 'the committed PDF must exist for this to mean anything');
      fs.writeFileSync(probe, '/* scratch */\n');
      try {
        _resetCache();
        // If the PDF is itself dirty, the helper's FIRST arm answers "already rebuilt in
        // this tree" and never reaches the input arm — correctly. Say so and stop, rather
        // than failing a branch that just re-rendered the showcase.
        if (changedPaths().paths.has(`examples/${dv.id}-gallery.light.pdf`)) {
          assert.equal(buildFreshness(dv, 'light', true).fresh, true,
            'a PDF rebuilt in this working tree is fresh whatever else changed');
          return;
        }
        const f = buildFreshness(dv, 'light', true);
        assert.equal(f.fresh, false, 'a changed render input must not read as fresh');
        assert.match(f.reason, /render input changed/);
      } finally {
        fs.unlinkSync(probe);
        _resetCache();
      }
    });
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
