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
// A slide is hidden in Marp when its LAST `_hide` line is true.
const hiddenIn = (deck) => slidesOf(deck).map((s) => ([...s.matchAll(/^<!-- _hide: (true|false) -->$/gm)].pop() || [])[1] === 'true');

test('every spelling of an on hide becomes `<!-- _hide: true -->`; an off hide becomes `<!-- _hide: false -->`', () => {
  const deck = '---\ntheme: indaco\n---\n\n<!-- hide -->\n# A\n\n---\n\n<!-- _hide -->\n# B\n\n---\n\n<!-- hide: yes -->\n# C\n\n---\n\n<!-- _hide: false -->\n# D\n';
  const out = bakeHidden(deck);
  assert.deepEqual(hiddenIn(out), [true, true, true, false]);
  assert.doesNotMatch(out, /<!-- (hide|_hide: yes|_hide) -->/);
  assert.match(out, /<!-- _hide: false -->\n# D/);
});

test('`_hide: false` after a hide keeps the slide shown in Marp, as in Lattice', () => {
  const deck = '---\ntheme: indaco\n---\n\n# A\n\n---\n\n<!-- hide -->\n# B\n\n<!-- _hide: false -->\n';
  assert.deepEqual(hiddenIn(bakeHidden(deck)), [false, false]);
});

test('a hide with no on/off value is a note, left as written', () => {
  const deck = '---\ntheme: indaco\n---\n\n# A\n\n<!-- hide: if short on time -->\n';
  assert.equal(bakeHidden(deck), deck);
});

test('a hide in code, or inside a line, is left as written', () => {
  const deck = '---\ntheme: indaco\n---\n\n# A\n\n```md\n<!-- hide -->\n```\n\nSay `<!-- hide -->` to hide. Text <!-- hide --> here.\n';
  assert.equal(bakeHidden(deck), deck);
});

test('a deck with no hide comes back byte for byte', () => {
  const deck = '---\ntheme: indaco\n---\n\n# A\n\n<!-- a note -->\n\n---\n\n# B\n';
  assert.equal(bakeHidden(deck), deck);
});

test('split: headings — every baked part takes its block\'s state, and the result matches the engine', () => {
  const deck = '---\ntheme: indaco\nsplit: headings\n---\n\n## A\n\n---\n\n<!-- hide -->\n## C1\n\nc\n\n## C2\n\n---\n\n## D1\n\nd\n\n<!-- hide -->\n## D2\n\n---\n\n<!-- hide -->\n## B1\n\n<!-- _hide: false -->\n## B2\n\n---\n\n## E\n';
  const out = bakeHidden(bakeSplits(deck));
  assert.deepEqual(hiddenIn(out), [false, true, true, true, true, false, false, false]);
  // The baked deck, rendered by Lattice, hides the same slides the original does.
  const marks = (md) => [...render(md).html.matchAll(/<section[^>]*>/g)].map((m) => /data-lattice-hidden/.test(m[0]));
  assert.deepEqual(marks(out), marks(deck));
});
