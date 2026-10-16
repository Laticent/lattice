/**
 * Integration: A DRAWN DIAGRAM THAT ANOTHER SCRIPT TAKES OUT COMES BACK.
 *
 * VS Code's built-in `mermaid-markdown-features` extension (VS Code 1.142.0 desktop,
 * code-server 4.141.0) injects a script into every Markdown preview. Each of its passes
 * opens with
 *
 *     for (const svg of document.querySelectorAll(".mermaid > svg")) svg.remove();
 *
 * on load, after an async library setup, and again on every
 * `vscode.markdown.updateContent`. Our render target is a `<div class="mermaid">`, so when
 * that setup finished after the runtime had drawn, every diagram in an Export-to-Marp
 * bundle vanished while its fence still read `rendered`. CSS kept the source hidden and
 * nothing redrew it. Traced on code-server + marp-vscode 3.6.1 at Disable
 * (engineering/gotchas/vscode.md).
 *
 * WHY THIS TIER. The fix lives in the Mermaid pass's mutation handler
 * (`restoreStrippedDiagrams`, lib/plugins/mermaid/mermaid.hydrate.js), and it is only true
 * if the shipped runtime, a real Mermaid render and a real MutationObserver agree. The
 * document is assembled the way the bundle's deck is: the Mermaid tag first, then the
 * runtime, over a real HTTP origin. The strip is the extension's own line, run in the page.
 *
 * THE ARM THAT FAILS: on the runtime before the fix, cell 1 reads 0 SVGs after the strip,
 * with the fence still `rendered`.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { resolveChrome, skipWithoutChrome } = require('../../helpers/chrome.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const CHROME = resolveChrome();
const TIMEOUT = 180000;

const DECK = [
  '---', 'theme: indaco', '---', '',
  '<!-- _class: diagram -->', '',
  '## First', '',
  '```mermaid', 'flowchart LR', '  A["Web App"] -->|calls| B["API"]', '```', '',
  '---', '',
  '<!-- _class: diagram -->', '',
  '## Second', '',
  '```mermaid', 'flowchart TB', '  C["core"] --> D["runtime"]', '```', '',
].join('\n');

/** The line VS Code's mermaid-markdown-features preview script opens every pass with. */
const HOST_STRIP = 'for (const svg of document.querySelectorAll(".mermaid > svg")) svg.remove();';

async function withDeckPage(fn) {
  const puppeteer = require('puppeteer');
  const engine = require('../../../lib/engine');
  const { composeCss } = require('../../../lib/engine/css.js');
  const { fontFaceCss } = require('../../../lib/fonts/face-css.js');

  const out = engine.render(DECK, 'indaco', { preview: true });
  const css = composeCss({
    themeCss: fs.readFileSync(path.join(ROOT, 'themes', 'indaco', 'indaco.css'), 'utf8'),
    baseLatticeCss: fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8'),
    sizeName: out.sizeName,
  });
  const doc = '<!doctype html><html><head><style>'
    + fontFaceCss(ROOT) + css + '\n.lattice>section{width:1280px;height:720px}'
    + '</style></head><body>'
    + `<article class="lattice">${out.html}</article>`
    + '<scr' + 'ipt src="mermaid.js"></scr' + 'ipt>'
    + '<scr' + 'ipt src="lattice-runtime.js"></scr' + 'ipt>'
    + '</body></html>';
  const runtimeJs = fs.readFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'));
  const mermaidJs = fs.readFileSync(path.join(ROOT, 'node_modules', 'mermaid', 'dist', 'mermaid.js'));
  const server = http.createServer((req, res) => {
    if (req.url.endsWith('/lattice-runtime.js')) { res.writeHead(200, { 'content-type': 'application/javascript' }); res.end(runtimeJs); return; }
    if (req.url.endsWith('/mermaid.js')) { res.writeHead(200, { 'content-type': 'application/javascript' }); res.end(mermaidJs); return; }
    if (req.url.endsWith('/mermaid.min.js')) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(doc);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: CHROME || undefined, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.querySelectorAll('pre[data-lattice-settle="rendered"]').length === 2
        && document.querySelectorAll('.mermaid > svg').length === 2,
      { timeout: 30000 },
    );
    return await fn(page);
  } finally {
    await browser.close();
    server.close();
  }
}

/** Strip the way the host does, then read the page back after the runtime has had its turn. */
async function stripAndRead(page) {
  await page.evaluate(HOST_STRIP);
  // The restore runs in the mutation microtask; the fallback re-render in the debounced pass.
  // A second later is past both.
  await new Promise((r) => { setTimeout(r, 1000); });
  return page.evaluate(() => ({
    svgs: document.querySelectorAll('.mermaid > svg').length,
    states: [...document.querySelectorAll('pre[data-lattice-settle]')].map((p) => p.getAttribute('data-lattice-settle')),
    widths: [...document.querySelectorAll('.mermaid > svg')].map((s) => Math.round(s.getBoundingClientRect().width)),
  }));
}

describe('a diagram the host strips out is drawn again', { skip: skipWithoutChrome(CHROME) }, () => {
  test('one strip: both diagrams come back, fences still `rendered`', { timeout: TIMEOUT }, async () => {
    const read = await withDeckPage(stripAndRead);
    assert.equal(read.svgs, 2, `both SVGs are back after the host's strip (read: ${JSON.stringify(read)})`);
    assert.deepEqual(read.states, ['rendered', 'rendered']);
    for (const w of read.widths) assert.ok(w > 0, `a restored diagram has a real width (${w})`);
  });

  test('the host strips on EVERY preview update; each strip is answered', { timeout: TIMEOUT }, async () => {
    const reads = await withDeckPage(async (page) => [await stripAndRead(page), await stripAndRead(page), await stripAndRead(page)]);
    for (const [i, read] of reads.entries()) {
      assert.equal(read.svgs, 2, `strip ${i + 1}: both SVGs are back (read: ${JSON.stringify(read)})`);
    }
  });
});
