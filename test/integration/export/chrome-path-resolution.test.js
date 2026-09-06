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
 * These four cases are the contract, and each one is a thing that was or could be
 * got wrong. They drive the REAL CLI to a REAL PDF: the resolver's whole failure
 * mode was that every cheaper signal said it was fine.
 *
 * `HOME` pointed at an empty directory is what makes the cases separable — it is
 * how the puppeteer cache is taken away without deleting anything. (The scan also
 * walks `/home/<user>/.cache/puppeteer`; the guard below skips rather than lies if
 * this machine has one of those.)
 */

const { test, describe } = require('node:test');
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

  /**
   * A HOME with no puppeteer cache under it. Only meaningful while no OTHER home
   * on this box has one either — the scan walks `/home/*` regardless of HOME — so
   * `cacheIsHidable` reports whether taking HOME away actually takes the cache away.
   */
  const emptyHome = () => fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-nohome-'));
  const cacheIsHidable = (() => {
    try {
      return !fs.readdirSync('/home').some((u) => fs.existsSync(`/home/${u}/.cache/puppeteer`));
    } catch { return true; }
  })();

  /** Render the fixture with exactly this env overlay; return the CLI result. */
  function render(env, label) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-chrome-'));
    const out = path.join(dir, `${label}.pdf`);
    const r = spawnSync(process.execPath, [EMULATOR, FIXTURE, out, '--quiet'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, PUPPETEER_EXECUTABLE_PATH: '', CHROME_PATH: '', ...env },
      timeout: TIMEOUT,
    });
    return { ...r, rendered: fs.existsSync(out) && fs.statSync(out).size > 0 };
  }

  test('CHROME_PATH alone renders when nothing else can be discovered', { skip }, () => {
    if (!cacheIsHidable) return; // another user's cache would resolve regardless
    const r = render({ HOME: emptyHome(), CHROME_PATH: chrome }, 'chrome-path');
    assert.ok(r.rendered, `CHROME_PATH did not reach the renderer:\n${r.stderr}`);
  });

  test('PUPPETEER_EXECUTABLE_PATH alone renders — unchanged', { skip }, () => {
    if (!cacheIsHidable) return;
    const r = render({ HOME: emptyHome(), PUPPETEER_EXECUTABLE_PATH: chrome }, 'pptr-path');
    assert.ok(r.rendered, `PUPPETEER_EXECUTABLE_PATH did not reach the renderer:\n${r.stderr}`);
  });

  test('PUPPETEER_EXECUTABLE_PATH still wins over CHROME_PATH', { skip }, () => {
    // The explicit override stays FIRST and stays unconditional: overflow-nightly
    // pins one specific Chromium so its baseline stays comparable, and a pin that
    // quietly renders on some other browser is worse than one that fails.
    const r = render({ PUPPETEER_EXECUTABLE_PATH: chrome, CHROME_PATH: MISSING }, 'precedence');
    assert.ok(r.rendered, `the explicit override lost its precedence:\n${r.stderr}`);
  });

  test('a CHROME_PATH pointing at nothing falls through to the cache scan', { skip }, () => {
    // The regression guard for this change. Before it, a junk CHROME_PATH was
    // ignored because the variable was ignored; it must stay ignored now that the
    // variable is read, or every decorative CHROME_PATH in the tree becomes a
    // render failure.
    const r = render({ CHROME_PATH: MISSING }, 'fallthrough');
    assert.ok(r.rendered, `a stale CHROME_PATH broke a render that used to work:\n${r.stderr}`);
  });
});
