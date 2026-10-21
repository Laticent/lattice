/**
 * Integration: Mermaid through the sandboxed MODULE-LOADED draw frame and the DIAGRAM sanitizer (owner decision D1 A, 2026-10-20;
 * lib/packages/draw-frame-core.mjs, lib/core/sanitize-diagram-svg.mjs), with the real vendored ES modules served over HTTP to a real Chromium,
 * the way the Studio serves them.
 *
 *   CORPUS     every diagram in the 32-diagram system-design deck, the plugin's fixtures and the diagram gallery draws in the frame
 *   PARITY     the module-loaded frame draws the same svg text, byte for byte, as the inline frame that ran the single-file bundle
 *   SANITIZE   the diagram sanitizer leaves each of those figures as it came (parsed and serialized, so the comparison is the DOM's,
 *              not a spelling's); it must lose NO node, attribute or style rule
 *   TAMPER     one module changed after its integrity was written: a browser that enforces the import map refuses it, and the frame never starts
 *   WALL       a module outside the one directory the policy names does not load
 *   HOSTILE    what a hostile frame could say is taken out: a script, a handler, an `@import`, a `</style` terminator
 *
 * Needs Chromium.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const puppeteer = require('puppeteer');
const esbuild = require('esbuild');

const ROOT = path.join(__dirname, '../../..');
const CHROME = process.env.CHROME_PATH || undefined;
const TIMEOUT = 600000;
const VENDOR_ESM = path.join(ROOT, 'lib/plugins/mermaid/vendor/esm');

const fences = (file) => [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/^```mermaid\n([\s\S]*?)^```/gm)].map((m) => m[1]);
const CORPUS = [...fences('examples/system-design-foundations.md'), ...fences('lib/plugins/mermaid/mermaid.fixtures.md'), ...fences('lib/components/diagram/diagram.gallery.md')];

const sanitizerBundle = () =>
  esbuild.buildSync({ entryPoints: [path.join(ROOT, 'lib/core/sanitize-diagram-svg.mjs')], bundle: true, format: 'iife', globalName: 'DiagramSan', write: false }).outputFiles[0].text;

const sha = (text) => crypto.createHash('sha256').update(text).digest('base64');
let kernel;
let registry;
const load = async () => {
  kernel ??= await import('../../../lib/packages/draw-frame-core.mjs');
  registry ??= (await import('../../../lib/plugins/draw-frame-libraries.generated.mjs')).DRAW_FRAME_LIBRARIES.mermaid.esm;
};

/** The single-file bundle in an inline frame: the baseline the module-loaded frame must draw the same as. */
async function inlineFrameHtml() {
  await load();
  const library = fs.readFileSync(path.join(ROOT, 'lib/plugins/mermaid/vendor/mermaid.min.js'), 'utf8');
  const script = kernel.drawFrameScript({ kind: 'mermaid', library });
  return kernel.drawFrameDocument({ kind: 'mermaid', script, hash: sha(script) });
}

/**
 * A server for the vendored modules, as the Studio serves them: CORS open (a sandboxed frame's origin is opaque), nothing cached.
 * `tamper` appends code to one chunk; `/outside/other.mjs` is a module OUTSIDE the directory the frame's policy names, and `hits.outside`
 * counts the times anything asked for it.
 */
async function serve({ tamper = false } = {}) {
  const hits = { outside: 0, tampered: 0 };
  const server = http.createServer((req, res) => {
    const url = req.url.split('?')[0];
    const headers = { 'content-type': 'text/javascript', 'access-control-allow-origin': '*', 'cache-control': 'no-store' };
    if (url === '/parent.html') {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<!doctype html><body></body>');
    }
    if (url === '/outside/other.mjs') {
      hits.outside++;
      res.writeHead(200, headers);
      return res.end('globalThis.__outside = 1; export default {};');
    }
    const rel = url.replace(/^\/frames\/mermaid\//, '');
    const file = path.join(VENDOR_ESM, rel);
    if (url.startsWith('/frames/mermaid/') && file.startsWith(VENDOR_ESM) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      const text = fs.readFileSync(file, 'utf8');
      if (tamper && rel.startsWith('chunks/') && !hits.tampered) {
        hits.tampered++;
        res.writeHead(200, headers);
        return res.end(`${text}\n;globalThis.__tampered = 1;`);
      }
      res.writeHead(200, headers);
      return res.end(text);
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const origin = `http://localhost:${server.address().port}`;
  return { origin, base: `${origin}/frames/mermaid/`, hits, close: () => server.close() };
}

/** The module-loaded frame's document, built by the kernel the way the Studio's host builds it. `boot` overrides the boot module. */
async function esmFrameHtml(base, { boot: bootText } = {}) {
  await load();
  const scripts = kernel.drawFrameEsmScripts({ kind: 'mermaid', base, entry: registry.entry, integrity: registry.integrity });
  const boot = bootText ?? scripts.boot;
  return kernel.drawFrameEsmDocument({ kind: 'mermaid', base, entry: registry.entry, integrity: registry.integrity, boot, importMap: scripts.importMap, bootHash: sha(boot), mapHash: sha(scripts.importMap), preload: registry.preload });
}

/** Draw every definition in one sandboxed frame; answers `{ ready, replies }`, each reply `{ out }` or `{ error }`. */
async function drawAll(browser, parentUrl, html, definitions, config, { readyMs = 30000 } = {}) {
  const page = await browser.newPage();
  if (parentUrl) await page.goto(parentUrl);
  else await page.setContent('<!doctype html><body></body>');
  try {
    return await page.evaluate(
      async (html, defs, config, readyMs) => {
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0;visibility:hidden';
        const next = (pred, ms) =>
          new Promise((resolve) => {
            const t = setTimeout(() => resolve(null), ms);
            const f = (e) => {
              if (e.source !== frame.contentWindow || !pred(e.data)) return;
              clearTimeout(t);
              removeEventListener('message', f);
              resolve(e.data);
            };
            addEventListener('message', f);
          });
        const ready = next((d) => d && d.t === 'ready', readyMs);
        frame.srcdoc = html;
        document.body.appendChild(frame);
        if (!(await ready)) return { ready: false, replies: [] };
        const replies = [];
        for (const [i, definition] of defs.entries()) {
          const id = i + 1;
          const got = next((d) => d && d.t === 'result' && d.id === id, 30000);
          frame.contentWindow.postMessage({ t: 'draw', id, kind: 'mermaid', svgId: `dg-${i}`, definition, config }, '*');
          replies.push(await got);
        }
        frame.remove();
        return { ready: true, replies };
      },
      html,
      definitions,
      config,
      readyMs,
    );
  } finally {
    await page.close();
  }
}

// A plain Chromium: the module server is on localhost, which the CLI's locked browser (`launchSandboxBrowser`, a dead proxy by design) cannot reach.
const open = () => puppeteer.launch({ headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
// `handDrawnSeed` is the engine's own (lib/plugins/mermaid/shared/init-directive.js): without a seed rough.js jitters every shape's outline differently
// on every draw, and no two draws of the same diagram would be equal, packaging or not.
const CONFIG = { startOnLoad: false, theme: 'base', securityLevel: 'strict', suppressErrorRendering: true, handDrawnSeed: 1 };

const figuresOf = (replies, label) =>
  replies.map((r, i) => {
    assert.ok(r && typeof r.out === 'string', `${label}: diagram ${i} drew: ${JSON.stringify(r?.error)}\n${CORPUS[i].slice(0, 120)}`);
    return r.out;
  });

test('CORPUS + SANITIZE: every diagram draws in the module-loaded frame, and the diagram sanitizer keeps all of it', { timeout: TIMEOUT }, async () => {
  assert.ok(CORPUS.length >= 35, `the corpus has ${CORPUS.length} diagrams`);
  const server = await serve();
  const browser = await open();
  try {
    const { ready, replies } = await drawAll(browser, `${server.origin}/parent.html`, await esmFrameHtml(server.base), CORPUS, CONFIG);
    assert.equal(ready, true, 'the frame started');
    const figures = figuresOf(replies, 'esm').map((out) => JSON.parse(out).svg);
    for (const [i, svg] of figures.entries()) assert.match(svg, /^<svg[\s>]/, `diagram ${i} is an svg`);
    // The comparison is not vacuous: the figures carry the two things the slide sanitizer would have deleted.
    assert.ok(figures.some((f) => f.includes('<foreignObject')), 'the corpus holds HTML labels');
    assert.ok(figures.some((f) => f.includes('<style')), 'the corpus holds scoped sheets');
    const page = await browser.newPage();
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({ path: require.resolve('dompurify/dist/purify.js') });
    await page.addScriptTag({ content: sanitizerBundle() });
    const diffs = await page.evaluate((figures) => {
      const sanitize = DiagramSan.createDiagramSanitizer(window.DOMPurify, window);
      const norm = (html) => {
        const d = document.createElement('div');
        d.innerHTML = html;
        return d.innerHTML;
      };
      return figures
        .map((svg, i) => ({ i, a: norm(svg), b: norm(sanitize(svg)) }))
        .filter((x) => x.a !== x.b)
        .map((x) => {
          let k = 0;
          while (k < x.a.length && x.a[k] === x.b[k]) k++;
          return { i: x.i, at: k, raw: x.a.slice(Math.max(0, k - 80), k + 120), clean: x.b.slice(Math.max(0, k - 80), k + 120) };
        });
    }, figures);
    await page.close();
    assert.deepEqual(diffs, [], `the sanitizer changed ${diffs.length} of ${figures.length} diagrams:\n${JSON.stringify(diffs.slice(0, 3), null, 1)}`);
  } finally {
    await browser.close();
    server.close();
  }
});

test('PARITY: the module-loaded frame answers exactly what the single-file bundle answers, for every diagram', { timeout: TIMEOUT }, async () => {
  const server = await serve();
  const browser = await open();
  try {
    const esm = await drawAll(browser, `${server.origin}/parent.html`, await esmFrameHtml(server.base), CORPUS, CONFIG);
    const inline = await drawAll(browser, null, await inlineFrameHtml(), CORPUS, CONFIG);
    assert.equal(esm.ready && inline.ready, true);
    // Two things differ between ANY two draws of a diagram, packaging aside, and are set aside here with their reasons:
    //   - random identifiers: Iconify gives each icon an id from Math.random, and gitGraph hashes a random number into each commit's id;
    //   - a label that holds an <img>: the node's height depends on when the (here broken) image's layout settles, so it moves between draws.
    const normalize = (out) => out.replace(/IconifyId[0-9a-f]+/g, 'IconifyId#').replace(/\b(\d+)-[0-9a-f]{7}\b/g, '$1-#######');
    const compared = CORPUS.map((_, i) => i).filter((i) => !/<img/i.test(CORPUS[i]));
    assert.ok(compared.length >= 44, `${compared.length} diagrams compared`);
    const a = figuresOf(esm.replies, 'esm').map(normalize);
    const b = figuresOf(inline.replies, 'inline').map(normalize);
    const different = compared.filter((i) => a[i] !== b[i]);
    const where = (i) => {
      let k = 0;
      while (k < a[i].length && a[i][k] === b[i][k]) k++;
      return `#${i} at ${k}: esm ${JSON.stringify(a[i].slice(Math.max(0, k - 60), k + 100))} | inline ${JSON.stringify(b[i].slice(Math.max(0, k - 60), k + 100))}`;
    };
    assert.deepEqual(different, [], `diagrams that differ between the two packagings: ${different.join(', ')}\n${different.slice(0, 3).map(where).join('\n')}`);
  } finally {
    await browser.close();
    server.close();
  }
});

test('TAMPER: one module changed after its integrity was written is refused, and the frame never starts', { timeout: TIMEOUT }, async () => {
  const server = await serve({ tamper: true });
  const browser = await open();
  try {
    const { ready } = await drawAll(browser, `${server.origin}/parent.html`, await esmFrameHtml(server.base), ['flowchart LR\n A-->B'], CONFIG, { readyMs: 8000 });
    assert.equal(server.hits.tampered, 1, "the changed chunk was served, so the refusal is the browser's");
    assert.equal(ready, false, 'a module whose bytes do not match its integrity does not run');
  } finally {
    await browser.close();
    server.close();
  }
});

test('WALL: the policy names one directory and no eval, and a module outside it is never requested', { timeout: TIMEOUT }, async () => {
  await load();
  const server = await serve();
  const browser = await open();
  try {
    const html = await esmFrameHtml(server.base);
    const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
    assert.ok(csp.includes("script-src 'sha256-") && csp.includes(` ${server.base};`), 'scripts: two hashes and the one directory');
    assert.doesNotMatch(csp, /unsafe-eval|'self'|\*/, 'no eval, no whole-site allowance, no wildcard');
    assert.match(csp, /connect-src 'none'/);
    // A boot module that asks for a module outside the directory, with the right hash for itself: only the policy can stop it.
    const { importMap } = kernel.drawFrameEsmScripts({ kind: 'mermaid', base: server.base, entry: registry.entry, integrity: registry.integrity });
    const rogue = `import("${server.origin}/outside/other.mjs").then(()=>parent.postMessage({t:"ready"},"*"),()=>{});`;
    const doc = kernel.drawFrameEsmDocument({ kind: 'mermaid', base: server.base, entry: registry.entry, integrity: registry.integrity, boot: rogue, importMap, bootHash: sha(rogue), mapHash: sha(importMap), preload: [] });
    const { ready } = await drawAll(browser, `${server.origin}/parent.html`, doc, ['flowchart LR\n A-->B'], CONFIG, { readyMs: 4000 });
    assert.equal(ready, false, 'the rogue module did not load');
    assert.equal(server.hits.outside, 0, 'the browser did not even ask for it');
  } finally {
    await browser.close();
    server.close();
  }
});

test('HOSTILE: what a hostile frame could say is taken out, and the labels and sheets stay', { timeout: TIMEOUT }, async () => {
  const browser = await open();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({ path: require.resolve('dompurify/dist/purify.js') });
    await page.addScriptTag({ content: sanitizerBundle() });
    const out = await page.evaluate(() => {
      const sanitize = DiagramSan.createDiagramSanitizer(window.DOMPurify, window);
      const run = (svg) => sanitize(svg);
      return {
        script: run('<svg><script>window.__x=1</script><g onclick="window.__x=2"><rect/></g></svg>'),
        label: run('<svg><foreignObject><div xmlns="http://www.w3.org/1999/xhtml" class="lbl">hi<br/></div><iframe src="about:blank"></iframe></foreignObject></svg>'),
        sheet: run('<svg><style>@import url(http://evil.example/x.css); .a{fill:red}</style><rect class="a"/></svg>'),
        terminator: run('<svg><style>/* </style><img src=x onerror="window.__x=3"> */ .a{fill:red}</style></svg>'),
        href: run('<svg><a href="javascript:window.__x=4"><text>t</text></a></svg>'),
      };
    });
    assert.doesNotMatch(out.script, /<script|onclick/i);
    assert.match(out.label, /<foreignObject/);
    assert.match(out.label, /class="lbl"/);
    assert.doesNotMatch(out.label, /<iframe/i);
    assert.match(out.sheet, /fill:\s*red/);
    assert.doesNotMatch(out.sheet, /@import|evil\.example/);
    assert.doesNotMatch(out.terminator, /onerror/i);
    assert.doesNotMatch(out.href, /javascript:/i);
  } finally {
    await browser.close();
  }
});
