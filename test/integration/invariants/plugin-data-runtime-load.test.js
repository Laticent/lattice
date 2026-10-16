/**
 * The runtime fetches a data plugin's script (the icons' drawings) from beside itself, on a page
 * Marp rendered (engineering/decisions/2026-09-29-inline-icons.md § 16).
 *
 * These arms drive the BUILT runtime in Chromium, loaded by `src` from `file://` the way an
 * Export-to-Marp bundle loads it, in a page that carries `<code>^{database}</code>` and no data:
 *   · the sibling is there → the span draws, and the file is requested ONCE, even after more
 *     spans arrive (no refetch loop);
 *   · the sibling is missing → the span stays code, and the console says which file;
 *   · the bundle's settings turn the plugin off → nothing is requested and the span is marked off.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { ROOT } = require('../../helpers/render');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome');

const chrome = resolveChrome();
const RUNTIME = path.join(ROOT, 'dist', 'lattice-runtime.js');
const DATA = path.join(ROOT, 'docs', 'public', 'playground', 'lattice-plugin-icons.js');

let browser;
before(async () => {
  if (!chrome) return;
  browser = await require('puppeteer').launch({ executablePath: chrome, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });

async function probe({ sibling, off = null }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-plugin-data-'));
  try {
    fs.copyFileSync(RUNTIME, path.join(dir, 'lattice-runtime.js'));
    if (sibling) fs.copyFileSync(DATA, path.join(dir, 'lattice-plugin-icons.js'));
    const settings = off ? `<script type="application/lattice-export-settings">${JSON.stringify({ overflowMarker: 'reader', pluginsOff: off })}</script>` : '';
    fs.writeFileSync(path.join(dir, 'index.html'),
      '<!doctype html><html><head><meta charset="utf-8"></head><body>'
      + '<section id="1"><p>Rows land in <code>^{database}</code>.</p></section>'
      + `<script src="lattice-runtime.js"></script>${settings}</body></html>`);
    const page = await browser.newPage();
    const requests = [];
    const warnings = [];
    page.on('request', (r) => { if (r.url().includes('lattice-plugin-icons')) requests.push(r.url()); });
    page.on('console', (m) => { if (/^warn/.test(m.type())) warnings.push(m.text()); });
    try {
      await page.goto(`file://${path.join(dir, 'index.html')}`, { waitUntil: 'load' });
      await new Promise((r) => setTimeout(r, sibling ? 1500 : 1000));
      // More spans after the first draw: the pass draws them from the data it has, fetching nothing.
      await page.evaluate(() => {
        const p = document.createElement('p');
        p.innerHTML = '<code>^{server}</code> <code>^{cloud}</code>';
        document.querySelector('section').appendChild(p);
      });
      await new Promise((r) => setTimeout(r, 800));
      const state = await page.evaluate(() => ({
        drawn: [...document.querySelectorAll('section .lat-icon')].map((e) => e.getAttribute('data-icon')),
        code: [...document.querySelectorAll('section code')].map((c) => ({ text: c.textContent, off: c.getAttribute('data-lattice-off') })),
      }));
      return { ...state, requests, warnings };
    } finally {
      await page.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('the sibling data script draws the icons, fetched once', { skip: skipWithoutChrome(chrome) }, async () => {
  const r = await probe({ sibling: true });
  assert.deepEqual(r.drawn.sort(), ['cloud', 'database', 'server']);
  assert.deepEqual(r.code, []);
  assert.equal(r.requests.length, 1, `one request, not ${r.requests.length}`);
});

test('a missing sibling leaves the spans as code and names the file', { skip: skipWithoutChrome(chrome) }, async () => {
  const r = await probe({ sibling: false });
  assert.deepEqual(r.drawn, []);
  assert.ok(r.code.some((c) => c.text === '^{database}'));
  assert.equal(r.requests.length, 1, 'tried once, never again');
  assert.ok(r.warnings.some((w) => /lattice-plugin-icons\.js did not load/.test(w)), `warned: ${r.warnings.join(' | ')}`);
});

test('a bundle that turned the icons plugin off fetches nothing and marks the spans', { skip: skipWithoutChrome(chrome) }, async () => {
  const r = await probe({ sibling: true, off: ['icons'] });
  assert.deepEqual(r.drawn, []);
  assert.equal(r.requests.length, 0);
  assert.equal(r.code.find((c) => c.text === '^{database}')?.off, 'icons');
});
