// Unit: tools/preview-component.js — the pure deck/CSS assembly helpers.
// The render itself needs Chromium (covered by manual visual review, not here);
// these lock the faithful-assembly contract that fixes the "CSS arg replaces
// lattice.css" trap (a generated component must render WITH the frame).

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { combineCss, buildDeck } = require('../../../tools/preview-component.js');
// The CONSTANT, not a literal — this case is about buildDeck falling back at all,
// not about which palette it falls back to (lib/core/default-palette.mjs).
const { DEFAULT_PALETTE } = require('../../../lib/core/default-palette.mjs');

describe('preview-component — faithful assembly', () => {
  test('combineCss keeps lattice.css FIRST, then the component CSS (frame is not replaced)', () => {
    const out = combineCss('/* lattice frame */ section{}', 'section.x > .cell-stage{}');
    assert.ok(out.indexOf('/* lattice frame */') < out.indexOf('section.x > .cell-stage{}'), 'lattice.css precedes the component CSS');
    assert.match(out, /section\.x > \.cell-stage\{\}/);
  });

  test('buildDeck wraps a bare skeleton in deck front-matter', () => {
    const deck = buildDeck('<!-- _class: cards -->\n\n## H\n', { theme: 'indaco' });
    assert.match(deck, /^---\nmarp: true\ntheme: indaco\npaginate: true\n---\n/);
    assert.match(deck, /<!-- _class: cards -->/);
  });

  test('buildDeck strips a skeleton\'s own front-matter (no double front-matter)', () => {
    const deck = buildDeck('---\nmarp: true\ntheme: other\n---\n\n<!-- _class: cards -->\n\n## H\n', { theme: 'indaco' });
    assert.equal((deck.match(/^---$/gm) || []).length, 2, 'exactly one front-matter block');
    assert.match(deck, /theme: indaco/);
    assert.doesNotMatch(deck, /theme: other/);
  });

  test('buildDeck defaults the theme', () => {
    assert.match(buildDeck('<!-- _class: x -->'), new RegExp(`theme: ${DEFAULT_PALETTE}\n`));
  });
});
