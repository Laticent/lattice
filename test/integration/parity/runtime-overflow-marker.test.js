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
async function boot({ block = '', markup = SLIDE, specimen = false, overflowing = false } = {}) {
  const dom = new JSDOM(
    `<!DOCTYPE html><html${specimen ? ' data-lattice-specimen' : ''}><head></head><body>${markup}${block}</body></html>`,
    { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  // GEOMETRY, or the assertion is over an empty set. jsdom lays nothing out, so every element
  // reports scrollHeight === clientHeight === 0 and `probeSectionOverflow` finds no overflow AT ANY
  // LEVEL — which means a test that only asserts "no ring, no tab" passes just as happily with the
  // fix reverted. (It did: the first cut of the specimen suite below was exactly that hollow gate,
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

// A marker tab that SPEAKS — the property that replaced "a tab exists".
//
// The three tabs are BERTHS the markup carries now (lib/core/fit-berth.js), so
// counting elements no longer answers "is a marker drawn": every slide has three
// of them, always, empty. What a reader can see is the TEXT, so that is what
// these assertions read. The distinction is the whole change — a watcher that
// creates and destroys chrome is a watcher whose DOM writes feed the observer
// that scheduled it.
const speakingTabs = (doc) => [...doc.querySelectorAll('.overflow-tab, .illegible-tab, .fixme-tab')]
  .filter((el) => (el.textContent || '').trim() !== '')
  .map((el) => `${el.className}="${el.textContent}"`);

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
    assert.deepEqual(speakingTabs(document), [], 'the tabs say nothing');
    dom.window.close();
  });
});

describe('a SPECIMEN document is watched by nothing (#1463)', () => {
  // A SPECIMEN is a catalog sample the author did not write and cannot edit — the add-slide
  // gallery's tiles. The watcher has no addressee there, and its cost is per-DOCUMENT so it
  // multiplies by every frame the grid holds open. `<html data-lattice-specimen>` routes it
  // to `off`, the level that installs nothing. A thumbnail of the AUTHOR'S OWN slide is not
  // a specimen and keeps its watcher — the unflagged control below is what pins that.
  test('a specimen resolves to `off` — no authoring signal, whatever the surface default', async () => {
    const dom = await boot({ specimen: true });
    assert.deepEqual(levelsOn(dom.window.document), ['off'],
      'no export-settings block, so this document would otherwise be an authoring surface at `author`');
    dom.window.close();
  });

  // THE POSITIVE CONTROL, and it has to come first: it proves the geometry harness really does
  // make the watcher fire, so the silence asserted below is the specimen flag's doing and not
  // jsdom's. Without this pair the "no ring, no tab" assertion is over an empty set — the exact
  // hollow-gate shape this repo has shipped once before.
  test('CONTROL: the same overflowing document, unflagged, IS marked', async () => {
    const dom = await boot({ overflowing: true });
    const { document } = dom.window;
    assert.deepEqual(levelsOn(document), ['author']);
    assert.equal(document.querySelectorAll('section.overflow').length, 1, 'the harness must make the probe fire');
    // BOTH author registers, which is what `author` means: the geometry tab names the
    // defect, and the Fix-Me label names the box to fix (the Form default wraps this
    // slide's body in a `.cell-stage`, so it is Case A — a clip cell that is genuinely
    // over, not the hedged density guess).
    assert.deepEqual(speakingTabs(document),
      ['overflow-tab="Overflows"', 'fixme-tab="Fix Me"'], 'author level fills the tabs');
    assert.equal(document.querySelectorAll('.fit-culprit').length, 1,
      'and outlines the culprit cell in place — no overlay layer');
    dom.window.close();
  });

  // The load-bearing half, now with something to be silent ABOUT. `off` is not "a quieter mark" —
  // it returns before any probe exists, which is the whole reason a specimen uses it.
  test('an overflowing SPECIMEN draws nothing at all', async () => {
    const dom = await boot({ specimen: true, overflowing: true });
    const { document } = dom.window;
    assert.deepEqual(levelsOn(document), ['off']);
    assert.equal(document.querySelectorAll('section.overflow, section.illegible').length, 0, 'a ring was drawn');
    assert.deepEqual(speakingTabs(document), [], 'a tab was drawn');
    dom.window.close();
  });

  // …and stays silent when the DOM changes under it, which is what "installs nothing" means in
  // practice: the shared post-mutation dispatch still runs (patchSectionGeometry owns it and is
  // deliberately kept), so a re-marking watcher WOULD get another chance here. It must not take it.
  test('nothing is installed — a later mutation still draws nothing', async () => {
    const dom = await boot({ specimen: true, overflowing: true });
    const { document } = dom.window;
    const s = document.querySelector('section[data-lattice-slide]');
    s.setAttribute('data-poke', '1');
    s.insertAdjacentHTML('beforeend', '<p>more content, arriving after boot</p>');
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(document.querySelectorAll('.overflow, .illegible').length, 0, 'no ring was drawn');
    assert.deepEqual(speakingTabs(document), [], 'no tab was drawn');
    dom.window.close();
  });

  // Strictly better than the bypass this replaced: a document that arrives pre-marked
  // (a build-time stamp, or an earlier pass at a louder level) is CLEANED, not left
  // carrying chrome nobody will ever remove.
  test('a pre-marked specimen is swept clean', async () => {
    const marked = '<section class="content overflow illegible">'
      + '<h2>T</h2><div class="overflow-tab">Overflows</div>'
      + '<div class="illegible-tab">Type 3px · floor 8.4px</div></section>';
    const dom = await boot({ markup: marked, specimen: true });
    const { document } = dom.window;
    assert.deepEqual(levelsOn(document), ['off']);
    assert.equal(document.querySelectorAll('.overflow, .illegible').length, 0);
    assert.deepEqual(speakingTabs(document), []);
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

  // A specimen is a RENDER TARGET, like an export — so if a document somehow carried
  // both signals, the specimen wins. There is no surface that produces both today; this
  // pins the precedence so a future one cannot resolve it by accident.
  test('the specimen flag outranks an export-settings block', async () => {
    const dom = await boot({ block: exportSettingsBlock({ overflowMarker: 'author' }), specimen: true });
    assert.deepEqual(levelsOn(dom.window.document), ['off']);
    dom.window.close();
  });
});

describe('the CALLER-level guarantees, which no kernel test can reach', () => {
  // Three fixes landed in this subsystem whose bugs lived in the WATCHER, not in
  // the pure kernels — and the HARD RULE #25 checker demonstrated that reverting
  // each one left the whole suite green. `git show` on the fix commit's kernel
  // diff is empty; the kernels never had the bugs. So these drive the real bundle
  // and assert the caller's behavior directly.

  // ── the fit cache must record MEASUREMENT, not intent ────────────────────
  //
  // `sweep()` used to stamp every PLANNED section as measured before `check()` had
  // probed any. `check()` is one loop, so a throw on slide k left k+1..N unprobed
  // but marked current at that generation — and the scroll path deliberately does
  // NOT open a new generation, so they were skipped as already-done forever.
  test('a probe that throws does not mark the slides it never reached as measured', async () => {
    const three = ['a', 'b', 'c']
      .map((id) => `<section class="content" id="${id}"><h2>${id}</h2><p>Body.</p></section>`)
      .join('');
    const dom = await boot({ markup: three, overflowing: true });
    const { document, window } = dom.window;
    // Break the content probe for EVERY slide, clear the verdicts, and force a
    // fresh sweep. Nothing may be recorded as measured.
    window.Range.prototype.getClientRects = function boom() { throw new Error('probe boom'); };
    for (const s of document.querySelectorAll('section')) s.classList.remove('overflow');
    window.latticeSweep.sweep();
    // Repair, then sweep at the SAME generation — the scroll path's exact shape.
    window.Range.prototype.getClientRects = function ok() { return []; };
    const plan = window.latticeSweep.complete();
    assert.equal(plan.measure.length, 3,
      'all three must be re-planned without a new generation — recording them from the PLAN is what made them unrecoverable');
    assert.equal(document.querySelectorAll('section.overflow').length, 3, 'and marked');
    dom.window.close();
  });

  // ── a characterData-only edit must be noticed ────────────────────────────
  //
  // The sweep rides an observer that watches childList + subtree only, so a text
  // node grown in place triggered nothing: measured at 1613px of overflow, silent
  // indefinitely. No file under test/ or docs/e2e/ mentioned `characterData`
  // before this.
  test('growing a text node IN PLACE is noticed — characterData is observed', async () => {
    const dom = await boot();
    const { document, window } = dom.window;
    assert.equal(document.querySelectorAll('section.overflow').length, 0, 'clean to start');
    // Make the geometry overflowing only NOW, so the sweep this edit triggers is
    // the only thing that can produce the mark.
    Object.defineProperty(window.HTMLElement.prototype, 'scrollHeight', { configurable: true, get() { return 2000; } });
    Object.defineProperty(window.HTMLElement.prototype, 'clientHeight', { configurable: true, get() { return 700; } });
    if (!window.Range.prototype.getClientRects) {
      window.Range.prototype.getClientRects = function getClientRects() { return []; };
    }
    const walker = document.createTreeWalker(document.querySelector('section'), 4);
    let node = null;
    let n;
    while ((n = walker.nextNode())) if (n.nodeValue.trim()) node = n;
    node.nodeValue = 'word '.repeat(400); // characterData ONLY — no element added or removed
    await new Promise((r) => setTimeout(r, 900));
    assert.equal(document.querySelectorAll('section.overflow').length, 1,
      'a characterData mutation is a DOM mutation and must schedule a sweep');
    dom.window.close();
  });

  // ── the watcher's own writes must not schedule the pass that made them ───
  //
  // "Filling a berth is not a childList mutation" was FALSE — `textContent = x`
  // emits one childList record and zero characterData records, so the berth fill
  // fed the very observer that drove it. It settled only because every write is
  // inequality-guarded. The content observer now drops a burst that is entirely
  // marker chrome, so an overflowing deck settles in the same number of passes as
  // a clean one.
  test('filling a marker tab costs no extra pass — an overflowing deck settles like a clean one', async () => {
    const clean = await boot();
    const dirty = await boot({ overflowing: true });
    const gen = (d) => d.window.latticeSweep.generation();
    assert.equal(dirty.window.document.querySelectorAll('section.overflow').length, 1,
      'the dirty fixture must actually mark, or this compares two clean decks');
    assert.equal(gen(dirty), gen(clean),
      'drawing a marker must not schedule another content pass');
    clean.window.close();
    dirty.window.close();
  });
});
