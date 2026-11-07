/**
 * Integration: function-plot's figures are drawn in the LOCKED page for every export that captures a page, in a fresh
 * context of the export's own browser (one browser per export, the owner's speed rule of 2026-10-20), and the plain
 * `.html` keeps the library and its zoom (owner decisions 14 and 16; lib/export/locked-figures.js).
 *
 *   DRAW      a locked page running the plugin's own draw-frame document (`openDrawPage`) draws a plot as the in-page
 *             hydrate would (svg, viewBox) and reports a bad config as the in-page draw's error text.
 *   SANITIZE  the capture page's draw host (`exportDrawHostScript`) sanitizes what comes back before the host writes it
 *             (`SANITIZER`): a handler or a script is gone, a clean drawing lands whole, no `DOMPurify` global is left
 *             behind, and a `release` answer leaves the figure showing its source.
 *   EXPORT    the real CLI: `--player` ships the plot baked, the kept `.html` beside the PDF still carries the library
 *             (decision 16), so only the capture page went without it, and the plots start no browser of their own.
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
const { openDrawPage, SANITIZER, exportDrawHostScript, DRAW_FN } = require('../../../lib/export/locked-figures.js');
const { launchSandboxBrowser } = require('../../../lib/core/code-sandbox.js');

const ROOT = path.join(__dirname, '../../..');
const CHROME = process.env.CHROME_PATH || undefined;
const TIMEOUT = 300000;
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

const job = (config, extra = {}) => ({ kind: 'function-plot', configB64: b64(config), configText: config, width: 600, height: 300, index: 0, ...extra });

test('DRAW: a plot comes back as the in-page draw makes it; a bad config as its error text', { timeout: TIMEOUT }, async () => {
  const browser = await launchSandboxBrowser(puppeteer, { headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    const locked = await openDrawPage(browser, 'function-plot');
    const ok = await locked.draw(job('{ "data": [{ "fn": "x^2" }] }'));
    const bad = await locked.draw(job('{ not json'));
    assert.match(ok.out, /^<svg class="function-plot"[^>]*width="600" height="300" viewBox="0 0 600 300"/);
    assert.match(bad.error, /^functionplot error: /);
    // At the capture page's pixel density: d3's axis offsets its lines by half a pixel only at 1x, so a 2x raster export
    // drawn at 1x came out a pixel off (the PNG of examples/plugin-system-phase-b.md, slide 2).
    const at2 = await locked.draw(job('{ "data": [{ "fn": "x^2" }] }'), 2);
    assert.match(ok.out, /class="domain"[^>]*d="M0\.5,/);
    assert.match(at2.out, /class="domain"[^>]*d="M0,/);
    await locked.close();
  } finally {
    await browser.close();
  }
});

test('SANITIZE: the capture page sanitizes each drawing before the host writes it; a clean one lands whole', { timeout: TIMEOUT }, async () => {
  const browser = await launchSandboxBrowser(puppeteer, { headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent('<div id="t" data-lattice-hydrate="function-plot" data-lattice-config="e30=" data-lattice-settle="hydrating"></div>');
    const hostile = '<svg class="function-plot" onload="alert(1)"><script>alert(2)</script><path d="M0 0" onclick="x()"/><foreignObject><img src=x onerror=alert(3)></foreignObject></svg>';
    const clean = '<svg class="function-plot" width="600" height="300"><g transform="translate(40,20)"><path d="M0.5,0.5H612.5" class="domain"></path></g></svg>';
    await page.evaluate((fn, answers) => { let i = 0; window[fn] = async () => answers[i++]; }, DRAW_FN, [{ out: hostile }, { out: hostile }, { out: clean }, { release: true }]);
    await page.evaluate(exportDrawHostScript(['function-plot']));
    await assert.rejects(page.evaluate(() => window.__latticeExportDrawHost.draw({ kind: 'function-plot' })), /slide sanitizer is not in the capture page/);
    await page.evaluate(SANITIZER());
    await page.evaluate(SANITIZER()); // idempotent
    const [cleaned, kept, released, globals] = await page.evaluate(async () => {
      const host = window.__latticeExportDrawHost;
      const a = await host.draw({ kind: 'function-plot' });
      const b = await host.draw({ kind: 'function-plot' });
      const t = document.getElementById('t');
      const c = await host.draw({ kind: 'function-plot' }, t);
      return [a, b, [c, t.getAttribute('data-lattice-settle'), t.hasAttribute('data-lattice-final')], [typeof window.DOMPurify, typeof window.createSlideSanitizer, typeof window.__latticeSanitizeDrawing]];
    });
    assert.doesNotMatch(cleaned, /onload|onclick|onerror|<script|alert/);
    assert.match(cleaned, /<svg class="function-plot"/);
    assert.equal(kept, clean);
    assert.deepEqual(released, [null, 'unavailable', true], 'a release writes nothing and leaves the source showing');
    assert.deepEqual(globals, ['undefined', 'undefined', 'function']);
    // A page where something else defined the name first is refused, not trusted.
    const planted = await browser.newPage();
    await planted.evaluate(() => { window.__latticeSanitizeDrawing = (html) => html; });
    await assert.rejects(planted.evaluate(SANITIZER()), /already defined by something other than Lattice/);
  } finally {
    await browser.close();
  }
});

test('EXPORT: --player ships the plot baked, and the kept .html still carries the library', { timeout: TIMEOUT }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fp-locked-'));
  try {
    const deck = path.join(dir, 'deck.md');
    fs.writeFileSync(deck, '---\ntheme: indaco\n---\n\n## Plot\n\n```functionplot\n{ "data": [{ "fn": "x^2" }] }\n```\n');
    // Counts the browsers each export launches.
    const probe = path.join(dir, 'probe.cjs');
    fs.writeFileSync(probe, "const M = require('module'); const o = M.prototype.require; let n = 0; M.prototype.require = function (id) { const m = o.apply(this, arguments); if (id === 'puppeteer' && !m.__c) { m.__c = 1; const l = m.launch.bind(m); m.launch = (x) => { n++; return l(x); }; } return m; }; process.on('exit', () => process.stderr.write('LAUNCHES=' + n + '\\n'));\n");
    const run = (out, ...flags) => spawnSync(process.execPath, ['-r', probe, path.join(ROOT, 'lattice.js'), deck, out, ...flags], { encoding: 'utf8', timeout: TIMEOUT, env: { ...process.env, LATTICE_HOME: dir } });
    const player = run(path.join(dir, 'player.html'), '--player');
    assert.equal(player.status, 0, player.stderr);
    // The capture browser, and the player's prune pass's own hardened one, as on `main` (lattice.js
    // `prunePlayerCssInPage`): the plots add none.
    assert.match(player.stderr, /LAUNCHES=2\b/, 'the player export started a browser for its plots');
    const shipped = fs.readFileSync(path.join(dir, 'player.html'), 'utf8');
    assert.match(shipped, /<svg class="function-plot"/, 'the player has no baked plot');
    assert.doesNotMatch(player.stderr, /did not draw within|could not draw the plots/);
    const pdf = run(path.join(dir, 'deck.pdf'), '--keep-html');
    assert.equal(pdf.status, 0, pdf.stderr);
    assert.match(pdf.stderr, /LAUNCHES=1\b/, 'the PDF export started more than one browser');
    const kept = fs.readFileSync(path.join(dir, 'deck.html'), 'utf8');
    const lib = fs.readFileSync(path.join(ROOT, 'lib/plugins/function-plot/vendor/function-plot.js'), 'utf8').slice(0, 200);
    assert.ok(kept.includes(lib), 'the .html lost function-plot, and its zoom with it (decision 16)');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
