/**
 * lib/export/locked-figures.js — the CLI's DRAW HOST: a deferred figure in a captured export (the PDF, the PNG and PPTX
 * rasters, `--player`, `--read`) is drawn the way a live preview draws it, in a LOCKED PAGE running the plugin's own
 * draw-frame document (engineering/decisions/2026-11-06-plugin-patterns.md §3-§4; owner decisions 14 and 16, threat-model
 * note 2026-10-16 §6; 2026-10-19-first-party-plugins-in-the-sandbox.md). It names no plugin: the kinds are the plugins
 * whose manifest declares a `draw` section with an inlined library (lib/plugins/draw-frame-libraries.generated.mjs).
 *
 * ONE PATH FOR THE PREVIEW AND THE EXPORT. The capture page keeps each such plugin's real `hydrate`
 * (lib/plugins/hydrate-script.js `hostDrawn`), so the plugin builds its own draw job and calls `ctx.drawInto`, as it does
 * in the Studio. The page's draw host (`exportDrawHostScript`, installed before the page's scripts run) sends the job out
 * through one exposed function; Node draws it in the locked page with the plugin's ADAPTER, the one the Studio's draw
 * frame runs (lib/packages/draw-frame-core.mjs); the answer comes back, is SANITIZED in the capture page with the slide
 * sanitizer (`SANITIZER`), and the host writes it through its one sanctioned sink (`drawInto`, HARD RULE #22).
 *
 * THE LOCKED PAGE is a fresh browser context of the export's own capture browser (one browser per export, the owner's
 * speed rule): a synthetic origin that serves the draw-frame document and nothing else, every other request refused,
 * the document's own hash-pinned script policy (`'unsafe-eval'` only for a plugin that declares it). The library is
 * the vendored file, checked against its pinned SHA-256 before it is inlined. A drawing is remembered by job and pixel
 * ratio for the rest of the run, so an export that re-navigates (auto-split, rails) draws each figure once.
 *
 * WHAT THE ONE-BROWSER RULE GAVE UP: the capture browser runs without Chromium's OS sandbox (lattice.js `renderExport`
 * launches with `--no-sandbox`), so the locked page has no such layer under it; it keeps every other wall
 * (followups.d/2800-p2-capture-browser-os-sandbox.md).
 */
const fs = require('node:fs');
const crypto = require('node:crypto');
const { payloadPath } = require('../core/payload-path.js');
const { inlinePolicyImport } = require('../core/policy-page-script.js');
const { DRAW_FRAME_LIBRARIES } = require('../plugins/draw-frame-libraries.generated.mjs');
const { drawFrameScript, drawFrameDocument, checkDrawReply } = require('../packages/draw-frame-core.mjs');

/** The exposed function the capture page's draw host calls; one name per page. */
const DRAW_FN = '__latticeExportDraw';
const ORIGIN = 'https://draw.lattice.invalid';

/**
 * The page plugins this host draws: those whose manifest declares a draw frame with an INLINED library. A module-loaded
 * frame (Mermaid's) is not served here yet (D2 slice 3).
 * @param {Array<{name: string}>} plugins
 * @returns {string[]}
 */
function hostDrawnKinds(plugins) {
  return plugins.map((h) => h.name).filter((n) => Object.hasOwn(DRAW_FRAME_LIBRARIES, n) && !DRAW_FRAME_LIBRARIES[n].esm);
}

/** The draw-frame document for `kind`, its library read from the package and checked against its pin. */
function drawDocument(kind) {
  const meta = DRAW_FRAME_LIBRARIES[kind];
  const file = payloadPath(kind);
  if (!file || !fs.existsSync(file)) throw new Error(`the ${kind} library is missing from the package (${file})`);
  const library = fs.readFileSync(file, 'utf8');
  const digest = crypto.createHash('sha256').update(library).digest('hex');
  if (digest !== meta.sha256) throw new Error(`${meta.file} does not match its pin, so it is not run`);
  const script = drawFrameScript({ kind, library, meta });
  const hash = crypto.createHash('sha256').update(script).digest('base64');
  return drawFrameDocument({ kind, script, hash, meta });
}

/**
 * One locked page drawing `kind`: open, loaded, answering. `draw(job, deviceScaleFactor)` resolves `{ out }` or `{ error }`.
 * @returns {Promise<{ draw: (job: object, deviceScaleFactor?: number) => Promise<{out: string} | {error: string}>, close: () => Promise<void> }>}
 */
async function openDrawPage(browser, kind) {
  const body = drawDocument(kind);
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.isInterceptResolutionHandled()) return;
      if (req.url() === `${ORIGIN}/index.html`) return req.respond({ status: 200, contentType: 'text/html; charset=utf-8', body });
      return req.abort('blockedbyclient');
    });
    // The frame announces itself once (`{ t: 'ready' }`) as its script runs; keep that, and every result, where `draw` reads them.
    await page.evaluateOnNewDocument(() => {
      window.__replies = [];
      addEventListener('message', (e) => {
        if (e.data && (e.data.t === 'ready' || e.data.t === 'result')) window.__replies.push(e.data);
      });
    });
    await page.goto(`${ORIGIN}/index.html`);
    await page.waitForFunction(() => window.__replies.some((r) => r.t === 'ready'), { timeout: 15000 });
    let next = 0;
    let ratio = 0;
    return {
      async draw(job, deviceScaleFactor = 1) {
        // The capture page's pixel density: d3's axis offsets every line by half a pixel only at a ratio of 1, so the
        // drawing's markup depends on it (a 2x raster export drew `M0,0H612` where a 1x page draws `M0.5,0.5H612.5`).
        if (ratio !== deviceScaleFactor) {
          await page.setViewport({ width: 1280, height: 720, deviceScaleFactor });
          ratio = deviceScaleFactor;
        }
        const id = ++next;
        const raw = await page.evaluate(
          (message) =>
            new Promise((resolve) => {
              const take = () => {
                const at = window.__replies.findIndex((r) => r.t === 'result' && r.id === message.id);
                if (at < 0) return false;
                resolve(window.__replies.splice(at, 1)[0]);
                return true;
              };
              // The bootstrap answers only its parent, which a top-level page is to itself.
              window.postMessage(message, '*');
              const poll = () => (take() ? undefined : setTimeout(poll, 5));
              poll();
            }),
          { ...job, t: 'draw', id, kind },
        );
        const reply = checkDrawReply(raw);
        if (reply.ignore || reply.id !== id) return { error: 'the locked page gave no answer' };
        return reply.error !== undefined ? { error: reply.error } : { out: reply.out };
      },
      async close() {
        await context.close();
      },
    };
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }
}

/**
 * The CLI's draw host for one export: the locked pages it needs, opened WHILE the capture page loads, and the one function
 * the capture page calls. `call(job, deviceScaleFactor)` resolves `{ out }`, `{ error }`, or `{ release: true }` when the
 * plugin's locked page could not open (the figure then exports showing its source, as before).
 * @param {object} browser
 * @param {string[]} kinds
 * @param {{ warn?: (message: string) => void }} [opts]
 */
function openExportDrawHost(browser, kinds, { warn } = {}) {
  const pages = new Map(kinds.map((k) => [k, openDrawPage(browser, k).then((p) => ({ page: p }), (error) => ({ error }))]));
  const memo = new Map();
  const warned = new Set();
  return {
    async call(job, deviceScaleFactor = 1) {
      const kind = job?.kind;
      if (!pages.has(kind)) return { error: `no locked page draws ${String(kind)}` };
      const ready = await pages.get(kind);
      if (ready.error) {
        if (!warned.has(kind)) {
          warned.add(kind);
          warn?.(`${kind}: the locked page could not draw (${String(ready.error?.message ?? ready.error).split('\n')[0]}) — its figures export showing their source.`);
        }
        return { release: true };
      }
      const key = JSON.stringify([deviceScaleFactor, job]);
      if (!memo.has(key)) memo.set(key, ready.page.draw(job, deviceScaleFactor));
      return memo.get(key);
    },
    async close() {
      for (const p of pages.values()) {
        const ready = await p;
        await ready.page?.close();
      }
    },
  };
}

/**
 * The capture page's draw host, as a script to run ahead of the page's own (`evaluateOnNewDocument`), after `SANITIZER()`:
 * `window.__latticeExportDrawHost`, non-writable, listing `kinds`. Each draw goes out through the exposed function with
 * the page's pixel ratio; an answer is sanitized here before the host writes it; a `release` settles the figure showing
 * its source and writes nothing (the host's `drawInto` writes only a string). Self-contained: it closes over nothing.
 * @param {string[]} kinds
 */
function exportDrawHostScript(kinds) {
  const { releaseFigure } = require('../plugins/host-browser.mjs');
  const { fromBase64 } = require('../core/base64-utf8');
  return `(() => {
  if (Object.getOwnPropertyDescriptor(window, '__latticeExportDrawHost')) return;
  const releaseFigure = ${releaseFigure.toString()};
  const fromBase64 = ${fromBase64.toString()};
  const host = Object.freeze({
    kinds: Object.freeze(${JSON.stringify(kinds)}),
    draw(job, target) {
      return window.${DRAW_FN}(job, window.devicePixelRatio).then((r) => {
        if (r && r.release) {
          if (target) releaseFigure(target, fromBase64, true);
          return null;
        }
        if (!r || typeof r.out !== 'string') throw new Error(r && r.error ? r.error : 'the locked page gave no drawing');
        const sanitize = window.__latticeSanitizeDrawing;
        if (typeof sanitize !== 'function') throw new Error('the slide sanitizer is not in the capture page');
        return sanitize(r.out);
      });
    },
  });
  Object.defineProperty(window, '__latticeExportDrawHost', { value: host, writable: false, configurable: false });
})()`;
}

let sanitizerScript;
/**
 * The slide sanitizer for the capture page, as one script to evaluate there before `WRITE`: DOMPurify and
 * lib/core/sanitize-slide-html.mjs inside a closure (DOMPurify's UMD sees a local `module`, so no `DOMPurify` global
 * appears), configured as the code door's `__sanitizeDrawing` is (the slide sanitizer alone, every attribute it allows
 * kept), and exposed as ONE non-writable function, `window.__latticeSanitizeDrawing`. Idempotent per page, and it
 * refuses a page where something else defined that name first.
 */
function SANITIZER() {
  if (sanitizerScript) return sanitizerScript;
  const purify = fs.readFileSync(require.resolve('dompurify/dist/purify.min.js'), 'utf8');
  // The sanitizer's one import is the policy table, inlined (lib/core/policy-page-script.js).
  const slide = inlinePolicyImport(fs.readFileSync(require.resolve('../core/sanitize-slide-html.mjs'), 'utf8'), 'sanitize-slide-html.mjs').replace(/^export /gm, '');
  if (/^\s*(?:import|export)\b/m.test(slide)) throw new Error('sanitize-slide-html.mjs gained an import or export the capture page cannot take');
  // A random mark per process: the script skips only a sanitizer IT installed, and refuses to run over anything else of
  // that name, so nothing in the page can plant a sanitizer of its own first (the checker, 2026-10-20).
  const mark = JSON.stringify(require('node:crypto').randomUUID());
  sanitizerScript = `(() => {
  const there = Object.getOwnPropertyDescriptor(window, '__latticeSanitizeDrawing');
  if (there && typeof there.value === 'function' && there.value.latticeMark === ${mark}) return;
  if (there) throw new Error('window.__latticeSanitizeDrawing is already defined by something other than Lattice');
  const DOMPurify = (() => { var module = { exports: {} }; var exports = module.exports; var define; ${purify}
    return module.exports; })();
  ${slide}
  const sanitize = createSlideSanitizer(DOMPurify, window);
  Object.defineProperty(sanitize, 'latticeMark', { value: ${mark} });
  Object.defineProperty(window, '__latticeSanitizeDrawing', { value: sanitize, writable: false, configurable: false });
})()`;
  return sanitizerScript;
}

module.exports = { DRAW_FN, hostDrawnKinds, openDrawPage, openExportDrawHost, exportDrawHostScript, SANITIZER };
