/**
 * The list contract (lib/core/list-contract.js, W2) on a real Export-to-Marp bundle: the pinned
 * marp-cli renders it, Chromium runs the bundle's runtime, and the runtime's mirror
 * (`normalizeListsDom`) gives each slide the list its layout reads, stamped `data-list-contract`.
 *
 * Why a real render: a front-matter gate added to the mirror (2026-11-20) kept it off for good on a
 * marp-cli export, and the jsdom fidelity probe, which hands the runtime its front matter up front,
 * stayed green. Only this surface showed it. Local runs skip when the pinned marp-cli is not
 * installed (test/helpers/marp-cli.js); CI fails instead.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { resolveChrome, skipUnlessCI } = require('../../helpers/chrome');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const { marpCli } = require('../../helpers/marp-cli');

const ROOT = path.join(__dirname, '..', '..', '..');
const EXPORT_CLI = path.join(ROOT, 'tools', 'export-marp.js');
const OUT = path.join(ROOT, '.scratch', 'marp-list-contract');
const TIMEOUT = 300000;

// Each layout written with the marker it does NOT read, so only the mirror can put it right.
const DECK = `---
marp: true
theme: indaco
---

<!-- _class: agenda -->

## Agenda

- One
- Two

---

<!-- _class: cycle -->

## Cycle

1. Measure
   - Read the signal.
2. Decide
   - Pick one change.
3. Ship
   - Put it out.

---

<!-- _class: list-steps -->

## Steps

- Meet the team
  - A coffee with each lead.
- Ship something small
  - A real change.
`;

const MARP = marpCli();

function marp(args, cwd, timeout = TIMEOUT) {
  const env = { ...process.env, CHROME_NO_SANDBOX: '1' };
  if (!env.CHROME_PATH) {
    const chrome = resolveChrome();
    if (chrome) env.CHROME_PATH = chrome;
  }
  if (!MARP.ok) return { status: null, stdout: '', stderr: MARP.reason };
  return MARP.run([...args], { cwd, encoding: 'utf8', env, timeout });
}

describe('the list contract on an Export-to-Marp bundle — real marp-cli, real Chromium', () => {
  let skip = null;
  let browser;
  let slides = [];

  before(async () => {
    const probe = marp(['--version'], ROOT, 90000);
    if (probe.status !== 0) {
      const reason = `no marp-cli to run (exit ${probe.status}): ${String(probe.stderr || '').slice(0, 300)}`;
      if (process.env.CI) throw new Error(`[marp-list-contract] ${reason}`);
      skip = reason;
      return;
    }
    fs.rmSync(OUT, { recursive: true, force: true });
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, 'lists.md'), DECK);
    const r = spawnSync(process.execPath, [EXPORT_CLI, path.join(OUT, 'lists.md'), path.join(OUT, 'out'), '--no-agent'], { cwd: ROOT, encoding: 'utf8', timeout: TIMEOUT });
    assert.equal(r.status, 0, `export-marp failed:\n${r.stdout}\n${r.stderr}`);
    const bundle = path.join(OUT, 'out', 'lists');
    const m = marp(['lists.md', '--config-file', 'marp.config.cjs', '--allow-local-files', '-o', 'out.html'], bundle);
    assert.equal(m.status, 0, `marp failed:\n${m.stdout}\n${m.stderr}`);
    browser = await require('puppeteer').launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => (req.url().startsWith('file:') ? req.continue() : req.abort()));
    await page.goto(require('node:url').pathToFileURL(path.join(bundle, 'out.html')).href, { waitUntil: 'networkidle0' });
    // A signal, not a duration: the runtime stamps each list slide once it has run.
    await page.waitForFunction(() => document.querySelectorAll('section[data-list-contract]').length >= 3, { timeout: 60000 });
    slides = await page.evaluate(() =>
      [...document.querySelectorAll('section[data-list-contract]')].map((s) => ({
        cls: (s.getAttribute('class') || '').split(/\s+/).find((c) => ['agenda', 'cycle', 'list-steps'].includes(c)),
        stamp: s.getAttribute('data-list-contract'),
        outer: (() => {
          const l = s.querySelector('ul, ol');
          return l ? `${l.tagName.toLowerCase()}${l.hasAttribute('data-ordered') ? `[${l.getAttribute('data-ordered')}]` : ''}` : '';
        })(),
      })),
    );
  });

  after(async () => {
    if (browser) await browser.close();
  });

  test('each slide gets the element its layout reads, from the runtime', (t) => {
    const why = skipUnlessCI(Boolean(skip), skip);
    if (why) return t.skip(why);
    const by = Object.fromEntries(slides.map((s) => [s.cls, s]));
    assert.deepEqual(by.agenda, { cls: 'agenda', stamp: 'neutral', outer: 'ol' }, 'agenda written with `-` reads an `ol`');
    assert.equal(by.cycle.stamp, 'neutral');
    assert.equal(by.cycle.outer, 'ul', 'cycle written with `1.` reads a `ul`');
    assert.deepEqual(by['list-steps'], { cls: 'list-steps', stamp: 'numbered-tags', outer: 'ol[false]' }, 'list-steps written with `-` is an unnumbered `ol`');
  });
});
