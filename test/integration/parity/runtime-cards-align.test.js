/**
 * Integration: the browser runtime stamps `data-cards` on EVERY section, at every family.
 *
 * WHY THIS EXISTS. The card-row composition a component declares in its manifest
 * (`cards`, baked into lib/core/cards-catalog.generated.js) is resolved by
 * lib/core/resolve-cards.js and stamped as `data-cards`, which base.tokens.css turns into
 * `--cards-align`. On a runtime-only surface — export-to-Marp, where Lattice's engine never
 * runs — the runtime is the ONLY thing that can stamp it.
 *
 * It shipped hung off two hooks that both skip the common case: `applyCachedDeckClass`
 * returns early on a deck contributing no tokens of its own, and a family-CHANGE guard never
 * fires at `wide`, because `data-family` is REMOVED there rather than set. So every wide
 * section on that surface got no attribute at all, `--cards-align` stayed unset,
 * `align-content` computed `normal`, and an explicit `_class: cards-spread` was ignored.
 *
 * The unit file (test/unit/parsing/resolve-cards.test.js) pins the SHAPE that keeps the call
 * reachable, by parsing the function body. It cannot see behavior. This file is the other
 * half: it boots the ACTUAL bundled dist/lattice-runtime.js in jsdom and reads the attribute
 * off the DOM, on input that carries none — which is the check the earlier "drove the real
 * runtime" claim skipped, by feeding it HTML the ENGINE had already stamped.
 *
 * jsdom has no layout, so `offsetWidth`/`offsetHeight` are 0 and `stampOrientation` returns
 * before doing anything. The stub below is what makes a family observable at all; it is the
 * one synthetic part, and it stands in for the box, never for the stamp.
 *
 * See engineering/decisions/2026-09-01-card-stack-vertical-alignment.md §11c.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { resolveCardsAlign } = require('../../../lib/core/resolve-cards');

const RUNTIME_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js'),
  'utf8',
);

// Aspect ratios one clear of each family boundary (lib/adaptive/families.js:
// wide >1.05, square 0.9–1.05, tall 0.5–0.9, strip ≤0.5).
const BOX = { wide: [1280, 720], square: [1000, 1000], tall: [720, 1000], strip: [400, 1000] };

const section = (cls) => `<section class="${cls}"><h2>T</h2><ul><li>A<ul><li>a</li></ul></li>`
  + `<li>B<ul><li>b</li></ul></li></ul></section>`;

/** Boot the real bundle with a stubbed box, so `stampOrientation` has a family to compute. */
const boot = async (body, family) => {
  const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${body}</body></html>`, {
    url: 'https://example.test/deck.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  const [w, h] = BOX[family];
  for (const [prop, v] of [['offsetWidth', w], ['offsetHeight', h]]) {
    Object.defineProperty(dom.window.HTMLElement.prototype, prop, { configurable: true, get: () => v });
  }
  dom.window.fetch = () => Promise.resolve({ ok: true, text: () => Promise.resolve('') });
  const el = dom.window.document.createElement('script');
  el.textContent = RUNTIME_SRC;
  dom.window.document.body.appendChild(el);
  await new Promise((r) => setTimeout(r, 250));
  return dom;
};

const cardsOf = (document, sel = 'section') =>
  document.querySelector(sel).getAttribute('data-cards');

describe('runtime card-row composition — stamped on every section, at every family', () => {
  // THE regression. `wide` is the family nearly every deck uses AND the one the old
  // change-guard could never fire on, so a pass here at square/tall alone proves nothing.
  for (const family of Object.keys(BOX)) {
    test(`a silent deck gets the component's manifest default at ${family}`, async () => {
      const dom = await boot(section('cards-grid'), family);
      const expected = resolveCardsAlign({ classes: ['cards-grid'], family });
      assert.equal(cardsOf(dom.window.document), expected,
        `cards-grid must be stamped ${expected} at ${family} — the input carries no data-cards`);
      dom.window.close();
    });
  }

  test('a per-slide `_class: cards-*` beats the manifest, at wide', async () => {
    const dom = await boot(section('cards-grid cards-spread'), 'wide');
    assert.equal(cardsOf(dom.window.document), 'spread',
      'an explicit author choice was silently ignored at wide before this fix');
    dom.window.close();
  });

  test('an ungoverned component is not stamped at all', async () => {
    const dom = await boot(section('kpi'), 'wide');
    assert.equal(cardsOf(dom.window.document), null,
      'a component with no manifest `cards` entry must be left exactly as it was');
    dom.window.close();
  });

  test('the coda value rides along as data-cards-coda, for CSS to test the shape', async () => {
    const dom = await boot(section('cards-grid'), 'wide');
    const s = dom.window.document.querySelector('section');
    assert.equal(s.getAttribute('data-cards'), 'center');
    assert.equal(s.getAttribute('data-cards-coda'), 'stretch',
      'the manifest withCoda value must be carried, since a token stream cannot see the cell');
    dom.window.close();
  });

  test('every section in a multi-slide deck is stamped, not just the first', async () => {
    const dom = await boot(
      [section('cards-grid'), section('verdict-grid'), section('kpi')].join(''), 'wide');
    const got = [...dom.window.document.querySelectorAll('section')]
      .map((s) => s.getAttribute('data-cards'));
    assert.deepEqual(got, ['center', 'center', null]);
    dom.window.close();
  });
});
