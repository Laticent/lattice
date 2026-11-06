/**
 * Export-to-Marp's hide bake (lib/core/bake-splits.js `bakeHidden`, and `bakeSplits` on a hidden block):
 * engineering/decisions/2026-11-06-hidden-slides.md. Marp reads only the spot form `<!-- _hide: true -->` (the
 * bundle's engine, lib/export/marp-bundle-html.js, leaves such a slide out), so every hide is rewritten to it, and a
 * hidden block's every baked part carries it.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { bakeSplits, bakeHidden } = require('../../../lib/core/bake-splits');
const { render } = require('../../../lib/engine');

const slidesOf = (deck) => deck.replace(/^---\n[\s\S]*?\n---\n/, '').split(/\n---\n/);
const hiddenIn = (deck) => slidesOf(deck).map((s) => /^<!-- _hide: true -->$/m.test(s));

test('every spelling of an on hide becomes `<!-- _hide: true -->`; an off hide is removed', () => {
  const deck = '---\ntheme: indaco\n---\n\n<!-- hide -->\n# A\n\n---\n\n<!-- _hide -->\n# B\n\n---\n\n<!-- hide: yes -->\n# C\n\n---\n\n<!-- _hide: false -->\n# D\n';
  const out = bakeHidden(deck);
  assert.deepEqual(hiddenIn(out), [true, true, true, false]);
  assert.doesNotMatch(out, /<!-- (hide|_hide: (yes|false)|_hide) -->/);
});

test('a hide in code, or inside a line, is left as written', () => {
  const deck = '---\ntheme: indaco\n---\n\n# A\n\n```md\n<!-- hide -->\n```\n\nSay `<!-- hide -->` to hide. Text <!-- hide --> here.\n';
  assert.equal(bakeHidden(deck), deck);
});

test('a deck with no hide comes back byte for byte', () => {
  const deck = '---\ntheme: indaco\n---\n\n# A\n\n<!-- a note -->\n\n---\n\n# B\n';
  assert.equal(bakeHidden(deck), deck);
});

test('split: headings — every baked part of a hidden block is hidden, once, and the result matches the engine', () => {
  const deck = '---\ntheme: indaco\nsplit: headings\n---\n\n## A\n\n---\n\n<!-- hide -->\n## C1\n\nc\n\n## C2\n\n---\n\n## D1\n\nd\n\n<!-- hide -->\n## D2\n\n---\n\n## E\n';
  const out = bakeHidden(bakeSplits(deck));
  assert.deepEqual(hiddenIn(out), [false, true, true, true, true, false]);
  for (const s of slidesOf(out)) assert.ok((s.match(/<!-- _hide: true -->/g) || []).length <= 1, s);
  // The baked deck, rendered by Lattice, hides the same slides the original does.
  const marks = (md) => [...render(md).html.matchAll(/<section[^>]*>/g)].map((m) => /data-lattice-hidden/.test(m[0]));
  assert.deepEqual(marks(out), marks(deck));
});
