/**
 * Integration: the sandboxed DRAW FRAME the previews will draw Mermaid and function-plot in (owner decision D1 A,
 * 2026-10-20; lib/packages/draw-frame-core.mjs, docs/src/lib/code-packages/draw-host.ts), with the real vendored libraries
 * in a real Chromium.
 *
 *   DRAW      both kinds come back as SVG text; the plot is byte-identical to the one the CLI's locked page draws
 *             (HARD RULE #1: the frame runs function-plot's own `hydrate`), and a bad config is the error text.
 *   WALL      the parent cannot read the frame (opaque origin); only function-plot's policy allows `'unsafe-eval'`; a script
 *             that is not the one the policy names does not run; a frame answers only its own kind.
 *   REPLY     the host's check of a frame's message accepts a drawing and nothing else.
 *
 * Needs Chromium.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { launchSandboxBrowser } = require('../../../lib/core/code-sandbox.js');
const { drawLocked } = require('../../../lib/export/locked-figures.js');

const ROOT = path.join(__dirname, '../../..');
const CHROME = process.env.CHROME_PATH || undefined;
const TIMEOUT = 300000;
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

let core;
const kernel = async () => (core ??= await import('../../../lib/packages/draw-frame-core.mjs'));

async function frameHtml(kind, { tamper = false } = {}) {
  const k = await kernel();
  const library = fs.readFileSync(path.join(ROOT, kind === 'mermaid' ? 'lib/plugins/mermaid/vendor/mermaid.min.js' : 'lib/plugins/function-plot/vendor/function-plot.js'), 'utf8');
  const hydrateSource = kind === 'function-plot' ? require('../../../lib/plugins/function-plot/function-plot.hydrate.js').hydrate.toString() : undefined;
  const script = k.drawFrameScript({ kind, library, hydrateSource });
  const hash = crypto.createHash('sha256').update(script).digest('base64');
  // `tamper` changes the script AFTER it was hashed: the policy must refuse it.
  return k.drawFrameDocument({ kind, script: tamper ? `${script}\n;window.__ran=1` : script, hash });
}

/** Run `body(open)` in a page, where `open(html)` makes a sandboxed frame and answers `{ ready, draw(job, ms) }`. */
async function inPage(browser, html, job, opts = {}) {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  try {
    return await page.evaluate(
      async (html, job, opts) => {
        const frame = document.createElement('iframe');
        frame.setAttribute('sandbox', 'allow-scripts');
        frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1200px;height:900px;border:0;visibility:hidden';
        const wait = (ms) => new Promise((r) => setTimeout(r, ms));
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
        const ready = next((d) => d && d.t === 'ready', opts.readyMs || 20000);
        frame.srcdoc = html;
        document.body.appendChild(frame);
        const isReady = !!(await ready);
        // A cross-origin frame's `contentDocument` is null, and reading into its window throws.
        let parentAccess = frame.contentDocument === null ? 'blocked' : 'open';
        try {
          void frame.contentWindow.document.body;
          parentAccess = 'open';
        } catch (e) {
          /* blocked, as it must be */
        }
        const out = { ready: isReady, parentAccess, replies: [] };
        if (isReady) {
          for (const j of Array.isArray(job) ? job : [job]) {
            const id = out.replies.length + 1;
            const got = next((d) => d && d.t === 'result' && d.id === id, opts.drawMs || 15000);
            frame.contentWindow.postMessage({ t: 'draw', id, ...j }, '*');
            out.replies.push(await got);
          }
        }
        out.ran = await (async () => {
          await wait(10);
          return null;
        })();
        frame.remove();
        return out;
      },
      html,
      job,
      opts,
    );
  } finally {
    await page.close();
  }
}

const open = () => launchSandboxBrowser(puppeteer, { headless: true, executablePath: CHROME, args: ['--no-sandbox'] });

test('DRAW: Mermaid and function-plot come back as SVG; the plot is the CLI locked page\'s, byte for byte; a bad config is its error text', { timeout: TIMEOUT }, async () => {
  const browser = await open();
  try {
    const cfg = '{ "data": [{ "fn": "x^2" }] }';
    const mer = await inPage(browser, await frameHtml('mermaid'), [
      { kind: 'mermaid', svgId: 'dg-0', definition: 'flowchart LR\n  A[Draft] --> B{Review}\n  B -->|ok| C[Ship]', config: { startOnLoad: false, theme: 'base', securityLevel: 'strict' } },
      { kind: 'mermaid', svgId: 'dg-1', definition: 'this is not a diagram ->>', config: { startOnLoad: false } },
    ]);
    assert.equal(mer.ready, true);
    assert.match(mer.replies[0].out, /^<svg [^>]*id="dg-0"/);
    assert.match(mer.replies[0].out, /Draft/);
    assert.ok(mer.replies[1].error, 'a definition Mermaid refuses is an error, not an empty drawing');

    const plot = await inPage(browser, await frameHtml('function-plot'), [
      { kind: 'function-plot', configB64: b64(cfg), configText: cfg, width: 600, height: 300, index: 0 },
      { kind: 'function-plot', configB64: b64('{ not json'), configText: '{ not json', width: 600, height: 300, index: 0 },
    ]);
    assert.equal(plot.ready, true);
    assert.match(plot.replies[0].out, /^<svg class="function-plot"[^>]*width="600" height="300" viewBox="0 0 600 300"/);
    assert.match(plot.replies[1].error, /^functionplot error: /);
    // THE SAME DRAWING as the CLI's capture page (it runs the same `hydrate` in a locked page).
    const [cli] = await drawLocked(puppeteer, [{ config: b64(cfg), w: 600, h: 300 }], { executablePath: CHROME });
    assert.equal(plot.replies[0].out, cli.html);
  } finally {
    await browser.close();
  }
});

test('WALL: the parent cannot read a frame; only the plot frame\'s policy allows eval; an altered script does not run; a frame answers only its own kind', { timeout: TIMEOUT }, async () => {
  const k = await kernel();
  assert.doesNotMatch(k.drawFrameCsp('x'.repeat(43), { evalOk: false }), /unsafe-eval/);
  assert.match(k.drawFrameCsp('x'.repeat(43), { evalOk: true }), /script-src 'sha256-x+' 'unsafe-eval';/);
  for (const policy of [k.drawFrameCsp('x'.repeat(43)), k.drawFrameCsp('x'.repeat(43), { evalOk: true })]) {
    for (const part of ["default-src 'none'", "connect-src 'none'", "frame-src 'none'", "worker-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(policy.includes(part), part);
  }
  assert.equal(k.DRAW_KINDS.mermaid.evalOk, false);
  assert.equal(k.DRAW_KINDS['function-plot'].evalOk, true);
  const browser = await open();
  try {
    const plot = await frameHtml('function-plot');
    assert.match(plot, /'unsafe-eval'/);
    assert.doesNotMatch(await frameHtml('mermaid'), /unsafe-eval/);
    const real = await inPage(browser, plot, [{ kind: 'mermaid', svgId: 'x', definition: 'flowchart LR\n A-->B', config: {} }], { drawMs: 1500 });
    assert.equal(real.parentAccess, 'blocked', 'the frame has an opaque origin: the parent cannot read it');
    assert.equal(real.replies[0], null, 'a plot frame ignores a Mermaid draw');
    const altered = await inPage(browser, await frameHtml('function-plot', { tamper: true }), [], { readyMs: 4000 });
    assert.equal(altered.ready, false, 'a script that is not the one the policy names does not run');
  } finally {
    await browser.close();
  }
});

test('REPLY: the host accepts a drawing and nothing else', async () => {
  const { checkDrawReply, MAX_DRAW_CHARS } = await kernel();
  assert.deepEqual(checkDrawReply({ t: 'ready' }), { ready: true });
  assert.deepEqual(checkDrawReply({ t: 'result', id: 3, out: '<svg/>' }), { id: 3, out: '<svg/>' });
  assert.deepEqual(checkDrawReply({ t: 'result', id: 3, error: 'no' }), { id: 3, error: 'no' });
  for (const stray of [null, 'x', 4, {}, { t: 'result' }, { t: 'result', id: '3', out: 'x' }, { t: 'other', id: 1, out: 'x' }, { id: 1, out: 'x' }]) assert.deepEqual(checkDrawReply(stray), { ignore: true }, JSON.stringify(stray));
  assert.match(checkDrawReply({ t: 'result', id: 1, out: 7 }).error, /not text/);
  assert.match(checkDrawReply({ t: 'result', id: 1, out: null }).error, /null/);
  assert.match(checkDrawReply({ t: 'result', id: 1, out: 'x'.repeat(MAX_DRAW_CHARS + 1) }).error, /past the/);
  assert.equal(checkDrawReply({ t: 'result', id: 1, error: 'e'.repeat(1000) }).error.length, 300);
});
