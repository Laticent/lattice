/**
 * lib/integrations/mermaid/render-worker.js
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
 * So the fix is to own the page. Here we load THE SAME page and THE SAME bundles the
 * CLI does — its `dist/index.html` plus the `mermaid` and `mermaid-zenuml` IIFEs — and
 * add exactly two things before rendering: Lattice's `@font-face` rules, and an
 * `await` on the faces actually loading. Everything else is the CLI's own sequence,
 * kept deliberately identical so this is a change of FONTS and CONFIG DELIVERY, not a
 * change of renderer.
 *
 * ── WHY A CHILD PROCESS ──────────────────────────────────────────────────────
 * `preprocessMermaid` runs at module-evaluation time in `lattice-emulator.js` and
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
 *   job    { pkgRoot, chromePath, backgroundColor, svgId, outFile,
 *            diagrams: [ { definition, config } ] }
 *   result { ok, error?, results: [ { ok, svg? , error? } ] }   // index-aligned
 *
 * A diagram that fails is isolated: its entry reports the error and the rest of the
 * batch still renders. That is what preserves the caller's per-diagram `<pre>`
 * degradation without making one bad fence cost the whole deck its diagrams.
 */

const fs = require('node:fs');
const path = require('node:path');
const url = require('node:url');
const { fontFaceCss, fontFamilies } = require('../../fonts/face-css.js');

/**
 * Resolve the three assets the CLI's own render path uses, from wherever npm put
 * them. `mermaid-cli`'s `exports` map publishes only its ESM entry, so its
 * `dist/index.html` cannot be `require.resolve`d directly — locate it relative to a
 * sibling package that IS resolvable, which is correct under both a hoisted and a
 * nested `node_modules`.
 */
function resolveBundles(pkgRoot) {
  const mermaidIife = require.resolve('mermaid/dist/mermaid.js');
  const zenumlIife = require.resolve('@mermaid-js/mermaid-zenuml/dist/mermaid-zenuml.js');
  // <node_modules>/mermaid/dist/mermaid.js → <node_modules>
  const nodeModules = path.resolve(path.dirname(mermaidIife), '..', '..');
  const candidates = [
    path.join(nodeModules, '@mermaid-js', 'mermaid-cli', 'dist', 'index.html'),
    path.join(pkgRoot, 'node_modules', '@mermaid-js', 'mermaid-cli', 'dist', 'index.html'),
  ];
  const indexHtml = candidates.find((p) => fs.existsSync(p));
  if (!indexHtml) {
    throw new Error(`mermaid-cli render page not found (looked in: ${candidates.join(', ')})`);
  }
  return { mermaidIife, zenumlIife, indexHtml };
}

/**
 * Render every diagram in the job. ONE browser, ONE page, reused across the batch —
 * the 1.6 MB Mermaid bundle is parsed once instead of once per diagram, which is
 * where the old batching's `1.09s × N` went.
 */
async function renderAll(job) {
  const puppeteer = require('puppeteer');
  const { mermaidIife, zenumlIife, indexHtml } = resolveBundles(job.pkgRoot);
  const launchOpts = { args: ['--no-sandbox', '--disable-setuid-sandbox'] };
  if (job.chromePath) launchOpts.executablePath = job.chromePath;

  const browser = await puppeteer.launch(launchOpts);
  try {
    const page = await browser.newPage();
    // Mermaid is chatty on stdout via console.warn; swallow it so the caller's
    // progress line stays readable. Real failures come back in the result JSON.
    page.on('console', () => {});
    await page.goto(url.pathToFileURL(indexHtml).href);
    await Promise.all([
      page.addScriptTag({ path: mermaidIife }),
      page.addScriptTag({ path: zenumlIife }),
    ]);
    // THE POINT OF THIS FILE. Declare Lattice's faces, then WAIT for them: a declared
    // face is not a loaded one, and Mermaid measures against whatever is loaded at
    // render time.
    const faceCss = fontFaceCss(job.pkgRoot, { display: 'block' });
    if (faceCss) await page.addStyleTag({ content: faceCss });
    await page.evaluate(async (families) => {
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
    }, fontFamilies());

    await page.$eval('body', (body, bg) => { body.style.background = bg; },
      job.backgroundColor || 'transparent');

    const results = [];
    for (let i = 0; i < job.diagrams.length; i++) {
      const { definition, config } = job.diagrams[i];
      // eslint-disable-next-line no-await-in-loop -- Mermaid's config is GLOBAL to the
      // page, so the renders of one page are necessarily serial. Same constraint the
      // live preview works under (lib/runtime/index.js `configureForScope`).
      results.push(await renderOne(page, definition, config, `${job.svgId || 'my-svg'}`));
    }
    return { ok: true, results };
  } finally {
    await browser.close();
  }
}

async function renderOne(page, definition, config, svgId) {
  try {
    const svg = await page.$eval('#container', async (container, definition, config, svgId) => {
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
      // Serialize from the DOM, not from `svgText`: a `<foreignObject>` label carries
      // HTML that is not well-formed XML (`<br>`), and XMLSerializer is what the CLI
      // uses to make it so.
      return new XMLSerializer().serializeToString(container.querySelector('svg'));
    }, definition, config, svgId);
    return { ok: true, svg };
  } catch (e) {
    return { ok: false, error: String(e?.message ? e.message : e).split('\n')[0] };
  }
}

async function main() {
  const jobFile = process.argv[2];
  if (!jobFile) {
    process.stderr.write('render-worker: usage: node render-worker.js <job.json>\n');
    process.exit(2);
  }
  const job = JSON.parse(fs.readFileSync(jobFile, 'utf8'));
  let payload;
  try {
    payload = await renderAll(job);
  } catch (e) {
    payload = { ok: false, error: String(e?.message ? e.message : e).split('\n')[0], results: [] };
  }
  fs.writeFileSync(job.outFile, JSON.stringify(payload));
  // A worker that reached its output file has done its job; a diagram-level failure
  // is DATA in that file, not a process failure. Exiting non-zero for it would make
  // the caller discard the diagrams that did render.
  process.exit(payload.ok ? 0 : 1);
}

if (require.main === module) main();

module.exports = { renderAll, resolveBundles };
