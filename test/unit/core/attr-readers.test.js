/**
 * Three one-pass readers that replace patterns recheck calls polynomial on the heatmap render path (regex PR 3,
 * followups.d/3045-p2-regex-recheck-gate.md), each held to its old regex by a seeded differential fuzz (HARD RULE #32):
 * - pagination.transform.js `hasMarker` for `/\sclass="[^"]*\blat-pagination\b[^"]*"/`;
 * - markdown-it/plugins.js `stripAttr` for `/\s+data-form=(?:"[^"]*"|'[^']*'|[^\s>]*)/gi` (and data-frame);
 * - svg-a11y-names.js `nextNamedOpen` for `/<title(\s[^>]*)?>/gi` (and desc).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mulberry32 } = require('../../helpers/regex-differential');
const { assertLinearRegexes } = require('../../helpers/regex-trace');
const { hasMarker } = require('../../../lib/forms/tile/pagination/pagination.transform');
const { stripAttr } = require('../../../lib/integrations/markdown-it/plugins');
const { nextNamedOpen } = require('../../../lib/core/svg-a11y-names');

const SEED = Number(process.env.FUZZ_SEED || 3045);
function draw(seed, pieces, hand, n = 30000, max = 10) {
  const rand = mulberry32(seed);
  const out = [...hand];
  for (let i = 0; i < n; i++) {
    let s = '';
    const len = Math.floor(rand() * max);
    for (let j = 0; j < len; j++) s += pieces[Math.floor(rand() * pieces.length)];
    out.push(s);
  }
  return out;
}

test('hasMarker matches the marker regex (seeded differential fuzz)', () => {
  const pieces = [' ', '\n', 'class="', 'data-class="', '"', 'lat-pagination', 'xlat-pagination', 'lat-paginationx', '-', '_', 'a', ' class="a ', '>'];
  const hand = ['', ' class="lat-pagination"', 'class="lat-pagination"', ' data-class="lat-pagination"', ' class="a lat-pagination b"', ' class="x-lat-pagination"', ' class="lat-pagination', ' class="a" class="lat-pagination"'];
  for (const s of draw(SEED, pieces, hand)) assert.equal(hasMarker(s), /\sclass="[^"]*\blat-pagination\b[^"]*"/.test(s), `seed ${SEED}, input ${JSON.stringify(s)}`);
});

test('stripAttr matches the strip regexes (seeded differential fuzz)', () => {
  const pieces = [' ', '  ', '\t', '\n', 'data-form=', 'DATA-FORM=', 'data-frame=', 'data-formx=', '"', "'", 'a', '>', '<section', 'x="y"'];
  const hand = ['', '<section data-form="2d">', '<section  data-form=2d data-frame="x">', "<section data-form='a b'>", '<section data-form="unclosed>', '<section data-form=>', '<section\ndata-form="a"data-form="b">'];
  for (const name of ['data-form', 'data-frame']) {
    const re = new RegExp(`\\s+${name}=(?:"[^"]*"|'[^']*'|[^\\s>]*)`, 'gi');
    for (const s of draw(SEED + 1, pieces, hand)) assert.equal(stripAttr(s, name), s.replace(re, ''), `${name}, seed ${SEED + 1}, input ${JSON.stringify(s)}`);
  }
});

test('nextNamedOpen matches the title/desc regexes, match by match (seeded differential fuzz)', () => {
  const pieces = ['<title', '<TITLE', '<titles', '<desc', '<Desc', '>', ' ', '\n', 'a', '<', '/', 'id="x"', ' '];
  const hand = ['', '<title>', '<title id="a">', '<titlex>', '<title', '<title >', '<title\n>', '<TITLE>a</title><title b>'];
  for (const tag of ['title', 'desc']) {
    for (const s of draw(SEED + 2, pieces, hand)) {
      const re = new RegExp(`<${tag}(\\s[^>]*)?>`, 'gi');
      const want = [];
      for (let m = re.exec(s); m; m = re.exec(s)) want.push([m.index, m[0]]);
      const got = [];
      for (let m = nextNamedOpen(s, tag, 0); m; m = nextNamedOpen(s, tag, m.index + m[0].length)) got.push([m.index, m[0]]);
      assert.deepEqual(got, want, `${tag}, seed ${SEED + 2}, input ${JSON.stringify(s)}`);
    }
  }
});

test('long hostile inputs run no slow regex', () => {
  assertLinearRegexes(() => {
    assert.equal(hasMarker(` class="${'a'.repeat(100000)}"`), false);
    assert.equal(nextNamedOpen('<title '.repeat(50000), 'title', 0), null);
  });
  const blanks = `<section${' '.repeat(100000)}x>`;
  assert.equal(stripAttr(blanks, 'data-form'), blanks);
});

test('hasMarker searches a page of class values without the marker in linear work', () => {
  const { scanWork } = require('../../helpers/work-count');
  const page = (n) => `${' class="a"'.repeat(n)} lat-pagination`;
  const per = (n) => scanWork(() => hasMarker(page(n))).scanned / page(n).length;
  // Counted, not timed: the characters every search covered, per character of input, at two sizes. A search for the
  // marker from every class value covered the rest of the page each time, growing with the page.
  assert.ok(per(20000) <= 4, `${per(20000)} characters searched per character`);
  assert.ok(per(20000) <= per(2000) * 1.5, 'the cost per character does not grow with the page');
});
