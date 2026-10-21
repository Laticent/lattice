/**
 * Unit: Export to Marp numbers the slides Lattice numbers (lib/core/marp-bundle-scope.js).
 *
 * Page numbers are on by default in Lattice and set by class and manifest, so the bundle writes Marp's own `paginate`
 * directives to match. Only the comments the engine reads as directives are touched. The slide-only `header:` /
 * `footer:` rewrite is the producers' step, tested in marp-slide-only.test.js.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { withMarpScope } = require('../../../lib/core/marp-bundle-scope');
const { withRuntimeScriptsReport } = require('../../../lib/core/marp-bundle');
const { render } = require('../../../lib/engine');

test('Marp numbers the deck as Lattice does: on by default, a manifest or a class opts a slide out or in', () => {
  const deck = '---\nmarp: true\n---\n\n<!-- _class: title -->\n\n# T\n\n---\n\n# B\n\n---\n\n<!-- _class: content no-pagination -->\n\n# N\n\n---\n\n<!-- _class: closing with-pagination -->\n\n# C\n';
  const out = withMarpScope(deck);
  assert.match(out, /^---\nmarp: true\npaginate: true\n---\n/);
  // The `_paginate` line opens the slide it governs, so it never lands inside a list or a quote.
  assert.match(out, /---\n<!-- _paginate: false -->\n\n<!-- _class: title -->/, 'the title\'s manifest opt-out reaches Marp');
  assert.match(out, /---\n<!-- _paginate: false -->\n\n<!-- _class: content no-pagination -->/);
  assert.equal(out.match(/_paginate/g).length, 2, 'with-pagination on a numbered deck needs nothing');
  assert.equal(withMarpScope(out), out, 'a second pass changes nothing');
});

test('a deck that turns numbering off keeps it off in Marp, and with-pagination still numbers its slide', () => {
  const out = withMarpScope('---\npaginate: false\n---\n\n<!-- _class: closing with-pagination -->\n\n# C\n');
  assert.match(out, /^---\npaginate: false\n---/);
  assert.match(out, /---\n<!-- _paginate: true -->\n\n<!-- _class: closing with-pagination -->/);
});

// The red team's and the checker's cases (2026-10-20), each a deck where Marp and Lattice disagreed.
const pages = (deck) => {
  const out = withMarpScope(deck);
  const fm = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---/.exec(out);
  const on = /^paginate: true$/m.test(fm ? fm[1] : '');
  return out.slice(fm ? fm[0].length : 0).split(/\r?\n---\r?\n/).map((sl) => {
    const v = /<!-- _paginate: (true|false) -->/.exec(sl);
    return v ? v[1] === 'true' : on;
  });
};

test('a class line right after the closing fence is read (no blank line)', () => {
  assert.deepEqual(pages('---\ntheme: indaco\n---\n<!-- _class: title -->\n# A\n\n---\n\n# B\n'), [false, true]);
});

test('a BOM is kept and stepped over: the front matter stays front matter', () => {
  const out = withMarpScope('\uFEFF---\npaginate: false\ntheme: indaco\n---\n\n# a\n');
  assert.ok(out.startsWith('\uFEFF---\npaginate: false\ntheme: indaco\n---'));
});

test('front-matter class, a running plain class, two _class lines and a quoted class all count', () => {
  assert.deepEqual(pages('---\nclass: no-pagination\n---\n\n# A\n\n---\n\n# B\n'), [false, false]);
  assert.deepEqual(pages('---\nmarp: true\n---\n\n# A\n\n---\n\n<!-- class: title -->\n\n# B\n\n---\n\n# C\n'), [true, false, false]);
  assert.deepEqual(pages('---\nmarp: true\n---\n\n<!-- _class: title -->\n<!-- _class: big-number -->\n\n# A\n'), [true]);
  assert.deepEqual(pages('---\nmarp: true\n---\n\n<!-- _class: big-number --> <!-- _class: title -->\n\n# A\n'), [false]);
  assert.deepEqual(pages('---\nmarp: true\n---\n\n<!-- _class: "title" -->\n\n# A\n'), [false]);
});

test('every paginate: spelling Lattice reads is written the one way Marp reads', () => {
  for (const v of ['False', 'no', 'off', '0', 'false # quiet', "'false'"]) {
    assert.match(withMarpScope(`---\npaginate: ${v}\n---\n\n# A\n`), /^---\npaginate: false\n---/, v);
  }
  assert.match(withMarpScope('---\npaginate: yes\n---\n\n# A\n'), /^---\npaginate: true\n---/);
});

test('a paginate comment in a quote or before other text is dropped too; a CRLF deck stays CRLF', () => {
  const out = withMarpScope('---\nmarp: true\n---\n\n> <!-- _paginate: false -->\n\n<!-- _paginate: false --> trailing\n');
  assert.doesNotMatch(out, /paginate: false/);
  assert.match(out, /trailing/);
  assert.doesNotMatch(withMarpScope('---\r\nmarp: true\r\n---\r\n\r\n# A\r\n'), /[^\r]\n/);
});

test('a class inside a list item gets no bullet of its own', () => {
  const out = withMarpScope('---\nmarp: true\n---\n\n- <!-- _class: title -->\n\n# A\n');
  assert.doesNotMatch(out, /- <!-- _paginate/);
  assert.deepEqual(pages('---\nmarp: true\n---\n\n- <!-- _class: title -->\n\n# A\n'), [false]);
});

test('a retired paginate comment is dropped, since Lattice ignores it and Marp would obey it', () => {
  const out = withMarpScope('---\nmarp: true\n---\n\n# A\n\n<!-- _paginate: false -->\n<!-- paginate: false -->\n\n---\n\n# B\n');
  assert.doesNotMatch(out, /<!--\s*_?paginate/);
});

test('the bundle step writes the page numbers and leaves a plain header for the producers to rewrite', () => {
  const deck = '---\nmarp: true\ntheme: indaco\nheader: Deck\n---\n\n# A\n\n---\n\n<!-- header: Appendix -->\n<!-- paginate: false -->\n\n# B\n';
  const out = withRuntimeScriptsReport(deck).markdown;
  assert.match(out, /^paginate: true$/m);
  assert.doesNotMatch(out, /<!-- paginate: false -->/);
  assert.match(out, /<!-- header: Appendix -->/);
  assert.match(out, /^header: Deck$/m);
});

// The checker's case (2026-10-21): two comments on ONE line. The engine reads the line as one directive whose value runs
// on through the second comment, and a comment followed by text as none; the bundle used to read each comment alone.
// So this compares the bundle with the engine itself, not with a hand-written answer.
test('a line with two comments, or a comment and text, is numbered as the engine numbers it', () => {
  const engine = (deck) => [...String(render(deck, {}).html).matchAll(/<section\b[^>]*>/g)].map((m) => /data-lattice-pagination="\d+"/.test(m[0]));
  for (const line of [
    '<!-- _class: title --> <!-- _class: big-number -->',
    '<!-- _class: big-number --> <!-- _class: title -->',
    '<!-- header: H --> <!-- _class: no-pagination -->',
    '<!-- _class: title --> trailing',
    '<!-- _class: a --> <!-- _paginate: false -->',
  ]) {
    const deck = `---\nmarp: true\n---\n\n# A\n\n---\n\n${line}\n\n# B\n`;
    assert.deepEqual(pages(deck), engine(deck), line);
  }
});
