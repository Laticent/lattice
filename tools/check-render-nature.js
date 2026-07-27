#!/usr/bin/env node
/**
 * check-render-nature — the DERIVE-AND-GATE half of the `render` manifest field.
 *
 * WHAT THE FIELD CLAIMS. Every visualization component (bucket `chart` or
 * `diagram`) declares `render: svg | hybrid | html` — whether the picture a
 * viewer looks at is drawn inside an `<svg>`, laid out in HTML/CSS boxes, or
 * both — plus a `renderNote` saying why it is built that way. The declaration is
 * what tells an author whether the whole picture animates (chart-motion reads
 * the first `<svg>` in the section), whether every visible part can carry a
 * mark-detail popover, and what an SVG export will actually contain.
 *
 * WHY IT IS DERIVED, NOT TRUSTED. A hand-maintained field is an assertion, and
 * assertions rot. The branch that SVG-ified the diagram charts (#1189) found
 * four separate hand-written claims that had gone false — a motion role map
 * keyed on a class no kernel emits, a support matrix in prose, a role gate that
 * scanned source text and so was blind to marks emitted through a helper, three
 * committed artifacts that no longer reproduced from their source. So `render`
 * is declared for INTENT and checked against the rendered artifact: the field
 * can be wrong for exactly as long as it takes this gate to run.
 *
 * THE SURFACE (HARD RULE #23). The nature of a visualization is a fact about the
 * artifact a human receives, not about the engine's intermediate HTML — the
 * engine emits a ```mermaid fence that mmdc turns into SVG at build time, and it
 * emits a state-chart as an `<ol>` that the browser pass repaints into the SVG
 * overlay. Deriving from `engine.render()` alone would call `diagram` an HTML
 * component and would miss the state-chart repaint entirely. So this gate
 * derives from the EXPORT surface: `lattice-emulator.js` renders the bucket
 * gallery to its HTML sidecar (mermaid baked), Chromium loads that sidecar (the
 * runtime pass runs), and the measurement reads the resulting live DOM.
 *
 * THE MEASUREMENT is deliberately dumb, so it cannot be argued with. Inside each
 * slide's PICTURE (see PICTURE_SEL), every laid-out text node and every laid-out
 * geometry element is attributed to one side by a single question: is it inside
 * an `<svg>`? Addressable HTML marks (`[data-mark]` on an HTML element) count as
 * HTML content even without text. Then:
 *
 *     svg side only   → svg
 *     html side only  → html
 *     both sides      → hybrid
 *
 * There is no threshold, and only two things are subtracted. Slide CHROME — the
 * masthead, header, footer and the read-as caption — is outside the picture by
 * construction (chart-family emits `.chart-caption` as a SIBLING of `.chart-body`),
 * so nothing has to exclude it. What IS excluded is content that occupies no
 * layout at all (`display:none`, `visibility:hidden` — how state-chart's `<ol>`
 * stops counting once the browser pass paints over it) and content inside SVG's
 * non-rendering containers (`<defs>`, `<pattern>`, `<marker>`, …), which lay out
 * but never paint. Everything else the picture is made of counts, so a word cloud
 * whose words are SVG but whose size key beside them is HTML is `hybrid`, and its
 * `renderNote` says so — more useful than a rounded-off `svg` would be.
 *
 * WHAT THE PREDICATE DOES NOT CATCH, stated rather than papered over: an element
 * that is laid out but invisible for a reason CSS geometry cannot see —
 * `opacity: 0`, `fill: none`, a clip that hides everything, type at `font-size: 0`,
 * a shape parked off-canvas. Each would be counted as content. None occurs in the
 * catalog today; a kernel that starts doing it needs a case here, not a shrug.
 *
 * COVERAGE. It measures each component's OWN gallery, so every variant is in
 * scope, not just the default: radar's small-multiples label each mini with an
 * HTML `<figcaption>`, and that is what makes radar hybrid even though its
 * single-radar default is pure SVG. A per-component verdict is the OR across its
 * slides — if any shipped variant mixes the two, the component mixes the two.
 *
 * Usage:
 *   node tools/check-render-nature.js          # gate: exit 1 on a mismatch
 *   node tools/check-render-nature.js --json   # machine-readable derivation
 *   node tools/check-render-nature.js --report # the derived table, human-readable
 *
 * Needs a Chromium (CHROME_PATH or the puppeteer cache) and runs one emulator
 * build per component (~90s). On a host with no browser it SKIPS with a loud notice and exit
 * 0 — never a false green claim (HARD RULE #23). It is therefore an on-demand /
 * integration gate, not part of the browser-free `build:check`; the COVERAGE
 * half (every visualization declares the pair, nothing else does) is static and
 * does live in build:check, as `checkRenderNature` in tools/check-ownership.js.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const EMULATOR = path.join(ROOT, 'lattice-emulator.js');
const { loadAll, manifestBucket } = require('../lib/components');

/** The two buckets whose components are visualizations — the family that declares `render`. */
const VIZ_BUCKETS = ['chart', 'diagram'];

/** Geometry that paints a shape. `<text>`/`<tspan>` are counted as text, not geometry. */
const GEOMETRY = ['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'use', 'image'];

/**
 * THE PICTURE — the element(s) a slide's visualization is drawn into. The field
 * describes the visualization, not the slide, so the measurement is scoped here
 * rather than to the whole stage: a diagram slide may carry authored prose beside
 * its diagram, and that prose says nothing about how the diagram is drawn.
 * `.chart-body` is the chart-frame's picture cell (every chart-bucket component);
 * `.mermaid-svg` is the baked diagram, `.mermaid-fallback` the `<pre>` that ships
 * when mmdc fails — measured deliberately, so a broken mermaid build derives
 * `html` and fails this gate instead of passing silently.
 */
const PICTURE_SEL = '.chart-body, .mermaid-svg, .mermaid-fallback';

/**
 * SVG containers whose contents lay out but NEVER paint. A `<text>` in `<defs>`
 * or a `<path>` in a `<pattern>` has client rects, so the visibility predicate
 * alone counts them as content — enough to flip a pure-HTML picture to `hybrid`
 * on the strength of an inert sprite. Lattice already ships `<defs>` full of
 * `<path>`s for the categorical textures (lib/core/accessibility-textures.js);
 * they sit at page level today, outside any section, which is the only reason
 * this has not bitten yet.
 */
const NON_RENDERING_SEL = 'defs, pattern, marker, clipPath, mask, symbol, linearGradient, radialGradient';

/** The visualization components that must declare `render`, each with its own gallery. */
function vizComponents() {
  return loadAll()
    .filter((m) => VIZ_BUCKETS.includes(manifestBucket(m)))
    .map((m) => ({
      name: m.name,
      bucket: manifestBucket(m),
      declared: m.render,
      deck: path.join(ROOT, 'lib', 'components', manifestBucket(m), m.name, `${m.name}.gallery.md`),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Best-effort Chromium path — mirrors tools/check-viz-render.js + tools/screenshot.js. */
function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

/** Where a deck's emulator artifacts land. Derived BEFORE the render, so a render
 *  that throws part-way still leaves its half-written files registered for cleanup. */
function sidecarPaths(deckFile) {
  const base = path.join(os.tmpdir(), `render-nature-${path.basename(deckFile, '.md')}-${process.pid}`);
  return { pdf: `${base}.pdf`, html: `${base}.html` };
}

/**
 * Render a deck through the emulator, leaving its HTML sidecar on disk — the
 * export surface, with mermaid already baked to SVG.
 * (Same idiom as tools/check-svg-scaling.js, which measures the same sidecar.)
 */
function renderSidecar(deckFile, { pdf, html }) {
  execFileSync(process.execPath, [EMULATOR, deckFile, pdf, 'indaco', '-q'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60_000,
  });
  if (!fs.existsSync(html)) throw new Error(`emulator produced no HTML sidecar for ${deckFile}`);
}

/**
 * The in-page measurement. Runs inside Chromium against the live, runtime-painted
 * DOM. Returns one record per `<section>` that declares a component class.
 *
 * Exported so the unit test can exercise the classification arithmetic without a
 * browser (the browser supplies the counts; the rule that reads them is pure).
 */
function classify({ svgChars, svgGeom, htmlChars, htmlMarks }) {
  const hasSvg = svgChars > 0 || svgGeom > 0;
  const hasHtml = htmlChars > 0 || htmlMarks > 0;
  if (hasSvg && hasHtml) return 'hybrid';
  if (hasSvg) return 'svg';
  if (hasHtml) return 'html';
  return 'empty';
}

/** Merge two per-section tallies into one per-component tally. */
function mergeCounts(a, b) {
  return {
    svgChars: a.svgChars + b.svgChars,
    svgGeom: a.svgGeom + b.svgGeom,
    htmlChars: a.htmlChars + b.htmlChars,
    htmlMarks: a.htmlMarks + b.htmlMarks,
    sections: a.sections + b.sections,
    pictures: a.pictures + b.pictures,
    hosts: { ...a.hosts, ...Object.fromEntries(Object.entries(b.hosts).map(([k, v]) => [k, (a.hosts[k] || 0) + v])) },
  };
}

const EMPTY = { svgChars: 0, svgGeom: 0, htmlChars: 0, htmlMarks: 0, sections: 0, pictures: 0, hosts: {} };

async function derive(components = vizComponents()) {
  const chrome = resolveChrome();
  if (!chrome) return { skipped: true, derived: {} };

  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const derived = Object.create(null);
  const temps = [];
  try {
    for (const comp of components) {
      if (!fs.existsSync(comp.deck)) throw new Error(`missing gallery for ${comp.name}: ${comp.deck}`);
      const { html, pdf } = sidecarPaths(comp.deck);
      temps.push(html, pdf);
      renderSidecar(comp.deck, { html, pdf });
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0', timeout: 120_000 });
      const records = await page.evaluate((GEOM, INERT, PICTURE, NAME) => {
        const geom = new Set(GEOM);
        // Laid out at all? Zero client rects covers `display:none`; the second
        // clause covers `visibility:hidden`, which is what state-chart uses to
        // retire its `<ol>` once the browser pass has painted the SVG over it
        // (deliberately NOT display:none — the boxes must keep occupying space
        // so the next re-measure still works). Content occupying no layout is
        // not part of the picture, whatever the markup says.
        const shown = (el) => !!el && el.getClientRects().length > 0
          && getComputedStyle(el).visibility !== 'hidden'
          // …and inside a non-rendering SVG container it lays out but never
          // paints, so it is not part of the picture either.
          && !el.closest(INERT);
        const out = [];
        for (const sec of document.querySelectorAll('section[data-class]')) {
          // `_class: state-chart lr` renders as `data-class="state-chart lr"`.
          // Match on MEMBERSHIP, not on position: a slide authored `_class: dark
          // roadmap` puts a modifier first, and keying off token[0] would drop
          // that slide silently — the failure mode that could quietly turn a
          // hybrid verdict into `svg`.
          if (!sec.dataset.class.trim().split(/\s+/).includes(NAME)) continue;
          const pictures = [...sec.querySelectorAll(PICTURE)];
          const rec = { name: NAME, svgChars: 0, svgGeom: 0, htmlChars: 0, htmlMarks: 0, sections: 1, pictures: pictures.length, hosts: {} };
          for (const picture of pictures) {
            const walker = document.createTreeWalker(picture, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              const text = (n.nodeValue || '').trim();
              if (!text) continue;
              const host = n.parentElement;
              if (!shown(host)) continue;
              const inSvg = !!host.closest('svg');
              const key = host.tagName.toLowerCase()
                + (host.getAttribute('class') ? `.${host.getAttribute('class').split(/\s+/)[0]}` : '');
              rec.hosts[`${inSvg ? 'svg:' : 'html:'}${key}`] = (rec.hosts[`${inSvg ? 'svg:' : 'html:'}${key}`] || 0) + text.length;
              if (inSvg) rec.svgChars += text.length; else rec.htmlChars += text.length;
            }
            for (const el of picture.querySelectorAll('*')) {
              const tag = el.tagName.toLowerCase();
              const inSvg = !!el.closest('svg');
              if (inSvg && geom.has(tag) && shown(el)) rec.svgGeom += 1;
              if (!inSvg && el.hasAttribute('data-mark') && shown(el)) rec.htmlMarks += 1;
            }
          }
          out.push(rec);
        }
        return out;
      }, GEOMETRY, NON_RENDERING_SEL, PICTURE_SEL, comp.name);
      await page.close();
      for (const rec of records) {
        const { name, ...counts } = rec;
        derived[name] = mergeCounts(derived[name] || EMPTY, counts);
      }
    }
  } finally {
    await browser.close();
    for (const f of temps) { try { fs.unlinkSync(f); } catch { /* best effort */ } }
  }
  return { skipped: false, derived };
}

async function main() {
  const args = process.argv.slice(2);
  const asJson = args.includes('--json');
  const asReport = args.includes('--report');

  const components = vizComponents();
  const { skipped, derived } = await derive(components);

  if (skipped) {
    console.error('check-render-nature: no Chromium (set CHROME_PATH) — SKIPPED, nothing verified.');
    process.exit(0);
  }

  const rows = components.map((c) => {
    const counts = derived[c.name];
    return { ...c, actual: counts ? classify(counts) : 'unrendered', counts: counts || null };
  });

  if (asJson) {
    console.log(JSON.stringify({ rows }, null, 2));
    process.exit(rows.some((r) => r.declared !== r.actual) ? 1 : 0);
  }

  if (asReport) {
    for (const r of rows) {
      const c = r.counts || { ...EMPTY };
      console.log(
        `${r.name.padEnd(15)} declared=${String(r.declared).padEnd(7)} actual=${r.actual.padEnd(7)} ` +
        `svg[text ${c.svgChars} geom ${c.svgGeom}]  html[text ${c.htmlChars} marks ${c.htmlMarks}]  slides ${c.sections}`,
      );
    }
  }

  const errors = [];
  for (const r of rows) {
    if (r.actual === 'unrendered') {
      errors.push(
        `${r.name}: its own gallery (${path.relative(ROOT, r.deck)}) renders no slide of it, so its ` +
        `\`render: ${r.declared}\` is unchecked. A component with no specimen of itself cannot be verified.`,
      );
      continue;
    }
    if (r.actual === 'empty') {
      errors.push(r.counts.pictures === 0
        ? `${r.name}: rendered ${r.counts.sections} slide(s) but none contains a picture element (${PICTURE_SEL}). ` +
          `A visualization that draws outside those roots is invisible to this gate — widen PICTURE_SEL, with a note saying why.`
        : `${r.name}: its picture rendered no visible text and no visible geometry — the render is broken, or the gallery slide is.`);
      continue;
    }
    if (r.declared !== r.actual) {
      const c = r.counts;
      errors.push(
        `${r.name}: manifest declares \`render: ${r.declared}\` but the rendered export is "${r.actual}" ` +
        `(svg: ${c.svgChars} chars / ${c.svgGeom} shapes · html: ${c.htmlChars} chars / ${c.htmlMarks} marks). ` +
        `Fix the component or the declaration — and update \`renderNote\` to match. ` +
        `Run with --report to see where the content sits.`,
      );
    }
  }

  if (errors.length) {
    console.error(`\ncheck-render-nature: ${errors.length} declaration(s) do not match the rendered export:\n`);
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error('');
    process.exit(1);
  }
  console.log(`check-render-nature: ${rows.length} visualization component(s) — every \`render\` declaration matches the rendered export.`);
}

if (require.main === module) {
  main().catch((err) => { console.error(`check-render-nature: ${err?.stack || err}`); process.exit(2); });
}

module.exports = { classify, mergeCounts, derive, vizComponents, VIZ_BUCKETS, GEOMETRY, NON_RENDERING_SEL, PICTURE_SEL };
