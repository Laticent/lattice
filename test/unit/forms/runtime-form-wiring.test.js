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
    // form on the two eligible content slides; sovereign frames skipped.
    assert.equal(doc.querySelectorAll('section.form').length, 2);
    for (const cls of ['title', 'divider', 'closing']) {
      assert.equal(doc.querySelector(`section.${cls}`).classList.contains('form'), false,
        `${cls} must stay Form-free`);
    }
    // masthead bands built by masthead-lift on the formed slides.
    assert.equal(doc.querySelectorAll('.cell-masthead').length, 2);
    // progress rail docked on the form slides within a divider section.
    assert.equal(doc.querySelectorAll('.tile-progress').length, 2);
    // watermark glyph on the single `watermark` form slide.
    assert.equal(doc.querySelectorAll('.tile-watermark').length, 1);
    // every top-level slide marked so slide-scoped passes can see it.
    assert.equal(doc.querySelectorAll('section[data-lattice-slide]').length, 5);
  });

  test('a deck-wide `no-form` (Marpit global class) opts the whole deck out', () => {
    // Marpit propagates a global `class:` to every section; simulate that.
    const optedOut = RAW.replace(/class="(?!.*\bsilent\b)/g, 'class="no-form ')
      .replace(/class="title silent"/, 'class="title silent no-form"')
      .replace(/class="closing silent"/, 'class="closing silent no-form"');
    const doc = runRuntimePass(optedOut);
    assert.equal(doc.querySelectorAll('section.form').length, 0);
    assert.equal(doc.querySelectorAll('.cell-masthead').length, 0);
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
