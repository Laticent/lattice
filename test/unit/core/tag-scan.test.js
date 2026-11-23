/**
 * lib/core/tag-scan.js `scanTags` reads tags in one pass in place of
 * `/<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g`, which scanned to the end of the text from every
 * `<a` with no `>` after it (HARD RULE #32, followups.d/3045-p2-regex-recheck-gate.md). Held to the regex by a seeded
 * differential fuzz (seed 3045, printed in every failure), and to linear work by counting what it reads and scans.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { scanTags } = require('../../../lib/core/tag-scan');
const { mulberry32 } = require('../../helpers/regex-differential');
const { charReads } = require('../../helpers/work-count');
const { assertLinearRegexes } = require('../../helpers/regex-trace');

// The regex as it was. Tests sit outside the census, which reads lib/** only.
const OLD = /<([a-zA-Z][a-zA-Z0-9-]*)\b[^>]*?(\/)?>|<\/([a-zA-Z][a-zA-Z0-9-]*)>/g;
const old = (s, from = 0) => {
  const re = new RegExp(OLD.source, 'g');
  re.lastIndex = from;
  const out = [];
  for (let m = re.exec(s); m; m = re.exec(s)) out.push({ index: m.index, m: [...m] });
  return out;
};
const neu = (s, from = 0) => scanTags(s, from).map((m) => ({ index: m.index, m: [...m] }));

// Names that end on a `-` or run into a `_` (where the regex gives characters back to find a word boundary), a `/`
// before and away from the `>`, close tags with and without their `>`, and stray `<` and `>`.
const PIECES = ['<a', '<a>', '<a/>', '<a />', '<a/ >', '<a-', '<a->', '<a-b', '<a_b>', '<ab_c>', '<1>', '<A>', '</a>', '</a',
  '</a->', '</a_b>', '</1>', '<div class="x">', '</div>', '<', '>', '/', '-', '_', 'x', ' ', '\n', '"', '<svg/>', '<br>'];
const draw = (rand, n) => {
  let s = '';
  const len = Math.floor(rand() * n);
  for (let j = 0; j < len; j++) s += PIECES[Math.floor(rand() * PIECES.length)];
  return s;
};

describe('scanTags answers as the regex it replaced (seeded fuzz, seed 3045)', () => {
  test('100,000 draws, every tag and every capture the same', () => {
    const rand = mulberry32(3045);
    for (let i = 0; i < 100000; i++) {
      const s = draw(rand, 14);
      assert.deepEqual(neu(s), old(s), `seed 3045, draw ${i}: ${JSON.stringify(s)}`);
    }
  });

  test('from a start offset, as `lastIndex` started the regex (20,000 draws)', () => {
    const rand = mulberry32(3045);
    for (let i = 0; i < 20000; i++) {
      const s = draw(rand, 14);
      const from = Math.floor(rand() * (s.length + 1));
      assert.deepEqual(neu(s, from), old(s, from), `seed 3045, draw ${i}, from ${from}: ${JSON.stringify(s)}`);
    }
  });
});

// `charReads` does not see `String.prototype.indexOf`: count the characters each call scans.
function withIndexOfCount(add, fn) {
  const orig = String.prototype.indexOf;
  String.prototype.indexOf = function (needle, from = 0) {
    const at = orig.call(this, needle, from);
    add((at < 0 ? this.length : at + String(needle).length) - Math.max(0, from));
    return at;
  };
  try {
    return fn();
  } finally {
    String.prototype.indexOf = orig;
  }
}

describe('scanTags is linear on the markup its regex choked on', () => {
  const hostile = {
    'many `<a` with no `>`': (n) => '<a '.repeat(n),
    'many `<a` and one `>` at the end': (n) => `${'<a '.repeat(n)}>`,
    'many `</a` with no `>`': (n) => '</a '.repeat(n),
  };
  for (const [label, make] of Object.entries(hostile)) {
    test(`${label}: four times the markup costs about four times the work`, () => {
      const work = (n) => {
        const src = make(n);
        let scanned = 0;
        const { reads } = charReads(() => withIndexOfCount((k) => { scanned += k; }, () => scanTags(src)));
        return reads + scanned;
      };
      const small = work(2000);
      const large = work(8000);
      assert.ok(large <= 4 * small + 64, `work grew from ${small} to ${large} for 4x the markup`);
    });
  }

  test('the scan runs no regex at all', () => {
    const { keys } = assertLinearRegexes(() => scanTags('<a '.repeat(100)));
    assert.equal(keys.size, 0);
  });
});

// literalSpans / firstSpanText replace `/<code>([\s\S]*?)<\/code>/g` and `html.match(/<code>([\s\S]*?)<\/code>/)?.[1].trim()`
// in heatmap.transform.js and carousel.js (regex PR 3). Same seeded differential fuzz.
describe('literalSpans and firstSpanText match the lazy span regex', () => {
  const { literalSpans, firstSpanText } = require('../../../lib/core/tag-scan');
  const SEED = Number(process.env.FUZZ_SEED || 3045);
  const PIECES = ['<code>', '</code>', '<code', '</code', 'x', ' ', '\n', '<', '>', '/', 'c', '<cod', 'e>'];
  const draw = (rand) => {
    let s = '';
    const n = Math.floor(rand() * 10);
    for (let i = 0; i < n; i++) s += PIECES[Math.floor(rand() * PIECES.length)];
    return s;
  };
  const hand = ['', '<code></code>', '<code><code>a</code>', '<code>a</code><code>b</code>', '<code>a', 'a</code><code>b</code>', '<code>\n</code>'];

  test('every span, index and inner text (seeded differential fuzz)', () => {
    const rand = mulberry32(SEED);
    const cases = [...hand];
    for (let i = 0; i < 30000; i++) cases.push(draw(rand));
    for (const s of cases) {
      const want = [...s.matchAll(/<code>([\s\S]*?)<\/code>/g)].map((m) => ({ index: m.index, m: [...m] }));
      const got = literalSpans(s, '<code>', '</code>').map((m) => ({ index: m.index, m: [...m] }));
      assert.deepEqual(got, want, `seed ${SEED}, input ${JSON.stringify(s)}`);
      const first = s.match(/<code>([\s\S]*?)<\/code>/);
      assert.equal(firstSpanText(s, '<code>', '</code>'), first ? first[1].trim() : null, `seed ${SEED}, input ${JSON.stringify(s)}`);
    }
  });

  test('many opens with no close run no regex', () => {
    const s = '<code>'.repeat(100000);
    const { keys } = assertLinearRegexes(() => {
      assert.deepEqual(literalSpans(s, '<code>', '</code>'), []);
      assert.equal(firstSpanText(s, '<code>', '</code>'), null);
    });
    assert.equal(keys.size, 0);
  });
});
