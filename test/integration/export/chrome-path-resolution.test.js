/**
 * Integration: which env var actually decides the browser the renderer launches.
 *
 * `CHROME_PATH` was inert on the render path and nothing said so. The SessionStart
 * hook exports it, `AGENTS.md` and `engineering/gotchas/ci.md` tell you to set it,
 * `test/helpers/chrome.js` reads it FIRST, and `test/benchmark/engine-bench.mjs`
 * resolves a binary specifically to pass it down as `CHROME_PATH` — while
 * `detectChromeExecutable()` read only `PUPPETEER_EXECUTABLE_PATH`, then the
 * puppeteer cache, then `which`.
 *
 * Nobody noticed because the value everyone sets is the same binary the cache scan
 * finds unaided, so the variable looked load-bearing on every machine that already
 * worked. It failed in exactly the situation the docs were written for — no
 * discoverable cache — where the documented fix did nothing and the program's own
 * warning named a different variable. #2088.
 *
 * HOW THESE ARMS DISCRIMINATE, and why the first draft of this file did not. That
 * draft took the browser away by pointing HOME at an empty directory. It cannot
 * work: the cache scan walks EVERY `/home/<user>/.cache/puppeteer` regardless of
 * HOME, so on a GitHub runner (`HOME=/home/runner`, and `ci.yml` caches exactly
 * there) the browser is always discoverable. The draft guarded on that with a bare
 * `return`, which made the ONLY arm that detects a revert a silent no-op on the
 * very gate it was added to — `node:test` reports it `ok`, with `skipped: 0`, so no
 * log scan finds it either. That is the failure `test/unit/tools/chrome-guard.test.js`
 * was written about, reintroduced.
 *
 * So these arms never hide the browser. Each points an env var at a SHIM — a tiny
 * script that touches a marker file and then `exec`s the real Chromium — and asserts
 * which marker exists. That answers "which path did the renderer launch" directly
 * instead of inferring it from whether a render happened, and it holds whether or
 * not a cache is present, on a runner or a laptop.
 */

const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

describe('chrome-path-resolution', () => {
  const ROOT = path.join(__dirname, '..', '..', '..');
  const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
  const FIXTURE = path.join(ROOT, 'test', 'fixtures', 'preview-deck.md');
  const TIMEOUT = 120000;
  const MISSING = '/nonexistent/chrome';

  const chrome = resolveChrome();
  const skip = skipWithoutChrome(chrome);

  const dirs = [];
  const workDir = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-chrome-'));
    dirs.push(d);
    return d;
  };
  after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

  /**
   * An executable that records having been run, then becomes the real browser.
   * `exec` matters: puppeteer talks to the process it spawned over its stdio and
   * DevTools pipe, so the shim must not survive as a parent in between.
   */
  function shim(dir, name) {
    const bin = path.join(dir, name);
    const marker = path.join(dir, `${name}.ran`);
    fs.writeFileSync(bin, `#!/bin/sh\n: > "${marker}"\nexec "${chrome}" "$@"\n`);
    fs.chmodSync(bin, 0o755);
    return { bin, marker, ran: () => fs.existsSync(marker) };
  }

  /** Render the fixture with exactly this env overlay; report exit and output. */
  function render(dir, env) {
    const out = path.join(dir, 'out.pdf');
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out, '--quiet'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: '', CHROME_PATH: '', ...env },
      timeout: TIMEOUT,
    });
    return { ...r, rendered: fs.existsSync(out) && fs.statSync(out).size > 0 };
  }

  test('CHROME_PATH selects the browser', { skip }, () => {
    // THE FIX. Before it this arm failed: the marker was never written, because
    // the renderer resolved its own cache and never looked at CHROME_PATH.
    const dir = workDir();
    const s = shim(dir, 'chrome-path-shim');
    const r = render(dir, { CHROME_PATH: s.bin });
    assert.ok(r.rendered, `render failed:\n${r.stderr}`);
    assert.ok(s.ran(), 'CHROME_PATH did not reach the renderer — some other binary launched');
  });

  test('PUPPETEER_EXECUTABLE_PATH selects the browser — unchanged', { skip }, () => {
    const dir = workDir();
    const s = shim(dir, 'pptr-shim');
    const r = render(dir, { PUPPETEER_EXECUTABLE_PATH: s.bin });
    assert.ok(r.rendered, `render failed:\n${r.stderr}`);
    assert.ok(s.ran(), 'PUPPETEER_EXECUTABLE_PATH did not reach the renderer');
  });

  test('PUPPETEER_EXECUTABLE_PATH wins over CHROME_PATH', { skip }, () => {
    // The explicit pin stays FIRST. overflow-nightly.yml pins one specific Chromium
    // so its baseline stays comparable, and it sets BOTH variables; if CHROME_PATH
    // ever took precedence, that pin would quietly stop meaning anything.
    const dir = workDir();
    const winner = shim(dir, 'pptr-shim');
    const loser = shim(dir, 'chrome-path-shim');
    const r = render(dir, { PUPPETEER_EXECUTABLE_PATH: winner.bin, CHROME_PATH: loser.bin });
    assert.ok(r.rendered, `render failed:\n${r.stderr}`);
    assert.ok(winner.ran(), 'the explicit override lost its precedence');
    assert.ok(!loser.ran(), 'CHROME_PATH overtook PUPPETEER_EXECUTABLE_PATH');
  });

  test('an unusable CHROME_PATH falls through instead of failing the render', { skip }, () => {
    // The regression guard, and it needs all three shapes. A path that merely does
    // not exist was the only one the first draft checked, so `fs.existsSync` looked
    // sufficient — while a DIRECTORY (`/Applications/Google Chrome.app` is one) and
    // a non-executable file both passed it and then died in puppeteer with
    // `spawn … EACCES`, turning a working render into a failure. Every decorative
    // CHROME_PATH in the tree is one of these three shapes.
    const dir = workDir();
    const aDir = path.join(dir, 'chrome.app');
    fs.mkdirSync(aDir);
    const notExec = path.join(dir, 'not-executable');
    fs.writeFileSync(notExec, '#!/bin/sh\nexit 0\n');
    fs.chmodSync(notExec, 0o644);

    for (const [label, value] of [['missing', MISSING], ['a directory', aDir], ['not executable', notExec]]) {
      const r = render(workDir(), { CHROME_PATH: value });
      assert.ok(r.rendered, `CHROME_PATH ${label} broke a render that used to work:\n${r.stderr}`);
    }
  });
});
