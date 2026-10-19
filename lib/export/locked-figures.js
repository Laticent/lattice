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
 *   2. draws every one in a locked page — the code sandbox's browser (`launchCodeSandbox`), a synthetic origin that
 *      serves the vendored library and the plugin's own `hydrate` and nothing else, a strict CSP — by running the
 *      SAME `hydrate` the browser half runs, on placeholders rebuilt in the same order with the same sizes, so the
 *      seeded ids and the viewBox come out as an in-page draw made them;
 *   3. sanitizes each drawing in a separate page with the slide sanitizer (lib/core/sanitize-slide-html.mjs), so
 *      nothing the locked page returns reaches the capture page as script or a handler;
 *   4. writes it into its placeholder and settles it, `rendered` or `error` as the in-page draw would have.
 *
 * A drawing is remembered by config, size and place for the rest of the run, so an export that re-navigates (auto-split,
 * rails) launches no second browser for plots it has drawn.
 *
 * WHY HERE, NOT IN THE PLUGIN'S FOLDER: a plugin folder holds its declared role files only, and this is the CLI's
 * capture half, not a role. `WRITE` puts markup into the CLI's capture page (never the preview frame, so HARD RULE
 * #22's runtime census does not list it). PROVENANCE of that markup: function-plot's own drawing of the deck's config,
 * made in the locked page, then sanitized by the slide sanitizer in a separate page before it leaves (step 3).
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

/**
 * Draw `plots` (`{ config, w, h }`, every placeholder in document order) in a locked page, at the capture page's
 * `deviceScaleFactor`.
 * @returns {Promise<Array<{ html: string, error?: undefined } | { error: string }>>} index-aligned
 */
async function drawLocked(puppeteer, plots, { executablePath, deviceScaleFactor = 1 } = {}) {
  const { launchCodeSandbox } = require('../core/os-sandbox.js');
  const { openSanitizerPage } = require('../packages/code-door-worker.js');
  const lib = payloadPath(NAME);
  if (!lib || !fs.existsSync(lib)) throw new Error(`the function-plot library is missing from the package (${lib})`);
  const sandbox = await launchCodeSandbox(puppeteer, { executablePath });
  try {
    const page = await (await sandbox.browser.createBrowserContext()).newPage();
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
    // The capture page's pixel density: d3's axis offsets every line by half a pixel only at a ratio of 1, so the
    // drawing's markup depends on it (a 2x raster export drew `M0,0H612` where a 1x page draws `M0.5,0.5H612.5`).
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor });
    await page.goto(`${ORIGIN}/index.html`);
    await page.addScriptTag({ url: `${ORIGIN}/function-plot.js` });
    await page.addScriptTag({ url: `${ORIGIN}/hydrate.js` });
    const raw = await page.evaluate((plots, name) => {
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
    const sanitizer = await openSanitizerPage(sandbox.browser);
    try {
      const out = [];
      for (const r of raw) out.push(r.error !== undefined ? { error: String(r.error) } : { html: await sanitizer.sanitize(r.html) });
      return out;
    } finally {
      await sanitizer.close();
    }
  } finally {
    await sandbox.close();
  }
}

/**
 * Write `drawn` (index-aligned with READ's list) into the capture page's pending placeholders and settle each, as the
 * in-page draw would have: the drawing and `rendered`, or the error as text, `functionplot-error` and `error`.
 * A page function, evaluated with `drawn`.
 */
function WRITE(drawn) {
  const els = [...document.querySelectorAll('[data-lattice-hydrate="function-plot"]')];
  els.forEach((el, i) => {
    const r = drawn[i];
    if (!r || el.getAttribute('data-lattice-settle') !== 'pending' || el.hasAttribute('data-lattice-final')) return;
    if (typeof r.html === 'string') {
      el.innerHTML = r.html;
      el.setAttribute('data-lattice-settle', 'rendered');
    } else {
      el.textContent = String(r.error);
      el.classList.add('functionplot-error');
      el.setAttribute('data-lattice-settle', 'error');
    }
  });
}

module.exports = { NAME, READ, WRITE, drawLocked };
