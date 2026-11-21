/**
 * lib/core/code-paragraph.js finds code-only paragraphs in one pass, in place of regexes that were quadratic on markup with
 * many `<p` and no `>`, or many code spans and no `</p>` (HARD RULE #32, followups.d/3045-p2-regex-recheck-gate.md). Each
 * walker is held to the regex it replaced by a seeded differential fuzz (seed 3045, printed in every failure), and the
 * walk to linear work by counting the characters it reads and the characters `indexOf` scans.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { codeParagraphs, trailingCodeParagraph } = require('../../../lib/core/code-paragraph');
const { mulberry32 } = require('../../helpers/regex-differential');
const { charReads } = require('../../helpers/work-count');
const { assertLinearRegexes } = require('../../helpers/regex-trace');

// The regexes as they were. Tests sit outside the census, which reads lib/** only.
const LOOSE = /<p[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/p>/g;
const TIGHT = /<p\b[^>]*>\s*<code[^>]*>((?:(?!<\/code>)[\s\S])*)<\/code>\s*<\/p>/g;
const TRAILING = /<p[^>]*>\s*<code>([^<]+?)<\/code>\s*<\/p>\s*$/;
const all = (re, s) => [...s.matchAll(re)].map((m) => ({ index: m.index, end: m.index + m[0].length, inner: m[1] }));

const PIECES = ['<p>', '<p', '<pre>', '<p class="x">', '<px>', '>', '<', '<code>', '<code class="y">', '<code', '<codex>',
  '</code>', '</p>', '</pre>', ' ', '\n', '\u00a0', 'a', '{1}', '`', '/', '<h2>', '</h2>',
  // Whole paragraphs, so the trailing reading's edges (an empty body, a `<` inside it) come up often.
  '<p><code></code></p>', '<p><code>x</code></p>', '<p><code>a<b</code></p>', '<p> <code>y</code> </p>',
  // The checker's edges: blanks `\s` reads that a narrower test would not, and `<p` run into a word or `-` character.
  '\ufeff', '\u2028', '<p_>', '<p1>', '<p->'];
const draw = (rand, n) => {
  let s = '';
  const len = Math.floor(rand() * n);
  for (let j = 0; j < len; j++) s += PIECES[Math.floor(rand() * PIECES.length)];
  return s;
};

describe('the code-paragraph walkers answer as the regexes they replaced (seeded fuzz, seed 3045)', () => {
  const cases = [
    ['loose', (s) => codeParagraphs(s), (s) => all(LOOSE, s)],
    ['tight', (s) => codeParagraphs(s, { tight: true }), (s) => all(TIGHT, s)],
    ['loose, first only', (s) => codeParagraphs(s, { limit: 1 })[0] ?? null, (s) => all(LOOSE, s)[0] ?? null],
    ['trailing', (s) => trailingCodeParagraph(s), (s) => { const m = TRAILING.exec(s); return m ? { index: m.index, inner: m[1] } : null; }],
  ];
  for (const [name, neu, old] of cases) {
    test(`${name}: 80,000 draws, no input where old and new disagree`, () => {
      const rand = mulberry32(3045);
      for (let i = 0; i < 80000; i++) {
        const s = draw(rand, 14);
        assert.deepEqual(neu(s), old(s), `seed 3045, draw ${i}: ${JSON.stringify(s)}`);
      }
    });
  }
});

// `charReads` does not see `String.prototype.indexOf` / `lastIndexOf`: count the characters each call scans.
function withSearchCount(add, fn) {
  const { indexOf, lastIndexOf } = String.prototype;
  // The blank-run walk tests one character at a time with `/\s/`: count each regex call as one character read.
  const { exec } = RegExp.prototype;
  RegExp.prototype.exec = function (s) {
    add(1);
    return exec.call(this, s);
  };
  String.prototype.indexOf = function (needle, from = 0) {
    const at = indexOf.call(this, needle, from);
    add((at < 0 ? this.length : at + String(needle).length) - Math.max(0, from));
    return at;
  };
  String.prototype.lastIndexOf = function (needle, from = this.length) {
    const at = lastIndexOf.call(this, needle, from);
    add(Math.min(from, this.length) - (at < 0 ? 0 : at) + 1);
    return at;
  };
  try {
    return fn();
  } finally {
    String.prototype.indexOf = indexOf;
    String.prototype.lastIndexOf = lastIndexOf;
    RegExp.prototype.exec = exec;
  }
}

test('the trailing reading refuses an empty code span, as `[^<]+?` did', () => {
  assert.equal(trailingCodeParagraph('<p><code></code></p>'), null);
  assert.deepEqual(trailingCodeParagraph('<p class="e"> <code>Q3</code></p>\n'), { index: 0, inner: 'Q3' });
});

describe('the code-paragraph walkers are linear on the markup the regexes choked on', () => {
  const hostile = {
    'many `<p` with no `>`': (n) => '<p'.repeat(n),
    'many code paragraphs with no `</p>`': (n) => '<p><code>x</code>'.repeat(n),
    'many `<p><code` with no `>`': (n) => '<p><code'.repeat(n),
    // One far `>` that every start reaches: a walk that searched again from each `<p` would be quadratic here.
    'many `<p` and one `>` at the end': (n) => `${'<p'.repeat(n)}>`,
    'many `<p><code` and one `>` at the end': (n) => `${'<p> <code'.repeat(n)}>`,
    'many code paragraphs and one `</p>` far away': (n) => `${'<p><code>x</code> '.repeat(n)}</p>`,
    // Many starts sharing one `>`, or one `</code>`, and the long blank run after it (the maker-checker's two shapes).
    'many `<p`, one `>`, then a long blank run': (n) => `${'<p'.repeat(n)}>${' '.repeat(n)}x`,
    'many `<p><code>`, one `</code>`, then a long blank run': (n) => `${'<p><code>'.repeat(n)}</code>${' '.repeat(n)}x`,
  };
  for (const [label, make] of Object.entries(hostile)) {
    test(`${label}: four times the markup costs about four times the work`, () => {
      const work = (n) => {
        const src = make(n);
        let scanned = 0;
        const { reads } = charReads(() => withSearchCount((k) => { scanned += k; }, () => {
          codeParagraphs(src);
          codeParagraphs(src, { tight: true });
          trailingCodeParagraph(src);
        }));
        return reads + scanned;
      };
      const small = work(2000);
      const large = work(8000);
      // 1% of slack over 4x: the walk is linear with a small negative constant (its slices), and a quadratic one grows 16x.
      assert.ok(large <= 4.04 * small, `work grew from ${small} to ${large} for 4x the markup`);
    });
  }

  test('the walkers run only regexes the census calls linear (the one-character `\\s` and `\\w` tests)', () => {
    assertLinearRegexes(() => {
      codeParagraphs('<p> <code>x</code> </p>'.repeat(50), { tight: true });
      codeParagraphs('<p><code>x</code></p>'.repeat(50));
      trailingCodeParagraph('<p><code>x</code></p>');
    });
  });
});
