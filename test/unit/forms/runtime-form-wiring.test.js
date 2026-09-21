/**
 * Runtime Form wiring — the end-to-end guard for the regression that shipped once
 * (engineering/decisions/2026-07-08-runtime-form-default.md): a raw-Marp deck
 * rendered through the browser runtime composed Form-blind because nothing stamped
 * `section.form` (masthead-lift) or `section[data-lattice-slide]` (the Tiles).
 *
 * The runtime's `runAllContentTransforms` runs, in order:
 *   applyFormDefaultToDom → registry.applyAllToDom (incl. masthead-lift) →
 *   progressTile.applyToDom → watermarkTile.applyToDom
 * This chains the SAME kernels on a jsdom document (the bootstrap IIFE itself is
 * browser-only and not requireable), asserting the full chrome layer materializes
 * on a deck that arrives WITHOUT any `form` class or slide marker — exactly the
 * raw-Marp shape Marp emits. If any link regresses (form no longer stamped, a Tile
 * re-scoped, the dock order broken), this fails.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { applyFormDefaultToDom } = require('../../../lib/forms/form-default');
const mastheadAdapter = require('../../../lib/transformers/masthead-lift');
const progressTile = require('../../../lib/forms/tile/progress/progress.transform');
const watermarkTile = require('../../../lib/forms/tile/watermark/watermark.transform');

// Raw-Marp DOM: `_class` -> section class, NO `form`, NO data-lattice-slide.
const RAW = `
  <section class="title silent"><h1>Deck</h1></section>
  <section class="divider"><p><code>Section 01</code></p><h2>The Lift</h2></section>
  <section class="content watermark"><p><code>Context</code></p><h2>On by default.</h2><p>Body.</p></section>
  <section class="cards-grid"><h2>Composes.</h2><ul><li>a<ul><li>x</li></ul></li></ul></section>
  <section class="closing silent"><h1>End.</h1></section>`;

function runRuntimePass(html) {
  const doc = new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
  applyFormDefaultToDom(doc);
  mastheadAdapter.applyToDom(doc);
  progressTile.applyToDom(doc);
  watermarkTile.applyToDom(doc);
  return doc;
}

describe('runtime Form wiring — raw Marp deck composes as Form', () => {
  test('the full chrome layer materializes on eligible slides only', () => {
    const doc = runRuntimePass(RAW);
    // EVERY slide composes as Form — stated on the attributes, which all five carry.
    assert.equal(doc.querySelectorAll('section[data-form="2d"]').length, 5);
    // The three sovereign Frames name themselves POSITIVELY and host no chrome Cells,
    // so they take no chrome hook.
    for (const cls of ['title', 'divider', 'closing']) {
      const sec = doc.querySelector(`section.${cls}`);
      assert.equal(sec.getAttribute('data-form'), '2d', `${cls} composes as Form`);
      assert.equal(sec.getAttribute('data-frame'), cls, `${cls} names its Frame`);
      assert.equal(sec.classList.contains('form'), false, `${cls} takes no chrome hook`);
    }
    // ...so the chrome layer lands on the two chrome-hosting slides only.
    assert.equal(doc.querySelectorAll('section.form').length, 2);
    assert.equal(doc.querySelectorAll('section[data-frame="standard"]').length, 2);
    // masthead bands built by masthead-lift on the chrome-hosting slides.
    assert.equal(doc.querySelectorAll('.cell-masthead').length, 2);
    // progress rail docked on the chrome-hosting slides within a divider section.
    assert.equal(doc.querySelectorAll('.tile-progress').length, 2);
    // watermark glyph on the single `watermark` form slide.
    assert.equal(doc.querySelectorAll('.tile-watermark').length, 1);
    // every top-level slide marked so slide-scoped passes can see it.
    assert.equal(doc.querySelectorAll('section[data-lattice-slide]').length, 5);
  });

  test('a deck-wide `no-form` no longer opts the deck out — Form is not optional', () => {
    // Marpit propagates a global `class:` to every section; simulate that. The token
    // is retired, so a deck carrying it composes exactly as it would without it.
    const optedOut = RAW.replace(/class="(?!.*\bsilent\b)/g, 'class="no-form ')
      .replace(/class="title silent"/, 'class="title silent no-form"')
      .replace(/class="closing silent"/, 'class="closing silent no-form"');
    const doc = runRuntimePass(optedOut);
    const clean = runRuntimePass(RAW);
    assert.equal(doc.querySelectorAll('section.form').length, clean.querySelectorAll('section.form').length);
    assert.equal(doc.querySelectorAll('section[data-form="2d"]').length, 5, 'every slide still composes as Form');
    assert.equal(doc.querySelectorAll('.cell-masthead').length, clean.querySelectorAll('.cell-masthead').length);
  });

  test('idempotent — a second full pass adds nothing', () => {
    const doc = runRuntimePass(RAW);
    const snap = () => ({
      form: doc.querySelectorAll('section.form').length,
      masthead: doc.querySelectorAll('.cell-masthead').length,
      progress: doc.querySelectorAll('.tile-progress').length,
      watermark: doc.querySelectorAll('.tile-watermark').length,
    });
    const before = JSON.stringify(snap());
    applyFormDefaultToDom(doc);
    mastheadAdapter.applyToDom(doc);
    progressTile.applyToDom(doc);
    watermarkTile.applyToDom(doc);
    assert.equal(JSON.stringify(snap()), before);
  });
});
