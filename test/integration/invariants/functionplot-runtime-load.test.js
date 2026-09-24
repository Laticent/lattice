/**
 * The runtime loads function-plot.js on demand, and says so honestly when it cannot.
 *
 * The docs-site hosts load only `lattice-runtime.js`, and until 2026-09-24 not one of them
 * drew a ```functionplot fence. `ensureFunctionPlot` (lib/runtime/index.js) now loads the
 * library from beside the runtime's own `<script src>`. These arms drive the BUILT runtime in
 * Chromium, loaded by `src` the way the Studio frame loads it, in a page that carries a
 * function-plot placeholder:
 *   · the sibling is there → the plot draws, and gets its viewBox;
 *   · the sibling is missing → the author gets their config as text, marked settled,
 *     never an empty stage (the #2092 rule Mermaid follows);
 *   · the config throws → the error is marked settled, and the page goes QUIET. Before this
 *     change the inflater rewrote the error text on every mutation, which re-triggered it.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { ROOT } = require('../../helpers/render');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome');
const { toBase64 } = require('../../../lib/core/base64-utf8');

const chrome = resolveChrome();
const RUNTIME = path.join(ROOT, 'dist', 'lattice-runtime.js');
const FUNCTION_PLOT = require.resolve('function-plot/dist/function-plot.js', { paths: [ROOT] });
const CONFIG = JSON.stringify({ data: [{ fn: 'x^2' }], yAxis: { label: 'x²' } });

let browser;
before(async () => {
  if (!chrome) return;
  browser = await require('puppeteer').launch({ executablePath: chrome, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });

async function probe({ sibling, config = CONFIG }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-fp-load-'));
  try {
    fs.copyFileSync(RUNTIME, path.join(dir, 'lattice-runtime.js'));
    if (sibling) fs.copyFileSync(FUNCTION_PLOT, path.join(dir, 'function-plot.js'));
    fs.writeFileSync(path.join(dir, 'index.html'),
      '<!doctype html><html><head><meta charset="utf-8"></head><body>' +
      `<section data-lattice-slide="1"><div class="functionplot" data-fp-config="${toBase64(config)}" style="width:480px;height:320px"></div></section>` +
      '<script src="lattice-runtime.js"></script></body></html>');
    const page = await browser.newPage();
    try {
      await page.goto(`file://${path.join(dir, 'index.html')}`, { waitUntil: 'load' });
      await page.waitForFunction(() => {
        const d = document.querySelector('.functionplot');
        return d.dataset.fpInflated || d.dataset.fpState;
      }, { timeout: 15000 });
      // Count mutations to the PLOT over a second of idle: a settled plot makes none. Scoped to
      // the placeholder, because the runtime's other passes may touch the rest of the page.
      const mutations = await page.evaluate(() => new Promise((resolve) => {
        let n = 0;
        const mo = new MutationObserver((records) => { n += records.length; });
        mo.observe(document.querySelector('.functionplot'), { subtree: true, childList: true, characterData: true, attributes: true });
        setTimeout(() => { mo.disconnect(); resolve(n); }, 1000);
      }));
      const state = await page.evaluate(() => {
        const d = document.querySelector('.functionplot');
        const svg = d.querySelector('svg.function-plot');
        return {
          inflated: d.dataset.fpInflated || '', fpState: d.dataset.fpState || '',
          viewBox: svg ? svg.getAttribute('viewBox') : null,
          labels: [...d.querySelectorAll('text.axis-label')].map((t) => t.textContent),
          text: svg ? '' : d.textContent,
        };
      });
      return { ...state, mutations };
    } finally {
      await page.close();
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('with function-plot.js beside the runtime, the plot draws and gets its viewBox', { skip: skipWithoutChrome(chrome), timeout: 60000 }, async () => {
  const s = await probe({ sibling: true });
  assert.equal(s.inflated, '1');
  assert.ok(s.labels.includes('x²'), `labels: ${JSON.stringify(s.labels)}`);
  assert.match(s.viewBox || '', /^0 0 \d+(\.\d+)? \d+(\.\d+)?$/);
});

test('without it, the author gets their config as text, marked settled', { skip: skipWithoutChrome(chrome), timeout: 60000 }, async () => {
  const s = await probe({ sibling: false });
  assert.equal(s.fpState, 'unavailable');
  assert.equal(s.inflated, '');
  assert.ok(s.text.includes('"label":"x²"'), `text: ${s.text}`);
  assert.equal(s.mutations, 0, `a released plot must not keep rewriting itself (${s.mutations} mutation(s) in 1s)`);
});

test('a config that throws is marked settled, and the page goes quiet', { skip: skipWithoutChrome(chrome), timeout: 60000 }, async () => {
  const s = await probe({ sibling: true, config: '{"data":[{"fn":"x^^("}]}' });
  assert.equal(s.inflated, 'error');
  assert.equal(s.mutations, 0, `the error text was rewritten ${s.mutations} time(s) in 1s`);
});
