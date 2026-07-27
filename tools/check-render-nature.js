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
 * slide's stage cell (`.cell-stage`), every VISIBLE text node and every visible
 * geometry element is attributed to one side by a single question: is it inside
 * an `<svg>`? Addressable HTML marks (`[data-mark]` on an HTML element) count as
 * HTML content even without text. Then:
 *
 *     svg side only   → svg
 *     html side only  → html
 *     both sides      → hybrid
 *
 * There is no threshold. The only thing subtracted is CHROME — the masthead,
 * header and footer (already outside the stage cell) and the read-as caption
 * (`.chart-caption`), which is a sentence ABOUT the picture rather than part of
 * it. Everything the picture is made of counts, so a word cloud whose words are
 * SVG but whose accessibility key is an HTML list is `hybrid`, and its
 * `renderNote` says so — more useful than a rounded-off `svg` would be.
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
 * Chrome that sits INSIDE the picture but is not part of it. The read-as caption
 * is a sentence about the chart (chart-family.js `captionEl`); counting its prose
 * would make every captioned SVG chart read as hybrid.
 */
const CHROME_SEL = '.chart-caption';

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

/**
 * Render a deck through the emulator and return the path of its HTML sidecar —
 * the export surface, with mermaid already baked to SVG.
 * (Same idiom as tools/check-svg-scaling.js, which measures the same sidecar.)
 */
function renderSidecar(deckFile) {
  const base = path.join(os.tmpdir(), `render-nature-${path.basename(deckFile, '.md')}-${process.pid}`);
  const pdf = `${base}.pdf`;
  execFileSync(process.execPath, [EMULATOR, deckFile, pdf, 'indaco', '-q'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], timeout: 10 * 60_000,
  });
  const html = `${base}.html`;
  if (!fs.existsSync(html)) throw new Error(`emulator produced no HTML sidecar for ${deckFile}`);
  return { html, pdf };
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
      const { html, pdf } = renderSidecar(comp.deck);
      temps.push(html, pdf);
      const page = await browser.newPage();
      await page.setViewport({ width: 1280, height: 720 });
      await page.goto(`file://${html}`, { waitUntil: 'networkidle0', timeout: 120_000 });
      const records = await page.evaluate((GEOM, CHROME, PICTURE) => {
        const geom = new Set(GEOM);
        // Zero client rects means an ancestor is `display:none` (the state-chart
        // `<ol>` after the browser pass hides it) — invisible content is not part
        // of the picture, whatever the markup says.
        const shown = (el) => !!el && el.getClientRects().length > 0
          && getComputedStyle(el).visibility !== 'hidden';
        const out = [];
        for (const sec of document.querySelectorAll('section[data-class]')) {
          // `_class: state-chart lr` renders as `data-class="state-chart lr"` —
          // the component name is the FIRST token; the rest are modifiers.
          const name = sec.dataset.class.trim().split(/\s+/)[0];
          const pictures = [...sec.querySelectorAll(PICTURE)];
          const rec = { name, svgChars: 0, svgGeom: 0, htmlChars: 0, htmlMarks: 0, sections: 1, pictures: pictures.length, hosts: {} };
          for (const picture of pictures) {
            const walker = document.createTreeWalker(picture, NodeFilter.SHOW_TEXT);
            for (let n = walker.nextNode(); n; n = walker.nextNode()) {
              const text = (n.nodeValue || '').trim();
              if (!text) continue;
              const host = n.parentElement;
              if (!shown(host) || host.closest(CHROME)) continue;
              const inSvg = !!host.closest('svg');
              const key = host.tagName.toLowerCase()
                + (host.getAttribute('class') ? `.${host.getAttribute('class').split(/\s+/)[0]}` : '');
              rec.hosts[`${inSvg ? 'svg:' : 'html:'}${key}`] = (rec.hosts[`${inSvg ? 'svg:' : 'html:'}${key}`] || 0) + text.length;
              if (inSvg) rec.svgChars += text.length; else rec.htmlChars += text.length;
            }
            for (const el of picture.querySelectorAll('*')) {
              if (el.closest(CHROME)) continue;
              const tag = el.tagName.toLowerCase();
              const inSvg = !!el.closest('svg');
              if (inSvg && geom.has(tag) && shown(el)) rec.svgGeom += 1;
              if (!inSvg && el.hasAttribute('data-mark') && shown(el)) rec.htmlMarks += 1;
            }
          }
          out.push(rec);
        }
        return out;
      }, GEOMETRY, CHROME_SEL, PICTURE_SEL);
      await page.close();
      // A component's own gallery also carries prose meta-slides and, for a few,
      // sibling components — attribute only the sections that ARE this component.
      for (const rec of records) {
        if (rec.name !== comp.name) continue;
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

module.exports = { classify, mergeCounts, derive, vizComponents, VIZ_BUCKETS, GEOMETRY, CHROME_SEL, PICTURE_SEL };
