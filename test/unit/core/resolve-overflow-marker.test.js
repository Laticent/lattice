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

  test('author draws the full authoring signal, with a word for each condition', () => {
    const p = overflowMarkerPolicy('author');
    assert.deepEqual(p, {
      mark: true, authorTags: true, tabText: 'Overflows', tabTextCut: 'Content clipped', legibility: true,
    });
  });

  // "Overflows" is a claim about GEOMETRY. Once the register learned to detect a cut
  // with no overflow, it started making that claim on slides where nothing overflows --
  // an ellipsed label drew a red OVERFLOWS flag with no ring beside it (correctly
  // absent), so the author hunted for a spill that was not there. Two words, one
  // vocabulary shared with the stderr channel and the reader pill.
  test('the CUT word differs from the OVERFLOW word at author, and not at reader', () => {
    assert.notEqual(overflowMarkerPolicy('author').tabTextCut, overflowMarkerPolicy('author').tabText);
    assert.equal(overflowMarkerPolicy('reader').tabTextCut, overflowMarkerPolicy('reader').tabText,
      'a reader is never shown the geometry word, so both conditions read the same');
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
    assert.equal(overflowMarkerPolicy('author').tabText, overflowTabText(true, false));
    assert.equal(overflowMarkerPolicy('author').tabTextCut, overflowTabText(true, true));
    assert.equal(overflowMarkerPolicy('reader').tabText, overflowTabText(false, false));
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
  // The Fix-Me half of this fixture is transcribed from what the watcher actually
  // leaves on the DOM (lib/runtime/index.js `markFitCulprits` / `drawFitLabel`: a
  // `.fit-culprit` class carrying `data-fit-label` on the responsible box, plus the
  // section's own `.fixme-tab` berth) rather than from the selector list the
  // implementation sweeps. Built the other way round the test could not fail for
  // anything the sweep forgot — and an earlier cut DID forget the boxes and the
  // overlay while its docstring promised "every marker".
  //
  // The three tabs are BERTHS the markup carries (lib/core/fit-berth.js), so what
  // the sweep owes them is EMPTINESS, not removal: deleting one would take a piece
  // of the slide the engine emitted, and the next `berth()` call would mint it
  // straight back. The assertion below is written as "no marker TEXT and no marker
  // CLASS survives", which is the property a reader can actually check.
  //
  // The SECTION half is now derived the same way, and that is a repair. It used to be a
  // hand-written `class="content overflow illegible"` fixture asserted against a
  // hand-written `querySelectorAll('.overflow, .illegible')` — so when the register
  // gained a third section class, the sweep was extended and this suite stayed green
  // either way. Deleting the new line from `sweepOverflowMarkers` left 148 passing tests
  // and an `off` export with the class still stamped: a test that could not fail for the
  // exact thing its own comment says it exists to catch. The class list is read out of
  // the watcher's source now, so a fourth class fails here until it is swept.
  const WATCHER_SRC = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', '..', '..', 'lib', 'runtime', 'index.js'),
    'utf8',
  );
  const SECTION_CLASSES = [
    ...new Set([...WATCHER_SRC.matchAll(/s\.classList\.toggle\('([a-z-]+)'/g)].map((m) => m[1])),
  ];

  const marked = () => new JSDOM(`<article>
    <section class="content ${SECTION_CLASSES.join(' ')}" data-lattice-slide>
      <h2>A</h2>
      <div class="cell-stage fit-culprit" data-fit-label="Fix Me"></div>
      <div class="overflow-tab">Overflows</div>
      <div class="illegible-tab">Type 3px · floor 8.4px</div>
      <div class="fixme-tab" title="Likely cause — 90 words, over budget">Fix Me</div>
    </section>
    <section class="content" data-lattice-slide><h2>B</h2></section>
  </article>`).window.document;

  test('the fixture actually carries every class the watcher stamps', () => {
    // Guards the derivation itself: a regex that silently matched nothing would make
    // every assertion below vacuous, which is the failure mode being repaired.
    assert.ok(SECTION_CLASSES.length >= 3,
      `expected the watcher to stamp at least 3 section classes, found ${SECTION_CLASSES.join(', ') || '(none)'}`);
    for (const c of ['overflow', 'clip-marked', 'illegible', 'fit-marked']) {
      assert.ok(SECTION_CLASSES.includes(c), `${c} must be among the watcher's section classes`);
    }
  });

  // Asserted as "nothing the author would SEE is left", not as a selector list.
  test('clears every section class the watcher stamps, and every drawn marker', () => {
    const doc = marked();
    sweepOverflowMarkers(doc);
    const left = SECTION_CLASSES.filter((c) => doc.querySelectorAll(`.${c}`).length > 0);
    assert.deepEqual(left, [], `section classes survived the sweep: ${left.join(', ')}`);
    // The berths SURVIVE (they are the engine's markup); their text must not.
    const speaking = [...doc.querySelectorAll('.overflow-tab, .illegible-tab, .fixme-tab')]
      .filter((el) => (el.textContent || '').trim() !== '' || el.hasAttribute('title'))
      .map((el) => `${el.className}="${el.textContent}"`);
    assert.deepEqual(speaking, [], `marker chrome still speaks after the sweep: ${speaking.join(', ')}`);
    assert.equal(doc.querySelectorAll('.overflow-tab, .illegible-tab, .fixme-tab').length, 3,
      'the berths themselves are markup and must survive — the sweep empties, it does not delete');
    const culprits = [...doc.querySelectorAll('.fit-culprit, [data-fit-label], [data-fit-hint]')]
      .map((el) => el.className);
    assert.deepEqual(culprits, [], `Fix-Me culprit marks survived the sweep: ${culprits.join(', ')}`);
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
