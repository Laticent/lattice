/**
 * lib/core/svg-a11y-names.js reads tags with a precomputed quote-aware scan (`unquotedTagEnds`) in place of
 * `/<svg\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi` and `/<(?!\/)([a-zA-Z][\w-]*)\b(?:"[^"]*"|'[^']*'|[^>"'])*>/g` (regex PR 3,
 * followups.d/3045-p2-regex-recheck-gate.md). A seeded differential fuzz holds each to its regex (HARD RULE #32).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mulberry32 } = require('../../helpers/regex-differential');
const { assertLinearRegexes } = require('../../helpers/regex-trace');
const { unquotedTagEnds, nextSvgOpen, countOpenTags } = require('../../../lib/core/svg-a11y-names');

const SEED = Number(process.env.FUZZ_SEED || 3045);
const PIECES = ['<svg', '<SVG', '<sVg', '<svgx', '<svg-', '<svg ', '<g', '<a-', '<a-b', '<1', '</g>', '/>', '>', '"', "'", ' ', 'x', '=', '<', '/', 'ſ'];
function cases(seed, n) {
  const rand = mulberry32(seed);
  const out = ['', '<svg>', '<svg a="x>y">', "<svg a='>'>", '<svg a="unclosed>', '<svg role="img"/>', '<svgfoo>', '<svg-x>', '<a-><b/>', '<a- x="1">'];
  for (let i = 0; i < n; i++) {
    let s = '';
    const len = Math.floor(rand() * 10);
    for (let j = 0; j < len; j++) s += PIECES[Math.floor(rand() * PIECES.length)];
    out.push(s);
  }
  return out;
}

test('the svg open-tag scan finds what the global regex found, from every match end (seeded differential fuzz)', () => {
  for (const s of cases(SEED, 30000)) {
    const re = /<svg\b(?:"[^"]*"|'[^']*'|[^>"'])*>/gi;
    const want = [];
    for (let m = re.exec(s); m; m = re.exec(s)) want.push([m.index, m[0]]);
    const got = [];
    const ends = unquotedTagEnds(s);
    for (let m = nextSvgOpen(s, ends, 0); m; m = nextSvgOpen(s, ends, m.index + m[0].length)) got.push([m.index, m[0]]);
    assert.deepEqual(got, want, `seed ${SEED}, input ${JSON.stringify(s)}`);
  }
});

test('countOpenTags counts what the open-tag regex counted (seeded differential fuzz)', () => {
  for (const s of cases(SEED + 1, 30000)) {
    const want = (s.match(/<(?!\/)([a-zA-Z][\w-]*)\b(?:"[^"]*"|'[^']*'|[^>"'])*>/g) || []).filter((t) => !t.endsWith('/>')).length;
    assert.equal(countOpenTags(s), want, `seed ${SEED + 1}, input ${JSON.stringify(s)}`);
  }
});

test('many openers with no `>` run no regex', () => {
  const s = '<svg a="'.repeat(30000);
  const { keys } = assertLinearRegexes(() => {
    assert.equal(nextSvgOpen(s, unquotedTagEnds(s), 0), null);
    assert.equal(countOpenTags('<a '.repeat(100000)), 0);
  });
  assert.equal(keys.size, 0);
});
