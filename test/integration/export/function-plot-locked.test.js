/**
 * Integration: function-plot's figures are drawn in the LOCKED page for every export that captures a page, and the
 * plain `.html` keeps the library and its zoom (owner decisions 14 and 16; lib/export/locked-figures.js).
 *
 *   DRAW      `drawLocked` draws a plot as the in-page hydrate would (svg, viewBox) and reports a bad config as the
 *             in-page draw's error text.
 *   SANITIZE  what the locked page returns is sanitized before it reaches the capture page: a handler or a script
 *             in it is gone.
 *   EXPORT    the real CLI: `--player` ships the plot baked, and the kept `.html` beside the PDF still carries the
 *             library (decision 16), so only the capture page went without it.
 *
 * Needs Chromium.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const puppeteer = require('puppeteer');
const { drawLocked } = require('../../../lib/export/locked-figures.js');
const { openSanitizerPage } = require('../../../lib/packages/code-door-worker.js');
const { launchSandboxBrowser } = require('../../../lib/core/code-sandbox.js');

const ROOT = path.join(__dirname, '../../..');
const CHROME = process.env.CHROME_PATH || undefined;
const TIMEOUT = 300000;
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

test('DRAW: a plot comes back as the in-page draw makes it; a bad config as its error text', { timeout: TIMEOUT }, async () => {
  const out = await drawLocked(puppeteer, [{ config: b64('{ "data": [{ "fn": "x^2" }] }'), w: 600, h: 300 }, { config: b64('{ not json'), w: 600, h: 300 }], { executablePath: CHROME });
  assert.match(out[0].html, /^<svg class="function-plot"[^>]*width="600" height="300" viewBox="0 0 600 300"/);
  assert.match(out[1].error, /^functionplot error: /);
  // At the capture page's pixel density: d3's axis offsets its lines by half a pixel only at 1x, so a 2x raster export
  // drawn at 1x came out a pixel off (the PNG of examples/plugin-system-phase-b.md, slide 2).
  const at2 = await drawLocked(puppeteer, [{ config: b64('{ "data": [{ "fn": "x^2" }] }'), w: 600, h: 300 }], { executablePath: CHROME, deviceScaleFactor: 2 });
  assert.match(out[0].html, /class="domain"[^>]*d="M0\.5,/);
  assert.match(at2[0].html, /class="domain"[^>]*d="M0,/);
});

test('SANITIZE: a handler or a script in a drawing is gone before it leaves', { timeout: TIMEOUT }, async () => {
  const browser = await launchSandboxBrowser(puppeteer, { headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    const s = await openSanitizerPage(browser);
    try {
      const clean = await s.sanitize('<svg class="function-plot" onload="alert(1)"><script>alert(2)</script><path d="M0 0" onclick="x()"/><foreignObject><img src=x onerror=alert(3)></foreignObject></svg>');
      assert.doesNotMatch(clean, /onload|onclick|onerror|<script|alert/);
      assert.match(clean, /<svg class="function-plot"/);
    } finally {
      await s.close();
    }
  } finally {
    await browser.close();
  }
});

test('EXPORT: --player ships the plot baked, and the kept .html still carries the library', { timeout: TIMEOUT }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-locked-'));
  try {
    const deck = path.join(dir, 'deck.md');
    fs.writeFileSync(deck, '---\ntheme: indaco\n---\n\n## Plot\n\n```functionplot\n{ "data": [{ "fn": "x^2" }] }\n```\n');
    const run = (out, ...flags) => spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), deck, out, ...flags], { encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, LATTICE_HOME: dir } });
    const player = run(path.join(dir, 'player.html'), '--player');
    assert.equal(player.status, 0, player.stderr);
    const shipped = fs.readFileSync(path.join(dir, 'player.html'), 'utf8');
    assert.match(shipped, /<svg class="function-plot"/, 'the player has no baked plot');
    assert.doesNotMatch(player.stderr, /did not draw within|could not draw the plots/);
    const pdf = run(path.join(dir, 'deck.pdf'), '--keep-html');
    assert.equal(pdf.status, 0, pdf.stderr);
    const kept = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');
    const lib = fs.readFileSync(path.join(ROOT, 'lib/plugins/function-plot/vendor/function-plot.js'), 'utf8').slice(0, 200);
    assert.ok(kept.includes(lib), 'the .html lost function-plot, and its zoom with it (decision 16)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
