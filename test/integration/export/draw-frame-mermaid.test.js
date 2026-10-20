/**
 * Integration: Mermaid through the sandboxed DRAW FRAME and the DIAGRAM sanitizer (owner decision D1 A, 2026-10-20;
 * lib/packages/draw-frame-core.mjs, lib/core/sanitize-diagram-svg.mjs), with the real vendored library in a real Chromium.
 *
 *   CORPUS     every diagram in the 32-diagram system-design deck and the plugin's fixtures draws in the frame
 *   SANITIZE   the diagram sanitizer leaves each of those figures as it came (parsed and serialized, so the
 *              comparison is the DOM's, not a spelling's); it must lose NO node, attribute or style rule
 *   HOSTILE    what a hostile frame could say is taken out: a script, a handler, an `@import`, a `</style` terminator
 *
 * Needs Chromium.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const esbuild = require('esbuild');
const { launchSandboxBrowser } = require('../../../lib/core/code-sandbox.js');

const ROOT = path.join(__dirname, '../../..');
const CHROME = process.env.CHROME_PATH || undefined;
const TIMEOUT = 600000;

const fences = (file) => [...fs.readFileSync(path.join(ROOT, file), 'utf8').matchAll(/^```mermaid\n([\s\S]*?)^```/gm)].map((m) => m[1]);
const CORPUS = [...fences('examples/system-design-foundations.md'), ...fences('lib/plugins/mermaid/mermaid.fixtures.md'), ...fences('lib/components/diagram/diagram.gallery.md')];

const sanitizerBundle = () =>
  esbuild.buildSync({ entryPoints: [path.join(ROOT, 'lib/core/sanitize-diagram-svg.mjs')], bundle: true, format: 'iife', globalName: 'DiagramSan', write: false }).outputFiles[0].text;

async function frameHtml() {
  const k = await import('../../../lib/packages/draw-frame-core.mjs');
  const library = fs.readFileSync(path.join(ROOT, 'lib/plugins/mermaid/vendor/mermaid.min.js'), 'utf8');
  const script = k.drawFrameScript({ kind: 'mermaid', library });
  return k.drawFrameDocument({ kind: 'mermaid', script, hash: crypto.createHash('sha256').update(script).digest('base64') });
}

/** Draw every definition in one sandboxed frame; answers each reply (`{ out }` or `{ error }`). */
async function drawAll(browser, definitions, config) {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  try {
    return await page.evaluate(
      async (html, defs, config) => {
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
        const ready = next((d) => d && d.t === 'ready', 30000);
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
      await frameHtml(),
      definitions,
      config,
    );
  } finally {
    await page.close();
  }
}

const open = () => launchSandboxBrowser(puppeteer, { headless: true, executablePath: CHROME, args: ['--no-sandbox'] });
const CONFIG = { startOnLoad: false, theme: 'base', securityLevel: 'strict', suppressErrorRendering: true };

test('CORPUS + SANITIZE: every diagram draws in the frame, and the diagram sanitizer keeps all of it', { timeout: TIMEOUT }, async () => {
  assert.ok(CORPUS.length >= 35, `the corpus has ${CORPUS.length} diagrams`);
  const browser = await open();
  try {
    const { ready, replies } = await drawAll(browser, CORPUS, CONFIG);
    assert.equal(ready, true);
    const figures = [];
    for (const [i, r] of replies.entries()) {
      assert.ok(r && typeof r.out === 'string', `diagram ${i} drew: ${JSON.stringify(r?.error)}\n${CORPUS[i].slice(0, 120)}`);
      const f = JSON.parse(r.out);
      assert.match(f.svg, /^<svg[\s>]/, `diagram ${i} is an svg`);
      figures.push(f.svg);
    }
    // The comparison is not vacuous: the figures carry the two things the slide sanitizer would have deleted.
    assert.ok(figures.some((f) => f.includes('<foreignObject')), 'the corpus holds HTML labels');
    assert.ok(figures.some((f) => f.includes('<style')), 'the corpus holds scoped sheets');
    const page = await browser.newPage();
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({ path: path.join(ROOT, 'docs/node_modules/dompurify/dist/purify.js') });
    await page.addScriptTag({ content: sanitizerBundle() });
    const diffs = await page.evaluate((figures) => {
      const sanitize = DiagramSan.createDiagramSanitizer(window.DOMPurify, window);
      const norm = (html) => {
        const d = document.createElement('div');
        d.innerHTML = html;
        return d.innerHTML;
      };
      return figures.map((svg, i) => ({ i, a: norm(svg), b: norm(sanitize(svg)) })).filter((x) => x.a !== x.b).map((x) => {
        let k = 0;
        while (k < x.a.length && x.a[k] === x.b[k]) k++;
        return { i: x.i, at: k, raw: x.a.slice(Math.max(0, k - 80), k + 120), clean: x.b.slice(Math.max(0, k - 80), k + 120) };
      });
    }, figures);
    await page.close();
    assert.deepEqual(diffs, [], `the sanitizer changed ${diffs.length} of ${figures.length} diagrams:\n${JSON.stringify(diffs.slice(0, 3), null, 1)}`);
  } finally {
    await browser.close();
  }
});

test('HOSTILE: what a hostile frame could say is taken out, and the labels and sheets stay', { timeout: TIMEOUT }, async () => {
  const browser = await open();
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({ path: path.join(ROOT, 'docs/node_modules/dompurify/dist/purify.js') });
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
