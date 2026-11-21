/**
 * lib/transformers/chart-frame.js `topLevelBlocks` tokenizes tags with the linear readers (`commentCloser`, `attrRunReader`)
 * in place of `<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>`, which rescanned to the end from every
 * unclosed `<!--` or `<a` (HARD RULE #32, followups.d/3045-p2-regex-recheck-gate.md). Held to the old tokenizer by a seeded
 * differential fuzz (seed 3045, printed in every failure), and to linear work by counting the characters it reads and
 * scans.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { __topLevelBlocksForTest: topLevelBlocks } = require('../../../lib/transformers/chart-frame');
const { mulberry32 } = require('../../helpers/regex-differential');
const { charReads } = require('../../helpers/work-count');
const { assertLinearRegexes } = require('../../helpers/regex-trace');

// The walk as it was, tokenizer included. Tests sit outside the census, which reads lib/** only.
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
function oldTopLevelBlocks(html) {
  const out = [];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w-]*)\b((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
  let depth = 0;
  let open = null;
  let m;
  while ((m = re.exec(html)) !== null) {
    if (!m[2]) continue;
    const tag = m[2].toLowerCase();
    if (!VOID_TAGS.has(tag) && !m[1] && /\/\s*$/.test(m[3])) continue;
    const selfClosed = VOID_TAGS.has(tag);
    if (m[1]) {
      depth = Math.max(0, depth - 1);
      if (open && depth === 0 && tag === open.tag) {
        out.push({ tag, attrs: open.attrs, inner: html.slice(open.innerAt, m.index), outer: html.slice(open.at, m.index + m[0].length) });
        open = null;
      }
      continue;
    }
    if (selfClosed) {
      if (depth === 0) out.push({ tag, attrs: m[3] || '', inner: '', outer: m[0] });
      continue;
    }
    if (depth === 0) open = { tag, attrs: m[3] || '', at: m.index, innerAt: m.index + m[0].length };
    depth++;
  }
  return out;
}

const PIECES = ['<p>', '</p>', '<div class="a">', '</div>', '<br>', '<br/>', '<img src="x">', '<p/>', '<a', '<a-', '<a->',
  '<a_b>', '</a_b>', '<!--', '-->', '<!-- c -->', '<!--->', '<!-->', '<!---->', '"', "'", '>', '<', '/', ' ', '\n', 'x', '<pre>', '</pre>',
  '<blockquote>', '</blockquote>', '<p title=">">', "<p title='a\"b'>", '<1>', '<P>', '</P>'];
const draw = (rand, n) => {
  let s = '';
  const len = Math.floor(rand() * n);
  for (let j = 0; j < len; j++) s += PIECES[Math.floor(rand() * PIECES.length)];
  return s;
};

describe('topLevelBlocks answers as the tokenizer it replaced (seeded fuzz, seed 3045)', () => {
  test('100,000 draws, no input where old and new disagree', () => {
    const rand = mulberry32(3045);
    for (let i = 0; i < 100000; i++) {
      const s = draw(rand, 14);
      assert.deepEqual(topLevelBlocks(s), oldTopLevelBlocks(s), `seed 3045, draw ${i}: ${JSON.stringify(s)}`);
    }
  });
});

// `charReads` does not see `String.prototype.indexOf`: count the characters each call scans. The tokenizer's head regex
// is linear (one anchored head per `<`), so the regex engine's own work stays bounded too.
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

describe('topLevelBlocks is linear on the markup its regex choked on', () => {
  const hostile = {
    'many unclosed `<!--`': (n) => '<!--'.repeat(n),
    'many `<a` with no `>`': (n) => '<a '.repeat(n),
    'many `<a "` with an unpaired quote': (n) => '<a "'.repeat(n),
    'many `<a` and one `>` at the end': (n) => `${'<a '.repeat(n)}>`,
  };
  for (const [label, make] of Object.entries(hostile)) {
    test(`${label}: four times the markup costs about four times the work`, () => {
      const work = (n) => {
        const src = make(n);
        let scanned = 0;
        const { reads, scanned: regexScanned } = charReads(() => withIndexOfCount((k) => { scanned += k; }, () => topLevelBlocks(src)));
        return reads + scanned + regexScanned;
      };
      const small = work(2000);
      const large = work(8000);
      assert.ok(large <= 4 * small + 64, `work grew from ${small} to ${large} for 4x the markup`);
    });
  }

  // The work count cannot see backtracking inside one regex call, which is where the old tokenizer spent its time; the
  // census trace can.
  test('the walk runs only regexes the census calls linear', () => {
    assertLinearRegexes(() => {
      topLevelBlocks('<!--'.repeat(200));
      topLevelBlocks('<a "'.repeat(200));
    });
  });
});
