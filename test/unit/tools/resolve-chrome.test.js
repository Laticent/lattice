/**
 * Unit: tools/lib/resolve-chrome.js — the ONE Chromium probe (#1327).
 *
 * Nine tools carried hand-copied resolvers under two names, and they had drifted:
 * one shelled out to `bash -lc 'ls /root/.cache/…'`, hard-coding root's home so
 * it could never resolve on a CI runner. The point of consolidating was that a
 * portability fix should be findable and fixable in ONE place — which is only
 * true if that place is tested. These cases are the behaviors the copies got
 * wrong, not a restatement of the implementation.
 *
 * Everything runs against a synthetic cache tree in a temp dir, so the assertions
 * hold identically on a machine with no Chromium at all.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

let root;
const touch = (...parts) => {
  const p = path.join(root, ...parts);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '');
  return p;
};

describe('resolve-chrome', () => {
  before(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'resolve-chrome-')); });
  after(() => { fs.rmSync(root, { recursive: true, force: true }); });

  test('returns undefined — never throws — when there is nothing to find', () => {
    // The whole contract: callers own their own "skips loudly" message, so this
    // must hand back a sentinel rather than exiting or raising.
    assert.equal(resolveChrome({ env: undefined, roots: [path.join(root, 'nope')] }), undefined);
  });

  test('an unreadable / missing root is skipped, not fatal', () => {
    const good = touch('cache', 'linux-120.0.1', 'chrome-linux64', 'chrome');
    assert.equal(
      resolveChrome({ env: undefined, roots: ['/definitely/not/here', path.join(root, 'cache')] }),
      good,
      'a bad root ahead of a good one must not shadow it',
    );
  });

  test('CHROME_PATH wins — but only if it actually exists', () => {
    const real = touch('explicit-chrome');
    const cached = touch('cache2', 'linux-120.0.1', 'chrome-linux64', 'chrome');
    assert.equal(resolveChrome({ env: real, roots: [path.join(root, 'cache2')] }), real);
    // A stale exported CHROME_PATH (cache wiped, env left behind) must fall
    // through to a binary that can actually launch, not be handed to puppeteer.
    assert.equal(
      resolveChrome({ env: path.join(root, 'deleted-chrome'), roots: [path.join(root, 'cache2')] }),
      cached,
    );
  });

  test('picks the NEWEST build numerically — the bug every copy shared', () => {
    // A lexical `.sort().reverse()` puts "linux-99" above "linux-131", because
    // "9" > "1" as a character. All nine originals did exactly that; it stayed
    // invisible only because the sandbox installs a single build.
    const dir = path.join(root, 'cache3');
    touch('cache3', 'linux-99.0.4844.51', 'chrome-linux64', 'chrome');
    const newest = touch('cache3', 'linux-131.0.6778.204', 'chrome-linux64', 'chrome');
    touch('cache3', 'linux-120.0.6099.109', 'chrome-linux64', 'chrome');
    assert.equal(resolveChrome({ env: undefined, roots: [dir] }), newest);
  });

  test('roots are probed in order, so $HOME beats the /root sandbox path', () => {
    const home = path.join(root, 'home-cache');
    const sandbox = path.join(root, 'root-cache');
    const homeBin = touch('home-cache', 'linux-100.0.1', 'chrome-linux64', 'chrome');
    touch('root-cache', 'linux-131.0.1', 'chrome-linux64', 'chrome');
    // Deliberately: the HOME hit wins even though the sandbox build is newer.
    // Ordering is a statement about whose machine this is, not about versions.
    assert.equal(resolveChrome({ env: undefined, roots: [home, sandbox] }), homeBin);
  });

  test('a build directory with no binary inside is stepped over', () => {
    const dir = path.join(root, 'cache4');
    fs.mkdirSync(path.join(dir, 'linux-140.0.0'), { recursive: true }); // empty
    const real = touch('cache4', 'linux-131.0.1', 'chrome-linux64', 'chrome');
    assert.equal(resolveChrome({ env: undefined, roots: [dir] }), real);
  });

  describe('non-Linux layouts — every original copy knew only `linux-`', () => {
    test('macOS arm64 and x64 resolve inside the .app bundle', () => {
      const dir = path.join(root, 'mac');
      const arm = touch('mac', 'mac_arm-131.0.1', 'chrome-mac-arm64',
        'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      assert.equal(resolveChrome({ env: undefined, platform: 'darwin', roots: [dir] }), arm);

      const dir2 = path.join(root, 'macx');
      const x64 = touch('macx', 'mac-131.0.1', 'chrome-mac-x64',
        'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing');
      assert.equal(resolveChrome({ env: undefined, platform: 'darwin', roots: [dir2] }), x64);
    });

    test('Windows resolves chrome.exe', () => {
      const dir = path.join(root, 'win');
      const exe = touch('win', 'win64-131.0.1', 'chrome-win64', 'chrome.exe');
      assert.equal(resolveChrome({ env: undefined, platform: 'win32', roots: [dir] }), exe);
    });

    test('a Linux cache is NOT matched when the platform is darwin', () => {
      const dir = path.join(root, 'cache3');
      assert.equal(resolveChrome({ env: undefined, platform: 'darwin', roots: [dir] }), undefined);
    });
  });

  test('every render-aware tool uses the shared probe, and none kept a private copy', () => {
    // The regression this consolidation exists to prevent is a TENTH copy quietly
    // reappearing. Assert over the real files rather than trusting review.
    //
    // SCOPE IS `tools/` ONLY, and deliberately so: 15 files under `test/` still
    // carry their own resolver, including the `bash -lc 'ls /root/.cache/…'`
    // shellout in test/benchmark/engine-bench.mjs. Those are pre-existing and off
    // the path of #1327 (which enumerates nine TOOLS), so they are logged rather
    // than pulled into this diff — but the exemption is stated here rather than
    // left implicit, because a guard that quietly checks less than its name
    // suggests is how the next copy gets in.
    const toolsDir = path.join(__dirname, '../../../tools');
    const offenders = [];
    for (const f of fs.readdirSync(toolsDir).filter((f) => f.endsWith('.js'))) {
      const src = fs.readFileSync(path.join(toolsDir, f), 'utf8');
      if (/^function (resolveChrome|chromePath)\s*\(/m.test(src)) offenders.push(f);
      // The `bash -lc ls …puppeteer` shape that could never run off this sandbox.
      if (/bash[\s\S]{0,40}puppeteer/.test(src)) offenders.push(`${f} (shells out to find Chromium)`);
    }
    assert.deepEqual(offenders, [], `these tools define their own Chromium resolver: ${offenders.join(', ')}`);
  });
});
