/**
 * lib/core/chart-rows.js `anyTagScanner` replaces `/<!--|<(\/?)([a-z][a-z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*'){0,4000}>/gi`
 * in `rawBlockCounts` (regex PR 3): the regex re-read up to 4000 pieces from every `<` with no `>`. A seeded differential
 * fuzz holds the scanner to the regex, match by match, including the name's `\b` back-off and the 4000-piece bound, and
 * `rawBlockCounts` to its old regex loop (HARD RULE #32: the seed is in every failure).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mulberry32 } = require('../../helpers/regex-differential');
const { assertLinearRegexes } = require('../../helpers/regex-trace');
const { anyTagScanner, rawBlockCounts } = require('../../../lib/core/chart-rows');

const SEED = Number(process.env.FUZZ_SEED || 3045);
const OLD = /<!--|<(\/?)([a-z][a-z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*'){0,4000}>/gi;

function oldCounts(src) {
  let lists = 0, depth = 0, tables = 0, closedTables = 0;
  const re = new RegExp(OLD.source, OLD.flags);
  for (let m = re.exec(src); m; m = re.exec(src)) {
    if (m[0] === '<!--') {
      const close = src.indexOf('-->', m.index + 4);
      if (close < 0) break;
      re.lastIndex = close + 3;
      continue;
    }
    const name = m[2].toLowerCase();
    if (name === 'table') { if (m[1]) closedTables++; else tables++; }
    else if (name === 'ul' || name === 'ol') {
      if (m[1]) depth = Math.max(0, depth - 1);
      else { if (depth === 0) lists++; depth++; }
    }
  }
  return { lists, tables, closedTables };
}

const PIECES = ['<', '</', '<!--', '-->', '>', '"', "'", 'ul', 'UL', 'ol', 'table', 'Table', 'a-', 'a_', '-', '_', ' ', '\n', 'x', '/', 'ſ', 'K'];
function cases(seed, n) {
  const rand = mulberry32(seed);
  const out = ['', '<ul>', '</ul>', '<ul-x>', '<ul->', '<ul_>', '<a title="<ul>">', "<a b='>'>", '<!-- <ul> -->', '<ul "unclosed>', '</>', '<UL>', '<ſpan>'];
  for (let i = 0; i < n; i++) {
    let s = '';
    const len = Math.floor(rand() * 12);
    for (let j = 0; j < len; j++) s += PIECES[Math.floor(rand() * PIECES.length)];
    out.push(s);
  }
  return out;
}

test('the scanner finds what the regex found, match by match (seeded differential fuzz)', () => {
  for (const s of cases(SEED, 40000)) {
    const re = new RegExp(OLD.source, OLD.flags);
    const want = [];
    for (let m = re.exec(s); m; m = re.exec(s)) want.push({ index: m.index, m: [...m].map((x) => x ?? '') });
    const next = anyTagScanner(s);
    const got = [];
    for (let m = next(0); m; m = next(m.index + m[0].length)) got.push({ index: m.index, m: m[0] === '<!--' ? ['<!--', '', ''] : [...m] });
    assert.deepEqual(got, want.map((w) => (w.m[0] === '<!--' ? { index: w.index, m: ['<!--', '', ''] } : w)), `seed ${SEED}, input ${JSON.stringify(s)}`);
  }
});

test('the 4000-piece bound: 4000 pieces match, 4001 do not', () => {
  for (const [body, ok] of [[' '.repeat(4000), true], [' '.repeat(4001), false], [`${' '.repeat(3999)}"a>b"`, true], [`${' '.repeat(4000)}"a>b"`, false]]) {
    const s = `<ul${body}>`;
    const re = new RegExp(OLD.source, OLD.flags);
    assert.equal(!!re.exec(s), ok, `regex, ${body.length}`);
    assert.equal(!!anyTagScanner(s)(0), ok, `scanner, ${body.length}`);
  }
});

test('rawBlockCounts counts what its old regex loop counted (seeded differential fuzz)', () => {
  for (const s of cases(SEED + 1, 20000)) assert.deepEqual(rawBlockCounts(s), oldCounts(s), `seed ${SEED + 1}, input ${JSON.stringify(s)}`);
});

test('many `<` with no `>` run no regex', () => {
  const { keys } = assertLinearRegexes(() => assert.deepEqual(rawBlockCounts('<ul '.repeat(1900)), { lists: 0, tables: 0, closedTables: 0 }));
  assert.equal(keys.size, 0);
});
