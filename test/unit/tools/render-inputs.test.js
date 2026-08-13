/**
 * Unit: the gallery staleness gate's input classifier.
 *
 * The bug this guards (#1640 item 4): `build-galleries.js --check` and
 * `build-bucket-galleries.js --check` compared ONE mtime — a gallery's own `.md` against
 * its PDF — and reported "up to date". A gallery PDF is a function of the layout bundle,
 * the palettes and the transform kernel as well, so the gate was blind to the most common
 * way these PDFs go stale: a CSS or engine change with no deck edit. #1632 was entirely
 * CSS, moved 424 slides across 122 galleries, and this gate called every one current.
 *
 * `isRenderInput` is the whole judgment, so it is what gets tested. The two failure modes
 * it has to hold at once:
 *
 *   · too NARROW — miss `.css` / engine `.js`, and the original blind spot is back.
 *   · too WIDE — sweep in theme `.manifest.json`, `*.docs.md` or `themes/palette-audit.pdf`
 *     and every check goes red on changes that move no pixel. A gate whose red is usually
 *     noise gets ignored, which is worse than the hole it closed. A component's own
 *     `*.gallery.md` is excluded for a different reason: it is that PDF's deck source,
 *     compared directly by the caller, and counting it here would mark every OTHER
 *     gallery stale alongside it.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { isRenderInput, changedPaths, changedRenderInputs, _resetCache } =
  require('../../../tools/lib/render-inputs');

describe('render-inputs: isRenderInput', () => {
  test('counts the stylesheets a render consumes', () => {
    for (const p of [
      'lib/base/base.tokens.css',
      'lib/components/statement/split-panel/split-panel.styles.css',
      'themes/indaco.css',
      'dist/lattice.css',
    ]) assert.equal(isRenderInput(p), true, `${p} should count`);
  });

  test('counts the transform kernel — a CSS-free change still moves the render', () => {
    for (const p of [
      'lib/integrations/markdown-it/plugins.js',
      'lib/core/present-transport.mjs',
      'lib/transformers/index.js',
      'lattice-emulator.js',
    ]) assert.equal(isRenderInput(p), true, `${p} should count`);
  });

  test('ignores files that change without changing a pixel', () => {
    for (const p of [
      'themes/indaco.manifest.json',
      'themes/palette-audit.pdf',
      'lib/base/base.docs.md',
      'lib/components/evidence/kpi/kpi.docs.md',
      'lib/components/evidence/kpi/kpi.gallery.light.pdf',
    ]) assert.equal(isRenderInput(p), false, `${p} should NOT count`);
  });

  test('excludes a gallery deck — it is the caller\'s direct comparison, not a shared input', () => {
    assert.equal(isRenderInput('lib/components/evidence/kpi/kpi.gallery.md'), false);
    assert.equal(isRenderInput('lib/components/legal/legal.gallery.md'), false);
  });

  test('ignores paths outside the render-input roots', () => {
    for (const p of ['tools/build-galleries.js', 'docs/src/styles/landing.css', 'README.md']) {
      assert.equal(isRenderInput(p), false, `${p} should NOT count`);
    }
  });
});

describe('render-inputs: git query', () => {
  test('answers from this repo, and memoizes', () => {
    _resetCache();
    const first = changedPaths();
    assert.equal(first.available, true, 'git should be able to answer inside the repo');
    assert.equal(first.paths instanceof Set, true);
    assert.equal(changedPaths(), first, 'second call should return the memoized object');
  });

  test('the derived input list is a sorted subset of the changed paths', () => {
    _resetCache();
    const { paths } = changedPaths();
    const { files } = changedRenderInputs();
    for (const f of files) {
      assert.equal(paths.has(f), true, `${f} should come from the changed set`);
      assert.equal(isRenderInput(f), true, `${f} should satisfy the classifier`);
    }
    assert.deepEqual(files, [...files].sort(), 'order should be stable for reporting');
  });
});
