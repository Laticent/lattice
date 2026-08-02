/**
 * Unit: the `overflow-marker` EXPORT SETTING (lib/core/resolve-overflow-marker.js)
 * and the drawing policy it selects (lib/runtime/fluid-view-policy.js).
 *
 * The setting exists because two shipped policies disagreed and BOTH were right on
 * their own surface: lattice-emulator.js strips every marker before printing a PDF
 * and warns the author on stderr; the browser runtime draws the marker so a reader
 * never gets a silent clip. An Export-to-Marp bundle renders through the runtime
 * inside marp-cli's browser, so it inherited the AUTHORING default by accident and
 * shipped "Overflows" + per-cell "Fix Me" tags to recipients.
 *
 * It is NOT a deck register — it shipped as one for a single commit and moved, for
 * the reason `autosplit:` moved a day earlier: one deck source is previewed,
 * exported, and printed, and the three want different answers, which makes it a
 * property of the render target. This module therefore knows only the vocabulary
 * and how to resolve it; where the value COMES from is lib/core/export-settings.js
 * and each producer.
 *
 * The load-bearing assertions here are the two defaults and the fact that `reader`
 * still marks. A `reader` level that quietly stopped marking would turn this from
 * a routing change into concealment, which is the thing it must not be.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
  OVERFLOW_MARKER_LEVELS, EXPORT_DEFAULT_MARKER, AUTHORING_DEFAULT_MARKER,
  isKnownOverflowMarker, resolveOverflowMarker,
} = require('../../../lib/core/resolve-overflow-marker');
const { overflowMarkerPolicy, overflowTabText } = require('../../../lib/runtime/fluid-view-policy');

describe('overflow-marker — the vocabulary', () => {
  test('three levels, and the two defaults are among them', () => {
    assert.deepEqual([...OVERFLOW_MARKER_LEVELS], ['author', 'reader', 'off']);
    assert.ok(OVERFLOW_MARKER_LEVELS.includes(EXPORT_DEFAULT_MARKER));
    assert.ok(OVERFLOW_MARKER_LEVELS.includes(AUTHORING_DEFAULT_MARKER));
  });

  // The whole decision, pinned. `reader` for a delivered artifact (it still marks
  // a clip, but is not a bug report); `author` where someone is fixing the deck.
  test('the export defaults to reader and an authoring surface to author', () => {
    assert.equal(EXPORT_DEFAULT_MARKER, 'reader');
    assert.equal(AUTHORING_DEFAULT_MARKER, 'author');
  });

  test('recognizes the three levels, case- and space-insensitively', () => {
    for (const l of OVERFLOW_MARKER_LEVELS) {
      assert.ok(isKnownOverflowMarker(l));
      assert.ok(isKnownOverflowMarker(` ${l.toUpperCase()} `));
    }
    for (const bad of ['', 'quiet', 'true', 'on', null, undefined, 5, {}]) {
      assert.equal(isKnownOverflowMarker(bad), false, `not a level: ${JSON.stringify(bad)}`);
    }
  });
});

describe('overflow-marker — resolution', () => {
  test('a recognized value wins over the fallback', () => {
    assert.equal(resolveOverflowMarker('off', 'author'), 'off');
    assert.equal(resolveOverflowMarker(' Reader ', 'author'), 'reader');
  });

  // A stale or mistyped stored setting must not decide the artifact; it falls back
  // to the caller's default. (The CLI flag is stricter and dies — see export-marp.)
  test('an absent or unrecognized value falls back', () => {
    assert.equal(resolveOverflowMarker(null, 'author'), 'author');
    assert.equal(resolveOverflowMarker('quiet', 'author'), 'author');
    assert.equal(resolveOverflowMarker('', 'reader'), 'reader');
  });

  test('a bogus FALLBACK degrades to the export default, never to undefined', () => {
    assert.equal(resolveOverflowMarker(null, 'nonsense'), EXPORT_DEFAULT_MARKER);
    assert.equal(resolveOverflowMarker(null, undefined), EXPORT_DEFAULT_MARKER);
  });

});

describe('overflowMarkerPolicy — what each level actually draws', () => {
  // The anti-concealment assertion. `reader` was chosen over `off` as the export
  // default precisely because it still marks; if this ever flips, an overflowing
  // slide starts looking finished in every delivered bundle.
  test('reader still MARKS — it only changes who the marker talks to', () => {
    const p = overflowMarkerPolicy('reader');
    assert.equal(p.mark, true, 'the honest marker stays — only its tone changes');
    assert.equal(p.tabText, 'Content clipped');
    assert.equal(p.authorTags, false, 'no per-cell Fix Me overlays');
    assert.equal(p.legibility, false, 'the type-floor alarm has no reader answer');
  });

  test('author draws the full authoring signal', () => {
    const p = overflowMarkerPolicy('author');
    assert.deepEqual(p, { mark: true, authorTags: true, tabText: 'Overflows', legibility: true });
  });

  test('off draws nothing', () => {
    const p = overflowMarkerPolicy('off');
    assert.equal(p.mark, false);
    assert.equal(p.authorTags, false);
    assert.equal(p.legibility, false);
  });

  // The policy is the level→behavior translation; `overflowTabText` stays the
  // primitive underneath it, so the two cannot drift into different labels.
  test('the tab label agrees with the primitive it wraps', () => {
    assert.equal(overflowMarkerPolicy('author').tabText, overflowTabText(true));
    assert.equal(overflowMarkerPolicy('reader').tabText, overflowTabText(false));
  });

  // `startOverflowWatcher` resolves through `resolveOverflowMarker` before it gets
  // here, so an unknown level is unreachable from either boot site. Pinned anyway
  // because the failure it would cause is a HYBRID, not a graceful degrade: the tab
  // would read "Content clipped" while the CSS — whose gate is `[…="reader"]` and
  // would not match — drew the red AUTHOR ring. That is worse than either level.
  test('an unknown level still marks, and callers must normalize before this point', () => {
    const p = overflowMarkerPolicy('nonsense');
    assert.equal(p.mark, true, 'only an explicit `off` may silence the marker');
    assert.equal(p.authorTags, false);
    assert.equal(resolveOverflowMarker('nonsense', 'author'), 'author',
      'the normalization the watcher relies on, so the hybrid state is unreachable');
  });
});

/**
 * `off` has work to do — it is not "skip the watcher".
 *
 * lattice-emulator.js stamps `.overflow` into exported HTML at BUILD time, and a
 * re-render can hand the watcher a document an earlier, louder pass already
 * marked. Returning early without sweeping would leave exactly the chrome `off`
 * was asked to remove, which is the failure a reader would actually see.
 */
describe('sweepOverflowMarkers — what `off` clears', () => {
  const { JSDOM } = require('jsdom');
  const { sweepOverflowMarkers } = require('../../../lib/runtime/fluid-view-policy');
  // The Fix-Me half of this fixture is transcribed from what `drawFixMeTags`
  // actually builds in lib/runtime/index.js (an overlay host holding one `.lattice-
  // fixme-box` per culprit plus a `.lattice-fixme-tab` label) rather than from the
  // selector list the implementation sweeps. Built the other way round the test
  // could not fail for anything the sweep forgot — and an earlier cut DID forget the
  // boxes and the overlay while its docstring promised "every marker".
  const marked = () => new JSDOM(`<article>
    <section class="content overflow illegible" data-lattice-slide>
      <h2>A</h2>
      <div class="overflow-tab">Overflows</div>
      <div class="illegible-tab">Type 3px · floor 8.4px</div>
    </section>
    <section class="content" data-lattice-slide><h2>B</h2></section>
    <div class="lattice-fixme-overlay">
      <div class="lattice-fixme-box"></div>
      <div class="lattice-fixme-tab">Fix Me</div>
    </div>
  </article>`).window.document;

  // Asserted as "nothing the author would SEE is left", not as a selector list.
  test('clears both rings and every drawn marker, including the Fix-Me boxes', () => {
    const doc = marked();
    sweepOverflowMarkers(doc);
    assert.equal(doc.querySelectorAll('.overflow, .illegible').length, 0, 'no rings left');
    const chrome = [...doc.querySelectorAll('*')]
      .filter((el) => /overflow-tab|illegible-tab|lattice-fixme/.test(el.className || ''))
      .map((el) => el.className);
    assert.deepEqual(chrome, [], `marker chrome survived the sweep: ${chrome.join(', ')}`);
  });

  test('leaves the slide content alone — it removes chrome, not content', () => {
    const doc = marked();
    sweepOverflowMarkers(doc);
    assert.equal(doc.querySelectorAll('section[data-lattice-slide]').length, 2);
    assert.equal(doc.querySelector('section').querySelector('h2').textContent, 'A');
    assert.ok(doc.querySelector('section').classList.contains('content'), 'unrelated classes survive');
  });

  test('is idempotent, and survives a null / non-DOM root', () => {
    const doc = marked();
    sweepOverflowMarkers(doc);
    const once = doc.querySelector('article').innerHTML;
    sweepOverflowMarkers(doc);
    assert.equal(doc.querySelector('article').innerHTML, once);
    assert.doesNotThrow(() => sweepOverflowMarkers(null));
    assert.doesNotThrow(() => sweepOverflowMarkers({}));
  });
});
