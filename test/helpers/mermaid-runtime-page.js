/**
 * A deck served the way the Export-to-Marp bundle serves it: the engine's HTML, the Mermaid
 * tag first, then the shipped runtime, over a real HTTP origin. For Chromium tests that need
 * the real runtime, a real Mermaid render and a real MutationObserver to agree.
 *
 * `withRuntimeDeckPage(deck, diagrams, fn)` waits until `diagrams` fences read `rendered` with
 * an SVG each, then calls `fn(page)`. The engine's untouched HTML rides on the page as
 * `window.__deckHtml`, so a test can swap it back into `article.lattice` the way the Studio
 * preview does on every keystroke.
 */

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { resolveChrome } = require('./chrome.js');

const ROOT = path.join(__dirname, '..', '..');

async function withRuntimeDeckPage(deck, diagrams, fn) {
  const puppeteer = require('puppeteer');
  const engine = require('../../lib/engine');
  const { composeCss } = require('../../lib/engine/css.js');
  const { fontFaceCss } = require('../../lib/fonts/face-css.js');

  const out = engine.render(deck, 'indaco', { preview: true });
  const css = composeCss({
    themeCss: fs.readFileSync(path.join(ROOT, 'themes', 'indaco', 'indaco.css'), 'utf8'),
    baseLatticeCss: fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8'),
    sizeName: out.sizeName,
  });
  const doc = '<!doctype html><html><head><style>'
    + fontFaceCss(ROOT) + css + '\n.lattice>section{width:1280px;height:720px}'
    + '</style></head><body>'
    + `<article class="lattice">${out.html}</article>`
    // JSON in a script element: escape `<` so no `</script>` in the deck can end it.
    + '<scr' + 'ipt>window.__deckHtml = ' + JSON.stringify(out.html).replace(/</g, '\\u003c') + ';</scr' + 'ipt>'
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
  const browser = await puppeteer.launch({ executablePath: resolveChrome() || undefined, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'load' });
    await page.waitForFunction(
      (n) => document.querySelectorAll('pre[data-lattice-settle="rendered"]').length === n
        && document.querySelectorAll('.mermaid > svg').length === n,
      { timeout: 30000 },
      diagrams,
    );
    return await fn(page);
  } finally {
    await browser.close();
    server.close();
  }
}

module.exports = { withRuntimeDeckPage };
