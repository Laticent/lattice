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

  test('a timing the page measured itself: the duration of a performance entry, read back and asserted', () => {
    const read = `const measures = await page.evaluate(() => ${'performance'}.getEntriesByType('measure').map((m) => ({ name: m.name, ms: m.${'dura'}${'tion'} })));`;
    // The §4.3 budget's shape (filo-undo.spec.ts): a key copied from `.duration`, through a reduce, asserted a line later.
    assert.deepEqual(flakyTestHits(`${read}\nconst worst = measures.reduce((a, b) => (b.ms > a.ms ? b : a));\n${'expect'}(worst.ms).toBeLessThan(16);`), { 'clock-assert': 1 });
    // The duration itself, straight off the entries.
    assert.deepEqual(flakyTestHits(`const e = ${'performance'}.getEntriesByName('x');\n${'expect'}(e[0].${'dura'}${'tion'}).toBeLessThan(16);`), { 'clock-assert': 1 });
    // Its count, its names and a work counter in its detail are not timings.
    assert.deepEqual(flakyTestHits(`${read}\n${'expect'}(measures.length).toBeGreaterThan(8);\n${'expect'}(new Set(measures.map((m) => m.name))).toEqual(new Set(['a']));`), {});
    // A `.duration` that is not an entry's (a media element's) is not counted.
    assert.deepEqual(flakyTestHits(`const v = document.querySelector('video');\n${'expect'}(v.${'dura'}${'tion'}).toBeCloseTo(1.25);`), {});
    // A value that IS an entry's duration, read inside the page and asserted as a plain number (the checker's finding, #3266).
    assert.deepEqual(flakyTestHits(`const ms = await page.evaluate(() => ${'performance'}.getEntriesByName('x')[0].${'dura'}${'tion'});\n${'expect'}(ms).toBeLessThan(16);`), { 'clock-assert': 1 });
    // The durations mapped out of the entries, then reduced.
    assert.deepEqual(flakyTestHits(`const ds = ${'performance'}.getEntriesByType('measure').map((e) => e.${'dura'}${'tion'});\n${'expect'}(Math.max(...ds)).toBeLessThan(16);`), { 'clock-assert': 1 });
    // A timing printed in a count assertion's MESSAGE is not what the assertion checks.
    assert.deepEqual(flakyTestHits(`${read}\nconst worst = measures.reduce((a, b) => (b.ms > a.ms ? b : a));\n${'expect'}(measures.length, \`worst \${worst.ms} ms\`).toBeGreaterThan(8);`), {});
  });

  test('the fast path reads a file whose only timing is a performance entry', () => {
    const { root } = scratch({ 'docs/e2e/a.spec.ts': `const e = ${'performance'}.getEntriesByName('x');\n${'expect'}(e[0].${'dura'}${'tion'}).toBeLessThan(16);\n` }, {});
    assert.deepEqual(flakyTestTree(root), { 'docs/e2e/a.spec.ts': { 'clock-assert': 1 } });
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
  const CI_SKIP = '// ci-skip: the macOS platform suite runs it; Linux CI has no flock(1)\n';

  test('a literal skip, fixme or todo is a disabled test; .only is a focused one', () => {
    for (const src of [SKIP_LIT, SKIP_WHY, SKIP_FN, FIXME, DESC_SKIP, `test.${'skip'}(true, 'pdftoppm is not installed');`, `it.${'todo'}('x', () => {});`, `test.describe.${'fixme'}('x', () => {});`]) {
      assert.deepEqual(flakyTestHits(src), { 'disabled-test': 1 }, src);
    }
    assert.deepEqual(flakyTestHits(ONLY), { 'focused-test': 1 });
    assert.deepEqual(flakyTestHits(ONLY_OPT), { 'focused-test': 1 });
    assert.deepEqual(flakyTestHits(`test.describe.${'only'}('x', () => {});`, 'docs/e2e/a.spec.ts'), { 'focused-test': 1 });
    for (const src of [`test.${'todo'}('later');`, `it.${'skip'}('x');`, `const T = 'x'; test.${'skip'}(T, () => {});`, `test('x', async () => { test.${'fail'}(); });`, `test('x', { '${'skip'}': true }, () => {});`, `test('x', { ${'skip'}: 1 }, () => {});`, `test('x', { ${'skip'}: !0 }, () => {});`]) {
      assert.deepEqual(flakyTestHits(src), { 'disabled-test': 1 }, src);
    }
    assert.deepEqual(flakyTestHits(`test('x', { '${'only'}': true }, () => {});`), { 'focused-test': 1 });
  });

  test('a flaky-ok mark excuses neither a disabled nor a focused test', () => {
    assert.deepEqual(flakyTestHits(`${ONLY} // flaky-ok: debugging`), { 'focused-test': 1 });
    assert.deepEqual(flakyTestHits(`${SKIP_LIT} // flaky-ok: because`), { 'disabled-test': 1 });
  });

  test('the fast path reads a file whose only hit has a space before the paren or the colon', () => {
    const { root, base } = scratch({ 'test/a.test.js': `test('x', { ${'skip'} : true }, () => {});\ntest.${'only'} ('y', () => {});` }, {});
    assert.deepEqual(flakyTestTree(root), { 'test/a.test.js': { 'disabled-test': 1, 'focused-test': 1 } });
    void base;
  });

  test('env-skip: a machine-dependent skip in a node test must go through a helper that fails under CI', () => {
    assert.deepEqual(flakyTestHits(`test('x', { ${'skip'}: !fs.existsSync(B) && 'not built' }, () => {});`), { 'env-skip': 1 });
    assert.deepEqual(flakyTestHits(`test('x', (t) => { if (!exe) return t.${'skip'}('no Chromium'); });`), { 'env-skip': 1 });
    assert.deepEqual(flakyTestHits(`test('x', { ${'skip'}: skipUnlessCI(!built, 'not built') }, () => {});`), {});
    assert.deepEqual(flakyTestHits(`test('x', (t) => { const why = skipUnlessCI(!exe, 'no exe'); if (why) return t.${'skip'}(why); });`), {});
    assert.deepEqual(flakyTestHits(`test('x', { ${'skip'}: false }, () => {});`), {});
    assert.deepEqual(flakyTestHits(`${CI_SKIP}test('x', { ${'skip'}: !HAS_FLOCK && 'no flock' }, () => {});`), {});
    assert.deepEqual(flakyTestHits(`test.${'skip'}(browserName !== 'webkit', 'WebKit only');`, 'docs/e2e/a.spec.ts'), {}, 'an e2e project scope is not an env-skip');
  });

  test('a skip that depends on a value is a scoped test, not a disabled one', () => {
    assert.deepEqual(flakyTestHits(`test('x', { ${'skip'}: skipWithoutChrome(chrome) }, () => {});`), {});
    assert.deepEqual(flakyTestHits(`test.${'skip'}(browserName !== 'webkit', 'WebKit only');`, 'docs/e2e/a.spec.ts'), {});
    assert.deepEqual(flakyTestHits(`test.${'skip'}(({ browserName }) => browserName === 'firefox', 'no WebRTC');`, 'docs/e2e/a.spec.ts'), {});
    assert.deepEqual(flakyTestHits(`const r = { ${'skip'}: true }; page.${'skip'}('x', 1);`), {});
  });

  test('a disabled test passes only with all three parts of the reason, in the comment right above it', () => {
    assert.deepEqual(flakyTestHits(REASON + SKIP_LIT), {});
    assert.deepEqual(flakyTestHits(`test('y', async () => {\n  ${REASON}  test.${'fixme'}();\n});`), {});
    assert.deepEqual(flakyTestHits(`// disabled: flaky\n${SKIP_LIT}`), { 'disabled-test': 1 }, 'a reason with no tried / evidence / re-enable is not one');
    assert.deepEqual(flakyTestHits(`// disabled: tried stuff; evidence flaky; re-enable later\n${SKIP_LIT}`), { 'disabled-test': 1 }, 'evidence must point at a URL, a file or #N');
    assert.deepEqual(flakyTestHits(`${REASON}const a = 1;\n${SKIP_LIT}`), { 'disabled-test': 1 }, 'the reason belongs to the statement it sits on');
    assert.deepEqual(flakyTestHits(REASON + ONLY), { 'focused-test': 1 }, 'no reason excuses a focused test');
    assert.deepEqual(flakyTestHits(`// re-enable when disabled: evidence #1 tried\n${SKIP_LIT}`), { 'disabled-test': 1 }, 'the three parts read in order');
    assert.deepEqual(flakyTestHits(REASON + 'await ' + SKIP_LIT), {}, 'the reason belongs to the whole statement');
    assert.deepEqual(flakyTestHits(`switch (k) { case 1:\n${REASON}${SKIP_LIT} }`), {}, 'a reason inside a case clause');
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
    assert.equal(playwrightRetriesFindings("test.describe.configure({ retries: 2 });", 'docs/e2e/a.spec.ts', { optional: true }).length, 1, 'a spec may not retry');
    assert.deepEqual(playwrightRetriesFindings("test('a', () => {});", 'docs/e2e/a.spec.ts', { optional: true }), []);
  });

  test('failing arm: a retry in a spec under a docs/e2e subfolder is found', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'retries-'));
    fs.mkdirSync(path.join(root, 'e2e', 'journeys'), { recursive: true });
    fs.writeFileSync(path.join(root, 'playwright.config.ts'), 'export default { retries: 0 };');
    fs.writeFileSync(path.join(root, 'e2e', 'journeys', 'a.spec.ts'), 'test.describe.configure({ retries: 2 });');
    const errors = [];
    checkPlaywrightRetries(errors, path.join(root, 'playwright.config.ts'));
    assert.equal(errors.length, 1, errors.join('\n'));
    assert.match(errors[0], /journeys/);
  });

  test('build:check runs the census', () => {
    const src = fs.readFileSync(path.join(__dirname, '../../../tools/check-ownership.js'), 'utf8');
    const run = src.slice(src.indexOf('function run('));
    assert.match(run.slice(0, run.indexOf('\n}\n')), /checkFlakyTests\(errors\)/);
    assert.match(run.slice(0, run.indexOf('\n}\n')), /checkPlaywrightRetries\(errors\)/);
  });
});

// The three shapes the testing guide's gotchas name (engineering/testing.md Part 3). Split strings, as above, so this
// file does not count itself.
const OT = `${'offset'}${'Top'}`;
const RESUME = `await page.clock.${'res'}${'ume'}();`;
const WRITE = `${'writeFile'}${'Sync'}`;
const COPY = `${'copyFile'}${'Sync'}`;
// A file at test/x.test.js (flakyTestHits' default), so one `..` reaches the repository root.
const ROOTED = `const ROOT = path.join(__dirname, '..');\n`;

describe('the guide-named shapes: offset-geometry, clock-resume, tree-write', () => {
  test('offset-geometry: an element offset in docs/e2e is counted, and only there', () => {
    const src = `const top = await el.evaluate((n) => n.${OT});`;
    assert.deepEqual(flakyTestHits(src, 'docs/e2e/a.spec.ts'), { 'offset-geometry': 1 });
    assert.deepEqual(flakyTestHits(`const x = el.${'offset'}${'Left'};`, 'docs/e2e/a.spec.ts'), { 'offset-geometry': 1 });
    // A unit test measures no layout: outside docs/e2e it is not this census's.
    assert.deepEqual(flakyTestHits(src, 'test/unit/a.test.js'), {});
  });

  test('offset-geometry: the visual viewport\'s own offset is a different property, directly or through a const', () => {
    assert.deepEqual(flakyTestHits(`const a = window.visualViewport.${OT};`, 'docs/e2e/a.spec.ts'), {});
    assert.deepEqual(flakyTestHits(`const b = window.visualViewport!.${OT};`, 'docs/e2e/a.spec.ts'), {});
    assert.deepEqual(flakyTestHits(`const vv = window.visualViewport;\nconst c = vv.${OT} + vv.height;`, 'docs/e2e/a.spec.ts'), {});
    // The bare global, as code inside a page.evaluate reads it.
    assert.deepEqual(flakyTestHits(`const d = visualViewport.${OT};`, 'docs/e2e/a.spec.ts'), {});
  });

  test('clock-resume: resuming a page clock is counted', () => {
    assert.deepEqual(flakyTestHits(RESUME, 'docs/e2e/a.spec.ts'), { 'clock-resume': 1 });
    assert.deepEqual(flakyTestHits(`await this.page.clock.${'res'}${'ume'}();`, 'docs/e2e/a.spec.ts'), { 'clock-resume': 1 });
    // Advancing a paused clock is the fix, and a resume() on something that is not a clock is not this shape.
    assert.deepEqual(flakyTestHits(`await page.clock.runFor(1100);`, 'docs/e2e/a.spec.ts'), {});
    assert.deepEqual(flakyTestHits(`stream.${'res'}${'ume'}();`, 'test/a.test.js'), {});
  });

  test('tree-write: a write into the repository\'s own lib/ or examples/ is counted', () => {
    assert.deepEqual(flakyTestHits(`${ROOTED}fs.${WRITE}(path.join(ROOT, 'lib', 'x.tmp.md'), 'x');`), { 'tree-write': 1 });
    assert.deepEqual(flakyTestHits(`${ROOTED}fs.${WRITE}(path.join(ROOT, 'examples/probe.md'), 'x');`), { 'tree-write': 1 });
    // Through a const, a cwd-relative literal, the destination of a copy, and process.cwd().
    assert.deepEqual(flakyTestHits(`${ROOTED}const p = path.join(ROOT, 'lib', 'components', 'probe.tmp.md');\nfs.${WRITE}(p, 'x');\nfs.rmSync(p);`), { 'tree-write': 2 });
    assert.deepEqual(flakyTestHits(`fs.${WRITE}('examples/probe.md', 'x');`), { 'tree-write': 1 });
    assert.deepEqual(flakyTestHits(`fs.${COPY}(src, path.join(process.cwd(), 'lib', 'a.js'));`), { 'tree-write': 1 });
    // A ROOT imported from a helper (unresolvable in the file) is the root by name.
    assert.deepEqual(flakyTestHits(`const { ROOT } = require('../helpers/decks.js');\nfs.${WRITE}(path.join(ROOT, 'lib', 'a.js'), 'x');`), { 'tree-write': 1 });
    assert.deepEqual(flakyTestHits(`fs.${WRITE}(path.join(ROOT, 'lib', 'a.js'), 'x');`), { 'tree-write': 1 });
  });

  test('tree-write: the root reached from the file\'s own folder, a template, a concatenation, an ESM root, a bare join', () => {
    const deep = 'test/unit/tools/a.test.js';
    assert.deepEqual(flakyTestHits(`fs.${WRITE}(path.join(__dirname, '..', '..', '..', 'lib', 'a'), 'x');`, deep), { 'tree-write': 1 });
    assert.deepEqual(flakyTestHits(`fs.${WRITE}(path.join(__dirname, '../../../examples/a.md'), 'x');`, deep), { 'tree-write': 1 });
    assert.deepEqual(flakyTestHits(`${ROOTED}fs.${WRITE}(\`\${ROOT}/lib/a\`, 'x');`), { 'tree-write': 1 });
    assert.deepEqual(flakyTestHits(`${ROOTED}fs.${WRITE}(ROOT + '/examples/a.md', 'x');`), { 'tree-write': 1 });
    assert.deepEqual(flakyTestHits(`const ROOT = fileURLToPath(new URL('../..', import.meta.url));\nfs.${WRITE}(path.join(ROOT, 'lib', 'a'), 'x');`, 'docs/e2e/a.spec.ts'), { 'tree-write': 1 });
    assert.deepEqual(flakyTestHits(`import { join } from 'node:path';\nconst ROOT = join(__dirname, '..');\nfs.${WRITE}(join(ROOT, 'lib', 'a'), 'x');`), { 'tree-write': 1 });
    assert.deepEqual(flakyTestHits(`${ROOTED}fse.outputFileSync(path.join(ROOT, 'examples', 'a.md'), 'x');`), { 'tree-write': 1 });
  });

  test('not a tree-write: a `..` that stops short of the root is measured against the file\'s depth', () => {
    // From test/unit/tools/, one `..` is test/unit, so its lib/ is not the repository's.
    assert.deepEqual(flakyTestHits(`const UP = path.join(__dirname, '..');\nfs.${WRITE}(path.join(UP, 'lib', 'a'), 'x');`, 'test/unit/tools/a.test.js'), {});
    assert.deepEqual(flakyTestHits(`const HERE = path.join(__dirname, '.');\nfs.${WRITE}(path.join(HERE, 'lib', 'a'), 'x');`, 'test/unit/tools/a.test.js'), {});
    // A name joined straight onto the root is not known to land in lib/ or examples/.
    assert.deepEqual(flakyTestHits(`${ROOTED}fs.${WRITE}(path.join(ROOT, name), 'x');`), {});
  });

  test('not a tree-write: a temp folder, a deeper base, a copy FROM the tree, a let that may be reassigned', () => {
    const tmp = `const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'x-'));\n`;
    assert.deepEqual(flakyTestHits(`${tmp}fs.${WRITE}(path.join(tmp, 'lib', 'a.js'), 'x');`), {});
    assert.deepEqual(flakyTestHits(`${ROOTED}const SCRATCH = path.join(ROOT, '.scratch', 'x');\nfs.mkdirSync(path.join(SCRATCH, 'lib'), { recursive: true });`), {});
    assert.deepEqual(flakyTestHits(`${ROOTED}${tmp}fs.${COPY}(path.join(ROOT, 'lib', 'a.js'), path.join(tmp, 'a.js'));`), {});
    assert.deepEqual(flakyTestHits(`${ROOTED}${tmp}let md = path.join(ROOT, 'examples', 'a.md');\nmd = path.join(tmp, 'a.md');\nfs.${WRITE}(md, 'x');`), {});
    // Reading the tree is fine.
    assert.deepEqual(flakyTestHits(`${ROOTED}fs.readFileSync(path.join(ROOT, 'examples', 'a.md'), 'utf8');`), {});
  });

  test('a flaky-ok mark with its reason excuses each of the three; a bare mark does not', () => {
    const ok = ' // flaky-ok: right as it is, for the reason given';
    assert.deepEqual(flakyTestHits(`const t = el.${OT};${ok}`, 'docs/e2e/a.spec.ts'), {});
    assert.deepEqual(flakyTestHits(`${RESUME}${ok}`, 'docs/e2e/a.spec.ts'), {});
    assert.deepEqual(flakyTestHits(`${ROOTED}fs.${WRITE}(path.join(ROOT, 'lib', 'a.js'), 'x');${ok}`), {});
    assert.deepEqual(flakyTestHits(`${RESUME} // flaky-ok:`, 'docs/e2e/a.spec.ts'), { 'clock-resume': 1 });
  });

  test('failing arm: each new shape, planted in a scratch tree the baseline does not know, fails the build', () => {
    const { root, base } = scratch({
      'docs/e2e/geo.spec.ts': `const top = await el.evaluate((n) => n.${OT});\n`,
      'docs/e2e/clk.spec.ts': `${RESUME}\n`,
      'test/w.test.js': `${ROOTED}fs.${WRITE}(path.join(ROOT, 'examples', 'probe.md'), 'x');\n`,
    }, {});
    const errors = [];
    checkFlakyTests(errors, root, base);
    const all = errors.join('\n');
    assert.equal(errors.length, 3, all);
    assert.match(all, /docs\/e2e\/geo\.spec\.ts: 1 offset-geometry where the baseline allows 0/);
    assert.match(all, /docs\/e2e\/clk\.spec\.ts: 1 clock-resume where the baseline allows 0/);
    assert.match(all, /test\/w\.test\.js: 1 tree-write where the baseline allows 0/);
  });

  test('the fast path parses a file whose only trigger is one of the three', () => {
    const { root } = scratch({
      'docs/e2e/geo.spec.ts': `const top = el.${OT};\n`,
      'docs/e2e/clk.spec.ts': `${RESUME}\n`,
      'test/w.test.js': `fs.${WRITE}('lib/a.js', 'x');\n`,
    }, {});
    assert.deepEqual(flakyTestTree(root), {
      'docs/e2e/clk.spec.ts': { 'clock-resume': 1 },
      'docs/e2e/geo.spec.ts': { 'offset-geometry': 1 },
      'test/w.test.js': { 'tree-write': 1 },
    });
  });
});
