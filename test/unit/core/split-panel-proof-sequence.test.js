/**
 * proof sequencing — a `split-panel proof` slide takes its categorical tint
 * from its POSITION in the deck, not from an authored `cat-N`.
 *
 * The position is information the deck already states (the order the slides
 * appear in), so requiring the author to also type it is the same defect as a
 * hand-typed list ordinal: redundant, and silently wrong after a reorder or an
 * insertion. These lock the four behaviors that make the automatic assignment
 * safe to rely on.
 *
 * The DOM mirror (lib/transformers/split-panels.js sequenceProofPanels) is
 * covered alongside the other DOM parity cases in split-panels-dom.test.js.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { applyToRenderedHtml } = require('../../../lib/core/split-panels');

const BODY =
  '<p><code>Eyebrow</code></p><h2>Claim.</h2><p>Lede.</p>' +
  '<ul><li>Signal<ul><li>scenario</li></ul></li>' +
  '<li>One<ul><li>a</li></ul></li><li>Two<ul><li>b</li></ul></li></ul>';

const deck = (...classes) =>
  classes.map((c) => `<section class="${c}" data-class="${c}">${BODY}</section>`).join('');

const classesOf = (html) => [...html.matchAll(/<section class="([^"]*)"/g)].map((m) => m[1]);

describe('split-panel proof sequencing', () => {
  test('consecutive proof slides take cat-1, cat-2, cat-3 … by document order', () => {
    const out = applyToRenderedHtml(deck('split-panel proof', 'split-panel proof', 'split-panel proof'));
    assert.deepEqual(classesOf(out), [
      'split-panel proof cat-1',
      'split-panel proof cat-2',
      'split-panel proof cat-3',
    ]);
  });

  test('`capstone` implies `proof` — it only re-skins proof, it has no DOM of its own', () => {
    const out = applyToRenderedHtml(deck('split-panel capstone'));
    const cls = classesOf(out)[0];
    assert.match(cls, /(?<![\w-])proof(?![\w-])/, 'proof is added');
    assert.match(cls, /(?<![\w-])cat-1(?![\w-])/, 'and it joins the sequence');
  });

  test('a non-proof split-panel is neither tinted nor counted', () => {
    const out = applyToRenderedHtml(deck('split-panel proof', 'split-panel', 'split-panel proof'));
    assert.deepEqual(classesOf(out), [
      'split-panel proof cat-1',
      'split-panel', // untouched — the base dark panel is not part of any sequence
      'split-panel proof cat-2', // numbering ignores it rather than skipping a slot
    ]);
  });

  test('an authored cat-N wins, and still counts — one pinned hue must not shift the rest', () => {
    const out = applyToRenderedHtml(
      deck('split-panel proof', 'split-panel proof cat-7', 'split-panel proof'),
    );
    assert.deepEqual(classesOf(out), [
      'split-panel proof cat-1',
      'split-panel proof cat-7', // respected verbatim
      'split-panel proof cat-3', // 3rd in the run — NOT cat-2, so the override is inert downstream
    ]);
  });

  test('the palette cycles at 8 rather than running off the end', () => {
    const out = applyToRenderedHtml(deck(...Array(10).fill('split-panel proof')));
    const cats = classesOf(out).map((c) => c.match(/cat-\d/)[0]);
    assert.deepEqual(cats.slice(0, 8), ['cat-1','cat-2','cat-3','cat-4','cat-5','cat-6','cat-7','cat-8']);
    assert.deepEqual(cats.slice(8), ['cat-1', 'cat-2']);
  });

  test('the data-class mirror is rewritten too, so preview paths see the same list', () => {
    const out = applyToRenderedHtml(deck('split-panel capstone'));
    const dataCls = out.match(/data-class="([^"]*)"/)[1];
    assert.match(dataCls, /(?<![\w-])proof(?![\w-])/);
    assert.match(dataCls, /(?<![\w-])cat-1(?![\w-])/);
  });

  test('idempotent — a second pass does not append another cat-N', () => {
    const once = applyToRenderedHtml(deck('split-panel proof'));
    const twice = applyToRenderedHtml(once);
    assert.deepEqual(classesOf(twice), classesOf(once));
  });
});
