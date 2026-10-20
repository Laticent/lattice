/**
 * lib/export/locked-figures.js — function-plot's figures drawn in the LOCKED page, for the
 * exports that capture a page: the PDF, the PNG and PPTX rasters, `--player` and `--read` (owner decisions 14 and 16,
 * threat-model note 2026-10-16 §6; engineering/decisions/2026-10-19-first-party-plugins-in-the-sandbox.md).
 *
 * The plain `.html` export keeps the library and its zoom and drag (decision 16, a recorded exception). Every page the
 * CLI captures loads WITHOUT it: `lattice.js` serves that page a copy whose function-plot hydrator is marked
 * `drawnByHost` (lib/plugins/hydrate-script.js), so the placeholders wait, pending. This module then:
 *
 *   1. reads each placeholder's packed config and drawn size from the capture page;
 *   2. draws every one in a locked page — a fresh browser context of the export's own capture browser (one browser
 *      per export, the owner's speed rule), a synthetic origin that serves the vendored library and the plugin's own
 *      `hydrate` and nothing else, every other request refused, a strict CSP — by running the
 *      SAME `hydrate` the browser half runs, on placeholders rebuilt in the same order with the same sizes, so the
 *      seeded ids and the viewBox come out as an in-page draw made them;
 *   3. sanitizes each drawing with the slide sanitizer (lib/core/sanitize-slide-html.mjs, DOMPurify) as `WRITE`
 *      inserts it, so nothing the locked page returns reaches the capture page as script or a handler. DOMPurify
 *      parses the string into an inert document of its own, which is the use it is built for; it runs in the capture
 *      page (`SANITIZER`, one closure and one global function) rather than a page of its own, which cost a renderer
 *      process and ~150 ms per export (the owner's speed rule, 2026-10-20);
 *   4. writes it into its placeholder and settles it, `rendered` or `error` as the in-page draw would have.
 *
 * A drawing is remembered by config, size and place for the rest of the run, so an export that re-navigates (auto-split,
 * rails) draws the plots once.
 *
 * WHAT THE ONE-BROWSER RULE GAVE UP: the capture browser runs without Chromium's OS sandbox (lattice.js `renderExport`
 * launches with `--no-sandbox` on every platform), so the locked page no longer has that layer under it, where the
 * code sandbox's own browser did on macOS, Windows and an unprivileged Linux. It keeps every other wall, and it is
 * still more confined than `main`, where function-plot drew inside the capture page itself. Giving the whole capture
 * browser the OS layer is the follow-up `followups.d/2800-p2-capture-browser-os-sandbox.md`.
 *
 * WHY HERE, NOT IN THE PLUGIN'S FOLDER: a plugin folder holds its declared role files only, and this is the CLI's
 * capture half, not a role. `WRITE` puts markup into the CLI's capture page (never the preview frame, so HARD RULE
 * #22's runtime census does not list it). PROVENANCE of that markup: function-plot's own drawing of the deck's config,
 * made in the locked page, then sanitized by the slide sanitizer before it is inserted (step 3).
 */

const fs = require('node:fs');
const { hydrate } = require('../plugins/function-plot/function-plot.hydrate.js');
const { payloadPath } = require('../plugins/payload-path.js');

const NAME = 'function-plot';
const ORIGIN = 'https://function-plot.lattice.invalid';
// function-plot compiles each expression to a function (its `built-in-math-eval`), hence `'unsafe-eval'`: the page
// has no network, no storage of ours and nothing of the deck but the plots' configs, which is the wall that matters.
const CSP = [
  "default-src 'none'",
  `script-src ${ORIGIN} 'unsafe-eval'`,
  "style-src 'unsafe-inline'",
  'font-src data:',
  'img-src data: blob:',
  "connect-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');
const PAGE = '<!doctype html><html><head><meta charset="utf-8"><title>function-plot</title></head><body></body></html>';

/** Read every pending function-plot placeholder of the capture page, in document order. */
const READ = `(() => [...document.querySelectorAll('[data-lattice-hydrate="${NAME}"]')].map((el) => {
  const r = el.getBoundingClientRect();
  return { config: el.getAttribute('data-lattice-config') || '', w: r.width, h: r.height, pending: el.getAttribute('data-lattice-settle') === 'pending' && !el.hasAttribute('data-lattice-final') };
}))()`;

/** One locked page, ready to draw: a fresh browser context, the request lock, the CSP, the library and `hydrate` loaded. */
async function lockedPage(host, lib) {
  const context = await host.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const u = req.url();
      if (u === `${ORIGIN}/index.html`) return req.respond({ status: 200, contentType: 'text/html', headers: { 'content-security-policy': CSP }, body: PAGE });
      if (u === `${ORIGIN}/function-plot.js`) return req.respond({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(lib) });
      if (u === `${ORIGIN}/hydrate.js`) return req.respond({ status: 200, contentType: 'text/javascript', body: `window.__hydrate = ${hydrate.toString()};` });
      if (/^(?:data|blob):/.test(u)) return req.continue();
      return req.abort('blockedbyclient');
    });
    page.on('console', () => {});
    await page.goto(`${ORIGIN}/index.html`);
    await page.addScriptTag({ url: `${ORIGIN}/function-plot.js` });
    await page.addScriptTag({ url: `${ORIGIN}/hydrate.js` });
    return { page, close: () => context.close().catch(() => {}) };
  } catch (e) {
    await context.close().catch(() => {});
    throw e;
  }
}

/**
 * Open a plotter in `browser`: a locked page made READY NOW, so an export can start it while its capture page loads and
 * pay almost nothing when the plots are read (the owner's speed rule, 2026-10-20). Its drawings come back RAW, for
 * `WRITE` to sanitize as it inserts them.
 *
 * `browser` is the export's own capture browser, which every export that captures a page has already started. Each
 * locked page is a fresh browser context of it (its own storage partition, the synthetic origin, the request lock and
 * the CSP above), so no second browser starts. Each `draw` uses a page no draw has used: the ready one first, a new
 * one after, because `hydrate` seeds its ids from a plot's place and a page that drew before could seed them
 * differently.
 * @returns {Promise<{ draw: (plots: Array<{config: string, w: number, h: number}>, opts?: {deviceScaleFactor?: number}) => Promise<Array<{html: string} | {error: string}>>, close: () => Promise<void> }>}
 */
async function openPlotter(browser) {
  const lib = payloadPath(NAME);
  if (!lib || !fs.existsSync(lib)) throw new Error(`the function-plot library is missing from the package (${lib})`);
  let warm = await lockedPage(browser, lib);
  return {
    async draw(plots, { deviceScaleFactor = 1 } = {}) {
      const locked = warm ?? (await lockedPage(browser, lib));
      warm = null;
      try {
        // The capture page's pixel density: d3's axis offsets every line by half a pixel only at a ratio of 1, so the
        // drawing's markup depends on it (a 2x raster export drew `M0,0H612` where a 1x page draws `M0.5,0.5H612.5`).
        await locked.page.setViewport({ width: 1280, height: 720, deviceScaleFactor });
        const raw = await locked.page.evaluate((plots, name) => {
          // The placeholders, rebuilt in order and at size: `hydrate` seeds its ids from a plot's config and its place.
          const els = plots.map((p) => {
            const el = document.createElement('div');
            el.className = 'functionplot';
            el.setAttribute('data-lattice-hydrate', name);
            el.setAttribute('data-lattice-config', p.config);
            el.style.width = `${p.w}px`;
            el.style.height = `${p.h}px`;
            document.body.appendChild(el);
            return el;
          });
          const decode = (e) => new TextDecoder().decode(Uint8Array.from(atob(e.getAttribute('data-lattice-config')), (c) => c.charCodeAt(0)));
          return els.map((el) => {
            let state = 'rendered';
            try {
              window.__hydrate(el, { lib: window.functionPlot, decodeConfig: decode, settle: (_e, s) => { state = s; } });
            } catch (e) {
              return { error: String(e?.message ?? e) };
            }
            return state === 'error' ? { error: el.textContent } : { html: el.innerHTML };
          });
        }, plots, NAME);
        // RAW: `WRITE` sanitizes each one as it inserts it.
        return raw.map((r) => (r.error !== undefined ? { error: String(r.error) } : { html: String(r.html) }));
      } finally {
        await locked.close();
      }
    },
    async close() {
      await warm?.close();
      warm = null;
    },
  };
}

/**
 * Draw `plots` (`{ config, w, h }`, every placeholder in document order) once, at `deviceScaleFactor`, RAW: in `browser`
 * when given, else in the code sandbox's own browser launched for the call (with Chromium's OS sandbox where the machine
 * allows it; the tests' path).
 * @returns {Promise<Array<{ html: string, error?: undefined } | { error: string }>>} index-aligned
 */
async function drawLocked(puppeteer, plots, { browser, executablePath, deviceScaleFactor = 1 } = {}) {
  const own = browser ? null : await require('../core/os-sandbox.js').launchCodeSandbox(puppeteer, { executablePath });
  try {
    const plotter = await openPlotter(browser ?? own.browser);
    try {
      return await plotter.draw(plots, { deviceScaleFactor });
    } finally {
      await plotter.close();
    }
  } finally {
    await own?.close();
  }
}

let sanitizerScript;
/**
 * The slide sanitizer for the capture page, as one script to evaluate there before `WRITE`: DOMPurify and
 * lib/core/sanitize-slide-html.mjs inside a closure (DOMPurify's UMD sees a local `module`, so no `DOMPurify` global
 * appears), configured as the code door's `__sanitizeDrawing` is (the slide sanitizer alone, every attribute it allows
 * kept), and exposed as ONE non-writable function, `window.__latticeSanitizeDrawing`. Idempotent per page.
 */
function SANITIZER() {
  if (sanitizerScript) return sanitizerScript;
  const purify = fs.readFileSync(require.resolve('dompurify/dist/purify.min.js'), 'utf8');
  const slide = fs.readFileSync(require.resolve('../core/sanitize-slide-html.mjs'), 'utf8').replace(/^export /gm, '');
  if (/^\s*(?:import|export)\b/m.test(slide)) throw new Error('sanitize-slide-html.mjs gained an import or export the capture page cannot take');
  sanitizerScript = `(() => {
  if (typeof window.__latticeSanitizeDrawing === 'function') return;
  const DOMPurify = (() => { var module = { exports: {} }; var exports = module.exports; var define; ${purify}
    return module.exports; })();
  ${slide}
  Object.defineProperty(window, '__latticeSanitizeDrawing', { value: createSlideSanitizer(DOMPurify, window), writable: false, configurable: false });
})()`;
  return sanitizerScript;
}

/**
 * Write `drawn` (index-aligned with READ's list) into the capture page's pending placeholders and settle each, as the
 * in-page draw would have: the drawing, SANITIZED, and `rendered`, or the error as text, `functionplot-error` and
 * `error`. A page function, evaluated with `drawn` after `SANITIZER()`.
 */
function WRITE(drawn) {
  const sanitize = window.__latticeSanitizeDrawing;
  if (typeof sanitize !== 'function') throw new Error('the slide sanitizer is not in the capture page (evaluate SANITIZER first)');
  const els = [...document.querySelectorAll('[data-lattice-hydrate="function-plot"]')];
  els.forEach((el, i) => {
    const r = drawn[i];
    if (!r || el.getAttribute('data-lattice-settle') !== 'pending' || el.hasAttribute('data-lattice-final')) return;
    if (typeof r.html === 'string') {
      el.innerHTML = sanitize(r.html);
      el.setAttribute('data-lattice-settle', 'rendered');
    } else {
      el.textContent = String(r.error);
      el.classList.add('functionplot-error');
      el.setAttribute('data-lattice-settle', 'error');
    }
  });
}

module.exports = { NAME, READ, WRITE, SANITIZER, drawLocked, openPlotter };
