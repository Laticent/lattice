/**
 * Integration: the overflow-marker EXPORT SETTING, exercised through the REAL bundled
 * runtime (`dist/lattice-runtime.js`) in jsdom — the same harness shape as
 * runtime-frontmatter-refire.test.js, and for the same reason: the bootstrap IIFE
 * is not requireable, so a unit test can only reach the pure resolvers.
 *
 * That gap is exactly where the risk was. The adversarial trio on this change found
 * that every test pinned a pure function while the two pieces of actual WIRING had
 * none — and all three of the confirmed correctness findings lived in that gap:
 *
 *   1. `deckOverflowMarker`'s surface heuristic. With no explicit fallback the
 *      PRESENCE of an export-settings block decides the default: a block means an
 *      exported artifact (→ `reader`), no block means an authoring surface
 *      (→ `author`). Getting that backwards is the original reported defect — a
 *      delivered deck covered in "FIX ME" overlays — so it is pinned here.
 *   2. The per-section `data-lattice-overflow-marker` stamp. It is what the CSS
 *      tone rules key on; unstamped, a reader-level slide silently renders the
 *      author red ring. It is also what makes `off` survive a CONCURRENT watcher
 *      (the emulator embeds its own), which a one-shot JS sweep cannot.
 *
 * These assert the runtime's DOM decisions, not pixels — pixels are verified by
 * rendering the committed probe through real marp-cli
 * (test/fixtures/overflow-marker-probe.md; HARD RULE #23). A green run here is not
 * a claim about how the slide looks.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { exportSettingsBlock } = require('../../../lib/core/export-settings');

const RUNTIME_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js'),
  'utf8',
);

const SLIDE = '<section class="content"><h2>Title</h2><p>Body.</p></section>';

/**
 * Boot the real runtime over a document, optionally carrying an export-settings
 * block. `fetch` is stubbed to reject so no network fallback can quietly supply an
 * answer — everything here comes from the block or from the surface default.
 */
async function boot({ block = '', markup = SLIDE, thumbnail = false, overflowing = false } = {}) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html${thumbnail ? ' data-lattice-thumbnail' : ''}><head></head><body>${markup}${block}</body></html>`,
    { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  // GEOMETRY, or the assertion is over an empty set. jsdom lays nothing out, so every element
  // reports scrollHeight === clientHeight === 0 and `probeSectionOverflow` finds no overflow AT ANY
  // LEVEL — which means a test that only asserts "no ring, no tab" passes just as happily with the
  // fix reverted. (It did: the first cut of the thumbnail suite below was exactly that hollow gate,
  // caught by the adversarial trio.) Faking a section that is 2000px of content in a 700px box
  // makes the probe fire, so `author` really marks and `off` really does not, and the difference is
  // what the tests read. Installed BEFORE the runtime boots, and only for the cases that ask.
  if (overflowing) {
    Object.defineProperty(dom.window.HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return 2000; } });
    Object.defineProperty(dom.window.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 700; } });
    // jsdom's Range has no getClientRects, and the CONTENT probe walks text via a Range — so
    // without this `probeContentClipped` throws and aborts check() midway, after the ring is
    // toggled but before the tab is drawn. Returning no rects is the honest answer for a
    // layout-less DOM ("no text was measurably cut"), which leaves the GEOMETRY verdict above as
    // the thing under test and lets the pass run to completion.
    if (!dom.window.Range.prototype.getClientRects) {
      dom.window.Range.prototype.getClientRects = function getClientRects() { return []; };
    }
  }
  dom.window.fetch = () => Promise.reject(new Error('no network in this test'));
  const el = dom.window.document.createElement('script');
  el.textContent = RUNTIME_SRC;
  dom.window.document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 300));
  return dom;
}

const levelsOn = (doc) => [...doc.querySelectorAll('section[data-lattice-slide]')]
  .map((s) => s.getAttribute('data-lattice-overflow-marker'));

describe('overflow-marker — the surface heuristic decides the default', () => {
  // The defect that started this: an Export-to-Marp bundle renders through this
  // runtime inside marp-cli's browser, and with no signal it took the AUTHORING
  // default. The baked block IS the signal — it is written by one function and
  // only ever by an export producer.
  test('a document carrying an export-settings block is an export → reader', async () => {
    const dom = await boot({ block: exportSettingsBlock({ overflowMarker: 'reader' }) });
    assert.deepEqual(levelsOn(dom.window.document), ['reader']);
    dom.window.close();
  });

  test('a document with no export-settings block is an authoring surface → author', async () => {
    const dom = await boot();
    assert.deepEqual(levelsOn(dom.window.document), ['author']);
    dom.window.close();
  });

  test("the export's recorded level overrides the surface default, both ways", async () => {
    const asAuthor = await boot({ block: exportSettingsBlock({ overflowMarker: 'author' }) });
    assert.deepEqual(levelsOn(asAuthor.window.document), ['author'], 'a bundle can ask for the author signal');
    asAuthor.window.close();

    const asOff = await boot({ block: exportSettingsBlock({ overflowMarker: 'off' }) });
    assert.deepEqual(levelsOn(asOff.window.document), ['off']);
    asOff.window.close();
  });

  // A typo must never decide what a delivered artifact shows, and it must never
  // reach the CSS: an unnormalized level would stamp `quiet`, the `[…="reader"]`
  // gate would miss, and the slide would carry the reader's label inside the
  // author's red ring.
  test('an unrecognized value falls back to a REAL level, never stamps itself', async () => {
    const dom = await boot({ block: exportSettingsBlock({ overflowMarker: 'quiet' }) });
    assert.deepEqual(levelsOn(dom.window.document), ['reader']);
    dom.window.close();
  });

  // The altitude fix, pinned at the surface that matters: a deck key is not an
  // input any more. A bundle whose FRONT MATTER says `off` still renders `reader`,
  // because only the export's own settings block decides.
  test('a front-matter key is NOT an input — only the export settings decide', async () => {
    const { frontMatterBlock } = require('../../../lib/core/deck-front-matter');
    const dom = await boot({ block: frontMatterBlock('---\noverflow-marker: off\n---\n\n# A\n') });
    assert.deepEqual(levelsOn(dom.window.document), ['author'],
      'no export-settings block at all → an authoring surface, deck key ignored');
    dom.window.close();
  });
});

describe('overflow-marker — `off` clears what is already there and stays stamped', () => {
  // `off` returns before installing the probe, so the stamp has to happen on the
  // way out. It is the half that survives lattice-emulator.js's own inline watcher,
  // which re-adds `.overflow` on font-settle and on every resize — a race a
  // one-shot sweep loses, and the reason the suppression is also expressed in CSS.
  test('a pre-marked document is swept AND every slide is stamped off', async () => {
    const marked = '<section class="content overflow illegible">'
      + '<h2>T</h2><div class="overflow-tab">Overflows</div>'
      + '<div class="illegible-tab">Type 3px · floor 8.4px</div></section>';
    const dom = await boot({ markup: marked, block: exportSettingsBlock({ overflowMarker: 'off' }) });
    const { document } = dom.window;
    assert.deepEqual(levelsOn(document), ['off'], 'stamped, so the CSS suppression can key on it');
    assert.equal(document.querySelectorAll('.overflow, .illegible').length, 0, 'the rings are gone');
    assert.equal(document.querySelectorAll('.overflow-tab, .illegible-tab').length, 0, 'the tabs are gone');
    dom.window.close();
  });
});

describe('a THUMBNAIL document is watched by nothing (#1463)', () => {
  // A thumbnail is a miniature in a grid of its peers — the add-slide gallery, Present's
  // slide overview. The watcher has no addressee there (unreadable at ~260px, and in the
  // gallery it describes a catalog sample nobody can fix) and its cost is per-DOCUMENT,
  // so it multiplies by every frame the grid holds open. `<html data-lattice-thumbnail>`
  // routes it to `off`, the level that installs nothing.
  test('a thumbnail resolves to `off` — no authoring signal, whatever the surface default', async () => {
    const dom = await boot({ thumbnail: true });
    assert.deepEqual(levelsOn(dom.window.document), ['off'],
      'no export-settings block, so this document would otherwise be an authoring surface at `author`');
    dom.window.close();
  });

  // THE POSITIVE CONTROL, and it has to come first: it proves the geometry harness really does
  // make the watcher fire, so the silence asserted below is the thumbnail flag's doing and not
  // jsdom's. Without this pair the "no ring, no tab" assertion is over an empty set — the exact
  // hollow-gate shape this repo has shipped once before.
  test('CONTROL: the same overflowing document, unflagged, IS marked', async () => {
    const dom = await boot({ overflowing: true });
    const { document } = dom.window;
    assert.deepEqual(levelsOn(document), ['author']);
    assert.equal(document.querySelectorAll('section.overflow').length, 1, 'the harness must make the probe fire');
    assert.equal(document.querySelectorAll('.overflow-tab').length, 1, 'author level draws the tab');
    dom.window.close();
  });

  // The load-bearing half, now with something to be silent ABOUT. `off` is not "a quieter mark" —
  // it returns before any probe exists, which is the whole reason a thumbnail uses it.
  test('an overflowing THUMBNAIL draws nothing at all', async () => {
    const dom = await boot({ thumbnail: true, overflowing: true });
    const { document } = dom.window;
    assert.deepEqual(levelsOn(document), ['off']);
    assert.equal(document.querySelectorAll('section.overflow, section.illegible').length, 0, 'a ring was drawn');
    assert.equal(document.querySelectorAll('.overflow-tab, .illegible-tab').length, 0, 'a tab was drawn');
    dom.window.close();
  });

  // …and stays silent when the DOM changes under it, which is what "installs nothing" means in
  // practice: the shared post-mutation dispatch still runs (patchSectionGeometry owns it and is
  // deliberately kept), so a re-marking watcher WOULD get another chance here. It must not take it.
  test('nothing is installed — a later mutation still draws nothing', async () => {
    const dom = await boot({ thumbnail: true, overflowing: true });
    const { document } = dom.window;
    const s = document.querySelector('section[data-lattice-slide]');
    s.setAttribute('data-poke', '1');
    s.insertAdjacentHTML('beforeend', '<p>more content, arriving after boot</p>');
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(document.querySelectorAll('.overflow, .illegible').length, 0, 'no ring was drawn');
    assert.equal(document.querySelectorAll('.overflow-tab, .illegible-tab').length, 0, 'no tab was drawn');
    dom.window.close();
  });

  // Strictly better than the bypass this replaced: a document that arrives pre-marked
  // (a build-time stamp, or an earlier pass at a louder level) is CLEANED, not left
  // carrying chrome nobody will ever remove.
  test('a pre-marked thumbnail is swept clean', async () => {
    const marked = '<section class="content overflow illegible">'
      + '<h2>T</h2><div class="overflow-tab">Overflows</div>'
      + '<div class="illegible-tab">Type 3px · floor 8.4px</div></section>';
    const dom = await boot({ markup: marked, thumbnail: true });
    const { document } = dom.window;
    assert.deepEqual(levelsOn(document), ['off']);
    assert.equal(document.querySelectorAll('.overflow, .illegible, .overflow-tab, .illegible-tab').length, 0);
    dom.window.close();
  });

  // The flag is OPT-IN and nothing else sets it: every other surface — the Studio's own
  // full-size preview, the landing islands, the VS Code preview, an Export-to-Marp
  // bundle — must be byte-identical to before. This is the control for that claim, and
  // it is what e2e/reader-alarms.spec.ts' positive control depends on still being true.
  test('without the flag the surface default is untouched — still `author`', async () => {
    const dom = await boot();
    assert.deepEqual(levelsOn(dom.window.document), ['author']);
    dom.window.close();
  });

  // A thumbnail is a RENDER TARGET, like an export — so if a document somehow carried
  // both signals, the thumbnail wins. There is no surface that produces both today; this
  // pins the precedence so a future one cannot resolve it by accident.
  test('the thumbnail flag outranks an export-settings block', async () => {
    const dom = await boot({ block: exportSettingsBlock({ overflowMarker: 'author' }), thumbnail: true });
    assert.deepEqual(levelsOn(dom.window.document), ['off']);
    dom.window.close();
  });
});
