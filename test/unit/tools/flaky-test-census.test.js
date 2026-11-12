/**
 * HARD RULE #32's census (engineering/decisions/2026-11-06-flaky-tests.md): every committed test file's fixed sleeps,
 * clock-reading assertions and unseeded randoms are held exactly to tools/flaky-test-baseline.json. Its failing arms plant
 * each shape in a scratch repository and expect the build to fail; a stale baseline fails too.
 *
 * This file is itself in the census's scope, so every planted shape is built from split strings.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const own = require('../../../tools/check-ownership.js');

const { flakyTestHits, flakyTestTree, flakyTestFindings, checkFlakyTests, playwrightRetriesFindings, checkPlaywrightRetries } = own;

const SLEEP = `await page.${'waitFor'}${'Timeout'}(500);`;
const HAND_SLEEP = `await new Promise((r) => ${'set'}${'Timeout'}(r, 250));`;
const NAMED_SLEEP = `await new Promise((r) => ${'set'}${'Timeout'}(r, SETTLE_MS));`;
const HELPER_SLEEP = `await ${'sle'}${'ep'}(700);`;
const CLOCK = `const t = ${'performance'}.now(); run(); ${'expect'}(${'performance'}.now() - t).toBeLessThan(250);`;
// The shape that ejected #3041 from the merge queue: a ratio of two timings, asserted a line later.
const RATIO = `const clean = () => { const t = ${'performance'}.now(); f(); return ${'performance'}.now() - t; };\nconst ratio = clean() / clean();\nassert.ok(ratio < 25);`;
const RANDOM = `const n = ${'Math'}.random() * 10;`;

/** A scratch git repository holding `files` ({ path: text }), committed, with a baseline beside it. */
function scratch(files, baseline) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-census-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), text);
  }
  const base = path.join(root, 'baseline.json');
  fs.writeFileSync(base, JSON.stringify({ files: baseline }));
  execFileSync('git', ['init', '-q'], { cwd: root });
  execFileSync('git', ['add', '-A'], { cwd: root });
  return { root, base };
}

describe('flaky-test census (HARD RULE #32)', () => {
  test('the tree matches its baseline', () => {
    const errors = [];
    checkFlakyTests(errors);
    assert.deepEqual(errors, []);
  });

  test('each shape is counted, a named duration and a helper sleep included', () => {
    assert.deepEqual(flakyTestHits(SLEEP), { 'fixed-sleep': 1 });
    assert.deepEqual(flakyTestHits(HAND_SLEEP), { 'fixed-sleep': 1 });
    assert.deepEqual(flakyTestHits(NAMED_SLEEP), { 'fixed-sleep': 1 });
    assert.deepEqual(flakyTestHits(`await new Promise<void>((r) => ${'set'}${'Timeout'}(r, 200));`, 'x.test.ts'), { 'fixed-sleep': 1 });
    assert.deepEqual(flakyTestHits(HELPER_SLEEP), { 'fixed-sleep': 1 });
    assert.deepEqual(flakyTestHits(CLOCK), { 'clock-assert': 1 });
    assert.deepEqual(flakyTestHits(RANDOM), { 'unseeded-random': 1 });
  });

  test('a ratio of two timings, asserted on a later line, is a stopwatch assertion', () => {
    assert.deepEqual(flakyTestHits(RATIO), { 'clock-assert': 1 });
  });

  test('a docs/e2e waitForTimeout is left to checkE2ESleeps, which holds it with a reason', () => {
    assert.deepEqual(flakyTestHits(SLEEP, 'docs/e2e/a.spec.ts'), {});
    assert.deepEqual(flakyTestHits(HAND_SLEEP, 'docs/e2e/a.spec.ts'), { 'fixed-sleep': 1 });
  });

  test('not flaky: a comment, a string, a flaky-ok line, a timer callback, a clock used as a date, a stamp never asserted', () => {
    assert.deepEqual(flakyTestHits(`// ${SLEEP}\n/* ${HELPER_SLEEP} */`), {});
    assert.deepEqual(flakyTestHits(`const deck = "${HELPER_SLEEP} ${RANDOM}";`), {});
    assert.deepEqual(flakyTestHits(`${HELPER_SLEEP} // flaky-ok: the tick of a polling loop`), {});
    assert.deepEqual(flakyTestHits(`${'set'}${'Timeout'}(() => done(), 10);`), {});
    assert.deepEqual(flakyTestHits(`const T0 = ${'Date'}.now() - 3_600_000; ${'expect'}(prune(T0)).toBe(1);`), {});
    assert.deepEqual(flakyTestHits(`const t = ${'performance'}.now();`), {});
  });

  test('a name resolves to its own scope: a clock in one test does not taint a same-named value in the next', () => {
    const two = `it('a', () => { const t = ${'performance'}.now(); console.log(${'performance'}.now() - t); });\nit('b', () => { const t = 5; ${'expect'}(t).toBe(5); });`;
    assert.deepEqual(flakyTestHits(two), {});
  });

  test('a function that measures inside but returns no timing does not taint its result', () => {
    const fn = `const read = () => { const s = ${'performance'}.now(); work(); log(${'performance'}.now() - s); return { ok: true }; };\n${'expect'}(read().ok).toBe(true);`;
    assert.deepEqual(flakyTestHits(fn), {});
  });

  test('a flaky-ok mark is read on its own line after a string holding U+2028 or U+2029', () => {
    // TypeScript breaks lines at both; reading the mark from split('\n') once looked two lines off and ignored it.
    const src = `const s = '\u2028\u2029';\n${HELPER_SLEEP} // flaky-ok: the tick of a polling loop`;
    assert.deepEqual(flakyTestHits(src), {});
    assert.deepEqual(flakyTestHits(src.replace(' // flaky-ok: the tick of a polling loop', '')), { 'fixed-sleep': 1 });
  });

  test('a bare flaky-ok, with no reason, still counts', () => {
    assert.deepEqual(flakyTestHits(`${HELPER_SLEEP} // flaky-ok:`), { 'fixed-sleep': 1 });
  });

  test('failing arm: a new sleep in a file the baseline does not know fails the build', () => {
    const { root, base } = scratch({ 'test/a.test.js': `${HELPER_SLEEP}\n` }, {});
    const errors = [];
    checkFlakyTests(errors, root, base);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /flaky test shape in test\/a\.test\.js: 1 fixed-sleep where the baseline allows 0 \(HARD RULE #32\)/);
  });

  test('failing arm: one more hit in a file already in the baseline fails the build', () => {
    const { root, base } = scratch({ 'docs/e2e/b.spec.ts': `${HAND_SLEEP}\n${NAMED_SLEEP}\n` }, { 'docs/e2e/b.spec.ts': { 'fixed-sleep': 1 } });
    const errors = [];
    checkFlakyTests(errors, root, base);
    assert.match(errors.join('\n'), /2 fixed-sleep where the baseline allows 1/);
  });

  test('failing arm: a count the baseline overstates fails, so the backlog only shrinks', () => {
    const { root, base } = scratch({ 'x/c.test.ts': `${CLOCK}\n` }, { 'x/c.test.ts': { 'clock-assert': 3 } });
    const errors = [];
    checkFlakyTests(errors, root, base);
    assert.match(errors.join('\n'), /stale flaky-test baseline: x\/c\.test\.ts holds 1 clock-assert, the baseline says 3/);
  });

  test('a file outside the test scope and a fixture are not read', () => {
    const { root } = scratch({ 'lib/run.js': `${HELPER_SLEEP}\n`, 'test/fixtures/f.test.js': `${RANDOM}\n`, 'test/benchmark/engine-bench.mjs': `${CLOCK}\n` }, {});
    assert.deepEqual(flakyTestTree(root), {});
  });

  test('without git the census refuses once, and does not call every baseline entry stale', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flaky-nogit-'));
    const base = path.join(root, 'baseline.json');
    fs.writeFileSync(base, JSON.stringify({ files: { 'test/a.test.js': { 'fixed-sleep': 2 } } }));
    const errors = [];
    checkFlakyTests(errors, root, base);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /could not list the committed test files .* do not edit the baseline to match/);
  });

  test('a file deleted from the tree leaves a stale baseline entry, which fails', () => {
    assert.match(flakyTestFindings({}, { 'test/gone.test.js': { 'fixed-sleep': 2 } }).join('\n'), /stale flaky-test baseline: test\/gone\.test\.js holds 0 fixed-sleep/);
  });

  // HARD RULE #33. Built from parts so this file does not switch itself off.
  const SKIP_LIT = `test('x', { ${'skip'}: true }, () => {});`;
  const SKIP_WHY = `test('x', { ${'skip'}: 'flaky on CI' }, () => {});`;
  const SKIP_FN = `test.${'skip'}('x', () => {});`;
  const FIXME = `test('x', async () => { test.${'fixme'}(); });`;
  const DESC_SKIP = `describe.${'skip'}('x', () => {});`;
  const ONLY = `test.${'only'}('x', () => {});`;
  const ONLY_OPT = `test('x', { ${'only'}: true }, () => {});`;
  const REASON = '// disabled: tried 40 runs alone and under load, a trace of each red; evidence trace-17.zip, the browser drops the event 1 in 30 (#3150); re-enable when the upstream fix lands\n';

  test('a literal skip, fixme or todo is a disabled test; .only is a focused one', () => {
    for (const src of [SKIP_LIT, SKIP_WHY, SKIP_FN, FIXME, DESC_SKIP, `test.${'skip'}(true, 'pdftoppm is not installed');`, `it.${'todo'}('x', () => {});`, `test.describe.${'fixme'}('x', () => {});`]) {
      assert.deepEqual(flakyTestHits(src), { 'disabled-test': 1 }, src);
    }
    assert.deepEqual(flakyTestHits(ONLY), { 'focused-test': 1 });
    assert.deepEqual(flakyTestHits(ONLY_OPT), { 'focused-test': 1 });
    assert.deepEqual(flakyTestHits(`test.describe.${'only'}('x', () => {});`, 'docs/e2e/a.spec.ts'), { 'focused-test': 1 });
  });

  test('a skip that depends on a value is a scoped test, not a disabled one', () => {
    assert.deepEqual(flakyTestHits(`test('x', { ${'skip'}: skipWithoutChrome(chrome) }, () => {});`), {});
    assert.deepEqual(flakyTestHits(`test.${'skip'}(browserName !== 'webkit', 'WebKit only');`, 'docs/e2e/a.spec.ts'), {});
    assert.deepEqual(flakyTestHits(`test.${'skip'}(({ browserName }) => browserName === 'firefox', 'no WebRTC');`, 'docs/e2e/a.spec.ts'), {});
    assert.deepEqual(flakyTestHits(`test('x', { ${'skip'}: !python && 'python3 is not installed' }, () => {});`), {});
    assert.deepEqual(flakyTestHits(`const r = { ${'skip'}: true }; page.${'skip'}('x', 1);`), {});
  });

  test('a disabled test passes only with all three parts of the reason, in the comment right above it', () => {
    assert.deepEqual(flakyTestHits(REASON + SKIP_LIT), {});
    assert.deepEqual(flakyTestHits(`test('y', async () => {\n  ${REASON}  test.${'fixme'}();\n});`), {});
    assert.deepEqual(flakyTestHits(`// disabled: flaky\n${SKIP_LIT}`), { 'disabled-test': 1 }, 'a reason with no tried / evidence / re-enable is not one');
    assert.deepEqual(flakyTestHits(`// disabled: tried stuff; evidence flaky; re-enable later\n${SKIP_LIT}`), { 'disabled-test': 1 }, 'evidence must point at a URL, a file or #N');
    assert.deepEqual(flakyTestHits(`${REASON}const a = 1;\n${SKIP_LIT}`), { 'disabled-test': 1 }, 'the reason belongs to the statement it sits on');
    assert.deepEqual(flakyTestHits(REASON + ONLY), { 'focused-test': 1 }, 'no reason excuses a focused test');
  });

  test('failing arm: a disabled or focused test fails the build, and the baseline cannot hold one', () => {
    const { root, base } = scratch({ 'test/a.test.js': SKIP_LIT, 'test/b.test.js': ONLY }, { 'test/a.test.js': { 'disabled-test': 1 } });
    const errors = [];
    checkFlakyTests(errors, root, base);
    assert.equal(errors.length, 3, errors.join('\n'));
    assert.match(errors.join('\n'), /never baselined/);
    assert.match(errors.join('\n'), /disabled test in test\/a\.test\.js/);
    assert.match(errors.join('\n'), /focused test in test\/b\.test\.js/);
  });

  test('Playwright never retries (HARD RULE #34)', () => {
    const errors = [];
    checkPlaywrightRetries(errors);
    assert.deepEqual(errors, [], 'docs/playwright.config.ts holds retries: 0');
    assert.deepEqual(playwrightRetriesFindings('export default { retries: 0 };'), []);
  });

  test('failing arm: a CI retry, any retry, or a missing retries line fails', () => {
    assert.equal(playwrightRetriesFindings('export default { retries: isCI ? 1 : 0 };').length, 1);
    assert.equal(playwrightRetriesFindings('export default { retries: 2 };').length, 1);
    assert.equal(playwrightRetriesFindings('export default { projects: [{ name: "a", retries: 1 }], retries: 0 };').length, 1, 'a project may not retry either');
    assert.match(playwrightRetriesFindings('export default { workers: 2 };')[0], /sets no `retries`/);
  });

  test('build:check runs the census', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../tools/check-ownership.js'), 'utf8');
    const run = src.slice(src.indexOf('function run('));
    assert.match(run.slice(0, run.indexOf('\n}\n')), /checkFlakyTests\(errors\)/);
    assert.match(run.slice(0, run.indexOf('\n}\n')), /checkPlaywrightRetries\(errors\)/);
  });
});
