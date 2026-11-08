/**
 * HARD RULE #32's regex census (followups.d/3045-p2-regex-recheck-gate.md, owner D1 on #3092): every regex literal in
 * lib/** has a recheck verdict in tools/regex-census.json, and each file's count of literals recheck does not call
 * linear is held exactly to the table's backlog. Its failing arms plant each case in a scratch repository and expect the
 * build to fail. The gate needs no recheck, so neither does this file.
 *
 * Also the two test helpers the drain uses: test/helpers/regex-trace.js (which regexes a call ran, and whether the
 * census calls each linear) and test/helpers/regex-differential.js (does a rewrite match what the old pattern matched).
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const own = require('../../../tools/check-ownership.js');
const { traceRegexes, assertLinearRegexes, normalKey } = require('../../helpers/regex-trace');
const { differ } = require('../../helpers/regex-differential');

const { regexLiterals, regexLiteralTree, regexCensusFindings, checkRegexCensus } = own;

/** A scratch git repository holding `files` ({ path: text }), with a census table beside it. */
function scratch(files, table) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'regex-census-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  const file = path.join(root, 'regex-census.json');
  fs.writeFileSync(file, JSON.stringify(table));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return { root, file };
}
const run = (files, table) => {
  const { root, file } = scratch(files, table);
  const errors = [];
  checkRegexCensus(errors, root, file);
  return errors.join('\n');
};

const SLOW = 'const t = s.replace(/\\s+x/g, "");\n';
const FAST = 'const t = s.replace(/^\\d+$/, "");\n';

describe('regex census — the gate', () => {
  test('reads literals, not strings or comments, and keeps each one\'s text as written', () => {
    const lits = regexLiterals('// /a+/ in a comment\nconst s = "/b+/";\nconst r = /c+/gi; const q = a / b / c;\n');
    assert.deepEqual(lits.map((l) => [l.key, l.line]), [['/c+/gi', 3]]);
  });

  test('a regex-ok with a reason marks its line; a bare one does not', () => {
    const lits = regexLiterals('const a = /\\s+x/; // regex-ok: the input is one word\nconst b = /\\s+y/; // regex-ok:\n');
    assert.deepEqual(lits.map((l) => l.ok), [true, false]);
  });

  test('a regex-ok inside a string is data, not a comment, and exempts nothing', () => {
    const lits = regexLiterals('const a = [/\\s+x/, "// regex-ok: not a comment"];\n');
    assert.deepEqual(lits.map((l) => l.ok), [false]);
  });

  test('only lib/** source is in scope, and vendored code is not', () => {
    const { root } = scratch({ 'lib/a.js': FAST, 'lib/x/vendor/v.js': SLOW, 'tools/t.js': SLOW, 'lib/types.d.ts': 'type T = 1;' }, {});
    assert.deepEqual(Object.keys(regexLiteralTree(root)), ['lib/a.js']);
  });

  test('a table that matches the tree passes', () => {
    assert.equal(run({ 'lib/a.js': SLOW + FAST }, { backlog: { 'lib/a.js': 1 }, verdicts: { '/\\s+x/g': 'polynomial', '/^\\d+$/': 'safe' } }), '');
  });

  test('failing arm: a new literal with no verdict fails, and names the command that decides it', () => {
    const out = run({ 'lib/a.js': FAST + 'const n = /new+/;\n' }, { backlog: {}, verdicts: { '/^\\d+$/': 'safe' } });
    assert.match(out, /1 regex literal\(s\) in lib\/\*\* have no complexity verdict.*lib\/a\.js:2 \/new\+\//);
    assert.match(out, /npm run regex:census -- --write/);
  });

  test('failing arm: a copied slow pattern fails though its verdict is cached', () => {
    const out = run({ 'lib/a.js': SLOW, 'lib/b.js': SLOW }, { backlog: { 'lib/a.js': 1 }, verdicts: { '/\\s+x/g': 'polynomial' } });
    assert.match(out, /slow regex in lib\/b\.js: 1 literal\(s\) recheck does not call safe where the backlog allows 0/);
  });

  test('a slow literal marked regex-ok does not count', () => {
    const marked = 'const t = s.replace(/\\s+x/g, ""); // regex-ok: s is one trimmed word\n';
    assert.equal(run({ 'lib/a.js': SLOW, 'lib/b.js': marked }, { backlog: { 'lib/a.js': 1 }, verdicts: { '/\\s+x/g': 'polynomial' } }), '');
  });

  test('failing arm: a drained file the backlog overstates fails, so the backlog only shrinks', () => {
    const out = run({ 'lib/a.js': FAST }, { backlog: { 'lib/a.js': 1 }, verdicts: { '/^\\d+$/': 'safe' } });
    assert.match(out, /stale regex backlog: lib\/a\.js holds 0 slow literal\(s\), tools\/regex-census\.json says 1/);
  });

  test('failing arm: a verdict whose literal is gone is stale', () => {
    assert.match(run({ 'lib/a.js': FAST }, { backlog: {}, verdicts: { '/^\\d+$/': 'safe', '/gone/': 'safe' } }), /stale regex verdicts: 1 entry names a literal no longer in lib/);
  });

  test('failing arm: an undecided verdict must say why, and an unknown word is refused', () => {
    assert.match(run({ 'lib/a.js': FAST }, { backlog: { 'lib/a.js': 1 }, verdicts: { '/^\\d+$/': { verdict: 'unknown' } } }), /is undecided and carries no `why`/);
    assert.match(run({ 'lib/a.js': FAST }, { backlog: {}, verdicts: { '/^\\d+$/': 'linear' } }), /must be safe, polynomial, exponential/);
  });

  test('without git the census refuses once, and does not call every verdict stale', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'regex-nogit-'));
    const file = path.join(root, 'regex-census.json');
    fs.writeFileSync(file, JSON.stringify({ backlog: {}, verdicts: { '/a/': 'safe' } }));
    const errors = [];
    checkRegexCensus(errors, root, file);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /could not list the committed lib\/\*\* files .* do not edit the table to match/);
  });

  test('the committed table holds the committed tree', () => {
    const errors = [];
    checkRegexCensus(errors);
    assert.deepEqual(errors, []);
    assert.deepEqual(regexCensusFindings({}, { verdicts: {}, backlog: {} }), []);
  });

  test('build:check runs the census', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../tools/check-ownership.js'), 'utf8');
    const body = src.slice(src.indexOf('function run('));
    assert.match(body.slice(0, body.indexOf('\n}\n')), /checkRegexCensus\(errors\)/);
  });
});

describe('regex census — the test helpers', () => {
  test('the trace sees every string and RegExp method, and restores exec', () => {
    const exec = RegExp.prototype.exec;
    const { keys } = traceRegexes(() => {
      'abc'.replace(/b/g, 'x');
      /c/.test('c');
      'a,b'.split(/,/);
      'aa'.match(/a/g);
      [...'aa'.matchAll(/a/g)];
      'x'.search(/x/i);
      'q'.replaceAll(/q/g, 'r');
    });
    assert.deepEqual([...keys].sort(), ['/,/y', '/a/g', '/b/g', '/c/', '/q/g', '/x/i']);
    assert.equal(RegExp.prototype.exec, exec);
  });

  test('flags are compared sorted, as RegExp#flags gives them', () => {
    assert.equal(normalKey('a', 'ig'), '/a/gi');
  });

  test('failing arm: a call that runs a slow census pattern, or one the census does not hold, fails', () => {
    // `/\s+$/` is the unanchored trailing-blank shape: quadratic on a long run of blanks followed by a non-blank.
    const table = JSON.parse(fs.readFileSync(path.join(__dirname, '../../../tools/regex-census.json'), 'utf8'));
    const slowKey = Object.entries(table.verdicts).find(([, v]) => v === 'polynomial')[0];
    const end = slowKey.lastIndexOf('/');
    const slow = new RegExp(slowKey.slice(1, end), slowKey.slice(end + 1));
    assert.throws(() => assertLinearRegexes(() => slow.exec('x')), /recheck does not call linear/);
    assert.throws(() => assertLinearRegexes(() => /not-in-the-census-\d{3}/.exec('x')), /does not hold/);
    assert.doesNotThrow(() => assertLinearRegexes(() => /not-in-the-census-\d{3}/.exec('x'), { allow: { '/not-in-the-census-\\d{3}/': 'a test pattern' } }));
  });

  test('the differential fuzz finds a rewrite that changed behavior, and passes one that did not', () => {
    assert.equal(differ(/\s+$/, /\s+$/), null);
    const found = differ(/a+b/, /a*b/, { seed: 7 });
    assert.ok(found, 'a* also matches a bare b');
    assert.equal(found.seed, 7);
  });
});
