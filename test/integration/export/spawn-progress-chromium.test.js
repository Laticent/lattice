/**
 * runNode's hang watch, against a real Chromium (HARD RULE #34: a deadline proves it can fail).
 *
 * export-formats.test.js runs every lattice.js export under runNodeSync with EXPORT_WATCH, which judges the export's
 * whole process TREE: lattice.js, its workers, and the Chromium they launch. These are the two ways that tree hangs
 * for real, each with its own Chromium, so a change that went back to watching the child's own CPU, or that dropped
 * the stall floor an idle Chromium needs, goes red here:
 *   - a page that SPINS: the renderer burns CPU while lattice.js waits on it, using none itself;
 *   - a page that never answers: the tree WAITS forever, and an idle Chromium still ticks, so its CPU never stands
 *     quite still (at most 70 ms per 10 s, measured 2026-11-28).
 * Each arm also proves the tree is killed whole: the Chromium it started is gone when runNode rejects.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome');
const { runNode, EXPORT_WATCH } = require('../../helpers/spawn-progress');

const ROOT = path.join(__dirname, '..', '..', '..');
const CHROME = resolveChrome();

/**
 * A Node child that launches Chromium, writes the browser's pid to a file, puts a page in one of two states, then waits
 * forever. Fixed source: the puppeteer path, the browser, the pid file and the page state reach it in argv.
 *   - `spin`: the page runs a loop that never returns, so the renderer burns CPU while the child waits on it;
 *   - `wait`: the page waits on a condition that never comes true. Mutation polling re-checks only when the DOM changes,
 *     and it never does, so the tab sits idle (the default polls every frame, which would be work, not a wait).
 */
const CHROMIUM_CHILD = `
  const [puppeteerPath, chrome, pidFile, state] = process.argv.slice(1);
  const puppeteer = require(puppeteerPath);
  (async () => {
    const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
    require('node:fs').writeFileSync(pidFile, String(browser.process().pid));
    const tab = await browser.newPage();
    const page = state === 'spin'
      ? tab.evaluate(() => { for (;;) {} })
      : tab.goto('data:text/html,<p>waiting</p>').then(() => tab.waitForFunction(() => false, { polling: 'mutation', timeout: 0 }));
    page.catch(() => {});
    await new Promise(() => {}); // the child itself never finishes
  })();`;

/** The argv for a `node -e` Chromium child in page state `state`. */
const chromiumChild = (pidFile, state) => [CHROMIUM_CHILD, path.join(ROOT, 'node_modules', 'puppeteer'), CHROME, pidFile, state];

/** Whether `pid` still runs (present and not a zombie). runNode rejects only once the tree is dead, so no wait here. */
function running(pid) {
  try {
    return fs.readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ')[1][0] !== 'Z';
  } catch {
    return false;
  }
}

// ci-skip: the export integration job runs on ubuntu-24.04 with Chromium, where this block runs; only a machine with
// no /proc or no browser skips it, and skipWithoutChrome fails rather than skips a CI job that lost its browser.
describe('runNode watches a Chromium tree', { skip: (process.platform !== 'linux' && 'watches /proc, which only Linux has') || skipWithoutChrome(CHROME) }, () => {
  const pidFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'spawn-chromium-')), 'chrome.pid');

  test('failing arm: a page that spins is a hang, though the Node child uses no CPU itself', async () => {
    const pids = pidFile();
    // The budget is small so the arm is quick; EXPORT_WATCH's own budget is sized for a full export.
    const watch = { ...EXPORT_WATCH, cpuBudgetMs: 5000 };
    await assert.rejects(runNode('-e', chromiumChild(pids, 'spin'), { cwd: ROOT, ...watch }), /spun \d+ s of CPU without exiting/);
    const chrome = Number(fs.readFileSync(pids, 'utf8'));
    assert.equal(running(chrome), false, `Chromium ${chrome} outlived the hang`);
  });

  test('failing arm: a page that never answers is a hang, though an idle Chromium still ticks', async () => {
    const pids = pidFile();
    await assert.rejects(runNode('-e', chromiumChild(pids, 'wait'), { cwd: ROOT, ...EXPORT_WATCH }), /used \d+ ms of CPU in 10 s, no more than an idle process/);
    const chrome = Number(fs.readFileSync(pids, 'utf8'));
    assert.equal(running(chrome), false, `Chromium ${chrome} outlived the hang`);
  });
});
