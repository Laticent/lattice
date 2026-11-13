/**
 * lib/plugins/mermaid/shared/render-worker.js
 *
 * THE export path's Mermaid renderer — a page the engine owns, instead of a shell-out
 * to the `mmdc` binary.
 *
 * ── WHY (#1674) ──────────────────────────────────────────────────────────────
 * Mermaid MEASURES a label in the browser that renders it, then bakes the measured
 * box into the SVG. `mmdc` renders in ITS OWN page — `@mermaid-js/mermaid-cli`'s
 * `dist/index.html` — which carries no Lattice `@font-face`, so every label was
 * measured in a fallback face and then painted, in the host deck, in the real one.
 * Mono survived that only because its stack ends in the `monospace` generic, whose
 * fallback metrics nearly match; no hand face has that property, which is why
 * `mode: sketch` could never reach diagram type (measured: label boxes 20% narrow,
 * "Raw Signals" clipped to "Raw Signa").
 *
 * `mmdc --cssFile` is NOT the lever, by construction rather than by timing: the CLI
 * appends that CSS as a `<style>` INSIDE the SVG *after* `mermaid.render()` has
 * already returned (`src/index.js`), and it preloads `document.fonts` before that.
 * Feeding it the `@font-face` block moves the PAINT to the hand face and leaves the
 * MEASUREMENT in the fallback — strictly worse than doing nothing. Measured:
 * byte-identical geometry with and without `-C`.
 *
 * So the fix is to own the page. Here we load THE SAME page and THE SAME libraries the
 * CLI does — its `dist/index.html`, the FontAwesome stylesheet it links, and the
 * `mermaid` and `mermaid-zenuml` IIFEs — and
 * add exactly two things before rendering: Lattice's `@font-face` rules, and an
 * `await` on the faces actually loading. Everything else is the CLI's own sequence,
 * kept deliberately identical so this is a change of FONTS and CONFIG DELIVERY, not a
 * change of renderer.
 *
 * ── WHY A CHILD PROCESS ──────────────────────────────────────────────────────
 * The Mermaid bake (`mermaid.bake.js`) runs during `lattice.js`'s module evaluation and
 * cannot `await`. Puppeteer is async. Running the page in a child process keeps the
 * caller's `execFileSync` shape exactly as the `mmdc` shell-out had it, so nothing
 * upstream has to become async. It is also FASTER than what it replaces: one browser
 * and one page for the whole deck, versus a fresh Chromium per `mmdc` invocation.
 *
 * ── CONFIG ARRIVES THROUGH `mermaid.initialize`, NOT A DIRECTIVE ─────────────
 * Because we own the page, the engine's config is passed the same way the live
 * preview passes it (`lib/runtime/index.js`) instead of being serialized into a
 * `%%{init}%%` directive prepended to the source. That retires the whole class of
 * bug the directive route carried: `sanitizeDirective`'s allow-list bars the hyphen
 * (so `system-ui`/`sans-serif` was blanked) and, worse, an APOSTROPHE in any value
 * discards the entire directive — measured, the palette silently falls all the way
 * back to stock `#ECECFF`/`#333333`. An author's own `%%{init}%%` still merges OVER
 * ours, exactly as it does in the preview, because that is Mermaid's own behavior for
 * a directive layered on the site config.
 *
 * PROTOCOL. `node render-worker.js <job.json>`; the job names an output file and the
 * worker writes a result JSON there. Nothing is parsed from stdout — Mermaid logs
 * warnings to the console and a mixed stream would be a parsing hazard.
 *
 *   job    { pkgRoot, chromePath, backgroundColor, svgId, outFile, confineRoots?,
 *            diagrams: [ { definition, config } ] }
 *   result { ok, error?, fontsLoaded: [family], results: [ { ok, svg?, error? } ] }
 *
 * `fontsLoaded` is the families the page really loaded, not the ones it declared — see
 * the note at the load site. `results` is index-aligned with `job.diagrams`.
 *
 * A diagram that fails is isolated: its entry reports the error and the rest of the
 * batch still renders. That is what preserves the caller's per-diagram `<pre>`
 * degradation without making one bad fence cost the whole deck its diagrams.
 */

const { DIAGRAM_STAGE_WIDTH } = require('./baked-figure.js');

/*
 * THE HOST CONFINES; THIS DRAWS (2026-11-01-plugin-contract-hollywood.md §2, the `sandbox` row). The page this module
 * draws in is the HOST's (lib/plugins/host-page-worker.js): it launches the code sandbox, serves a synthetic origin under
 * a strict CSP from the files `assets()` names by key and from local pictures its file confiner admits, refuses every
 * other request, and calls `drawInPage` (through mermaid.page.js) with a ctx holding the origin, the re-addressed
 * picture path, the deck's faces as CSS and whether the page is still alive. This module launches nothing and confines
 * nothing; it is Mermaid's own sequence inside the page.
 */

/**
 * Errors that mean THE PAGE IS GONE, not "this diagram is malformed". Mermaid reports a
 * bad fence as a parse error; a dead renderer reports through Puppeteer's transport, and
 * those messages are the tell. Retrying a parse error costs three Chromium boots to reach
 * the same verdict; NOT retrying a dead page silently drops the rest of the deck.
 */
const FATAL_PAGE_ERROR = /detached Frame|Target closed|Session closed|Execution context was destroyed|Protocol error|timed out|Navigating frame was detached|Connection closed/i;
function isFatalPageError(message) {
  return FATAL_PAGE_ERROR.test(String(message || ''));
}

/**
 * A page on the synthetic origin cannot load a `file:` address (Chromium refuses a local resource to a web origin
 * before any request is made), and a flowchart image node names one. So each `file:` address in a definition is
 * re-addressed onto the origin and answered by the HOST's locked page through its file confiner (lib/plugins/host-page-worker.js), like the old page's `file:` requests were:
 * the picture loads, and Mermaid sizes the node from it, as before.
 *
 * THE OLD PAGE'S BYTES, EXACTLY. There, Mermaid's own sanitizer dropped a `file:` `href` from the drawn `<image>`, so
 * the export carried the node's size and no address. The re-addressed one is a web address it keeps, so
 * `restorePictures` removes it again: an export never carries the author's local path (the checker caught the first
 * cut restoring it). Anywhere else the address appears (a label's text), it is put back as written.
 * base64url keeps the re-addressed form free of anything Mermaid or the serializer would escape. The address runs to
 * the next quote, space or tag: `pathToFileURL` leaves `(`, `)` and `'` unescaped, so a folder named `Board (final)`
 * is part of it (the checker; the first cut stopped there and drew the stand-in).
 */
const FILE_ADDRESS_RE = /file:\/\/[^\s"<>`]+/gi;
function readdressPictures(definition, back, ctx) {
  return definition.replace(FILE_ADDRESS_RE, (address) => {
    const there = `${ctx.origin}${ctx.picturePath}${Buffer.from(address, 'utf8').toString('base64url')}`;
    back.set(there, address);
    return there;
  });
}
function restorePictures(svg, back) {
  let out = svg;
  for (const [there, address] of back) {
    out = out.split(` href="${there}"`).join('').split(` xlink:href="${there}"`).join('');
    out = out.split(there).join(address);
  }
  return out;
}

/**
 * The files the CLI's own render path loads, named by key, each THE MERMAID PLUGIN'S OWN COPY (its manifest's
 * `payload.vendored` and `vendor`), which the host resolves (lib/core/payload-path.js): mermaid-cli's render page
 * (`dist/index.html`, an empty `#container` since mermaid-cli 12), the FontAwesome stylesheet and faces beside it, and
 * Mermaid and ZenUML's IIFEs, which the page adds by name on its own origin. An owned copy sits at one known path under
 * any install layout.
 *
 * MERMAID-CLI 12 SHIPS NO BUNDLE. Through 11.x its `dist/` held a vite bundle that preloaded the KaTeX and FontAwesome
 * faces and set `globalThis.elkLayouts`; 12.x leaves the page empty and links the same things at render time from its
 * own `node_modules`. Mermaid 12 carries elk itself, and draws math as MathML (`legacyMathML` off) so a KaTeX
 * stylesheet styles nothing. The FontAwesome faces are the one thing left to carry, so the plugin vendors the
 * stylesheet mmdc 12 links (`@fortawesome/fontawesome-free`) under the page's folder, where its `../webfonts/` reach
 * resolves on the page's own origin.
 */
function assets() {
  return {
    index: { vendor: 'render-page' },
    scripts: { 'mermaid.min.js': { payload: true }, 'mermaid-zenuml.min.js': { vendor: 'zenuml' } },
  };
}

/** The FontAwesome stylesheet, by its path under the render page's folder (see `assets`). */
const FONTAWESOME_CSS = 'fontawesome/css/all.min.css';

/**
 * Render every diagram in the job in the host's page. ONE page, reused across the batch: the 1.6 MB Mermaid bundle is
 * parsed once instead of once per diagram, which is where the old batching's `1.09s × N` went.
 * @param {import('puppeteer').Page} page  the host's locked page, already on its origin
 * @param {{ diagrams: Array<{ definition: string, config: object }>, backgroundColor?: string, svgId?: string }} job
 * @param {{ origin: string, picturePath: string, faceCss: string, faces: Array<{ family: string }>, alive: () => boolean }} ctx
 */
async function drawInPage(page, job, ctx) {
  // The box every diagram is drawn in, stated rather than inherited from Puppeteer's default
  // viewport (shared/baked-figure.js `DIAGRAM_STAGE_WIDTH`), so the browser pass's export render
  // can draw in the same one. The same 784 px the page always gave: no output changes.
  await page.addStyleTag({ content: `#container{width:${DIAGRAM_STAGE_WIDTH}px}` });
  // By URL on the page's own origin: the CSP admits that origin's scripts and nothing inline.
  await Promise.all([
    page.addScriptTag({ url: `${ctx.origin}/mermaid.min.js` }),
    page.addScriptTag({ url: `${ctx.origin}/mermaid-zenuml.min.js` }),
  ]);
  // The FontAwesome faces mmdc 12 links before it renders (`fa:fa-car` in a label), from the page's own origin.
  await page.addStyleTag({ url: `${ctx.origin}/${FONTAWESOME_CSS}` });
  // THE CLI'S PROLOGUE, NOT JUST ITS PAGE. The REGISTRATIONS live in mermaid-cli's own
  // JavaScript — `src/index.js`, inside the `$eval` — and a page that only loads the
  // libraries has none of them.
  //
  // Dropping them cost the export a capability, silently, and an earlier draft of this
  // file shipped that way. Measured against `mmdc` on the same input: a `zenuml` diagram
  // failed outright ("No diagram type detected"). The failure is not loud: it degrades
  // to a `<pre>`. (Through 11.x the same block also registered the bundle's
  // `elkLayouts`; Mermaid 12 carries elk itself.)
  //
  // `test/unit/mermaid/render-worker.test.js` pins this against the CLI's source, so
  // a prologue step added upstream fails a test instead of quietly removing a feature.
  await page.evaluate(async () => {
    const { mermaid } = globalThis;
    const zenuml = globalThis['mermaid-zenuml'];
    // THROW rather than skip. `if (zenuml)` was the first spelling, and it re-armed the
    // exact silent failure this block was added to fix: an upstream rename of the IIFE's
    // global is precisely what would make it undefined — and a skipped registration is
    // invisible (zenuml degrades to a `<pre>`). A loud failure here degrades one render
    // and says why; a quiet one removes a capability for a release. Red team, S6.
    if (!zenuml) {
      throw new Error('the render page is missing the mermaid-zenuml global its prologue registers'
        + ' — the bundle changed; see lib/plugins/mermaid/shared/render-worker.js');
    }
    await mermaid.registerExternalDiagrams([zenuml]);
  });
  // THE POINT OF THIS FILE. Declare Lattice's faces, then WAIT for them: a declared
  // face is not a loaded one, and Mermaid measures against whatever is loaded at
  // render time.
  const faceCss = ctx.faceCss;
  if (faceCss) await page.addStyleTag({ content: faceCss });
  const fontsLoaded = await page.evaluate(async (families) => {
    // Per FAMILY and per WEIGHT: `document.fonts.load()` resolves a shorthand
    // against the declared faces, and a weight nobody asked for stays unloaded.
    const wanted = [];
    for (const family of families) {
      for (const weight of [300, 400, 500, 600, 700]) {
        wanted.push(document.fonts.load(`${weight} 16px "${family}"`));
      }
    }
    await Promise.all(wanted);
    await Promise.all(Array.from(document.fonts, (f) => f.load()));
    await document.fonts.ready;
    // REPORT WHAT ACTUALLY LOADED, PER FACE. A face that is declared but not loaded
    // measures as its fallback, which is precisely the bug this file exists to fix — and
    // it fails silently, because the diagram still renders. Handing the list back makes
    // the property observable: the caller warns, and a test can assert it without
    // inferring fonts from geometry (an earlier one tried, and a threshold calibrated
    // from the wrong probe let a broken render pass).
    //
    // `family|weight|style`, NOT family. The first cut deduped by family and so could
    // not see a missing WEIGHT — and a missing weight is the likely failure, because
    // mermaid sets cluster titles and `**bold**` runs at 700. The page would measure
    // synthetic-bold-from-400 and the deck would paint the real 700: the same
    // measure/paint split, one weight down, with the guard silent. Red team, S5.
    return [...document.fonts]
      .filter((f) => f.status === 'loaded')
      .map((f) => `${f.family}|${f.weight}|${f.style}`);
  }, [...new Set(ctx.faces.map((f) => f.family))]);

  await page.$eval('body', (body, bg) => { body.style.background = bg; },
    job.backgroundColor || 'transparent');

  const results = [];
  let fatal = null;
  for (let i = 0; i < job.diagrams.length; i++) {
    const { config } = job.diagrams[i];
    const pictures = new Map();
    const definition = readdressPictures(job.diagrams[i].definition, pictures, ctx);
    // eslint-disable-next-line no-await-in-loop -- Mermaid's config is GLOBAL to the
    // page, so the renders of one page are necessarily serial. Same constraint the
    // live preview works under (lib/runtime/index.js `configureForScope`).
    const result = await renderOne(page, definition, config, `${job.svgId || 'my-svg'}`,
      job.backgroundColor || 'transparent');
    if (result.svg && pictures.size) result.svg = restorePictures(result.svg, pictures);
    results.push(result);
    // A DEAD PAGE IS NOT A DIAGRAM ERROR, and conflating the two was the worst bug in
    // the first cut of this file. `renderOne` catches everything, so a browser that died
    // mid-batch reported N per-diagram failures inside an `ok: true` payload — the caller
    // saw a successful batch, skipped the retrying fallback, and shipped a PDF with a
    // hole in it. Measured: a renderer killed 4s into an 80-diagram batch lost 70 of 80
    // diagrams and exited 0. Every one of those errors was frame/target/protocol level,
    // i.e. exactly the class the retry exists for.
    if (!result.ok && (isFatalPageError(result.error) || !ctx.alive())) {
      fatal = result.error;
      break;
    }
  }
  // `ok: false` sends the caller to its per-diagram path, which retries. The partial
  // results ride along so a caller that prefers them to nothing still has them.
  if (fatal) return { ok: false, error: `render page died mid-batch: ${fatal}`, fontsLoaded, results };
  return { ok: true, fontsLoaded, results };
}

async function renderOne(page, definition, config, svgId, backgroundColor) {
  try {
    const svg = await page.$eval('#container', async (container, definition, config, svgId, backgroundColor) => {
      const { mermaid } = globalThis;
      container.innerHTML = '';
      // `initialize` REPLACES the site config rather than accumulating onto it, so a
      // key one diagram sets and the next omits (`look`, on a sketch deck carrying one
      // `_class: boardroom` slide) does not leak forward. Asserted by
      // test/unit/mermaid/render-worker.test.js rather than assumed — a leak here would
      // be invisible except as one slide silently wearing the previous slide's finish.
      mermaid.initialize(config);
      const { svg: svgText } = await mermaid.render(svgId, definition, container);
      container.innerHTML = svgText;
      // mmdc set this on the SVG ELEMENT, not just the body, and the attribute rides into
      // the emitted markup (`style="max-width:…; background-color: transparent;"`). No
      // stylesheet in the tree reads it, so dropping it looked inert — but the image-set
      // export lifts these SVGs out of the deck as standalone files, where the element's
      // own style is all there is. Kept for parity rather than argued about.
      const el = container.querySelector('svg');
      if (el?.style) el.style.backgroundColor = backgroundColor;
      // Serialize from the DOM, not from `svgText`: a `<foreignObject>` label carries
      // HTML that is not well-formed XML (`<br>`), and XMLSerializer is what the CLI
      // uses to make it so.
      return el ? new XMLSerializer().serializeToString(el) : '';
    }, definition, config, svgId, backgroundColor);
    // A RENDER THAT PRODUCED NOTHING IS A FAILURE, however calmly it returned. Mermaid can
    // resolve without inserting an `<svg>` — a `pie` definition containing a full-width
    // digit does exactly that on 11.14, resolving cleanly with an empty container — and
    // reporting `ok: true` with no markup let the diagram vanish: the caller either threw
    // on `undefined.replace` or, worse, would have shipped a slide with a hole in it.
    // Report it like any other diagram-level failure so the `<pre>` degradation catches it.
    if (!svg) return { ok: false, error: 'mermaid resolved without producing an SVG' };
    return { ok: true, svg };
  } catch (e) {
    return { ok: false, error: String(e?.message ? e.message : e).split('\n')[0] };
  }
}

module.exports = { assets, drawInPage, isFatalPageError, readdressPictures, restorePictures };
