#!/usr/bin/env node
/**
 * Export a deck's chart(s) as standalone image files — SVG for the vector
 * charts, PNG for the HTML/CSS ones.
 *
 * It renders the deck through the SAME path the Drawing Board uses
 * (`window.LatticePlayground.render` + the runtime, in a headless Chromium),
 * with each section pinned to its real box so container-query layouts resolve.
 * Then, per chart:
 *   - Keyed charts (pie/radar/map/quadrant/funnel) are a single self-contained
 *     `<svg>`: flatten the computed paint/text styles inline (so the detached
 *     file needs no theme CSS — lib/.../standalone-svg.js) + embed the used fonts
 *     → a `.svg` that opens anywhere.
 *   - Every other chart-frame slide (gantt/kanban/progress/journey/…) is HTML/CSS
 *     or mixed, so we SCREENSHOT its container element → a `.png`, cropped to the
 *     content. This is the headless/automation surface.
 *
 * The Drawing Board's "Export chart" button does the same job in the browser: SVG
 * via this shared core, PNG via `html-to-image` (it rasterizes these charts
 * faithfully — see docs/src/components/studio/export/deck-export.js). This CLI is the no-browser path. See
 * chart-family.docs.md § "Standalone export".
 *
 * Usage:
 *   node tools/export-chart-svg.js <deck.md> [options]
 *     --slide N        1-based slide number to pull the chart from (default: first
 *                      slide that has a chart)
 *     --chart I        0-based index when a slide has multiple charts (default 0)
 *     --theme NAME     theme/palette to render with (default: deck front-matter, else indaco)
 *     --mode light|dark   canvas mode (default light)
 *     -o, --out FILE   output path (default: <deck>-slideN.svg|.png in cwd; the
 *                      extension is forced to match the chart's tier)
 *     --all            export every chart in the deck (-> <deck>-sNN-cMM.svg|.png)
 *
 * Needs a Chromium (CHROME_PATH or the puppeteer cache) — like every render here.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const puppeteer = require('puppeteer');
const { flattenSvgStyles, collectFontFamilies, finalizeStandaloneSvg } = require('../lib/components/chart/_chart-family/standalone-svg.js');
const { buildChartFontFaceCss } = require('./lib/chart-font-embed.js');

const ROOT = path.join(__dirname, '..');

function parseArgs(argv) {
  const a = { slide: null, chart: 0, theme: null, mode: 'light', out: null, all: false };
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--slide') a.slide = Number(argv[++i]);
    else if (t === '--chart') a.chart = Number(argv[++i]);
    else if (t === '--theme') a.theme = argv[++i];
    else if (t === '--mode') a.mode = argv[++i];
    else if (t === '-o' || t === '--out') a.out = argv[++i];
    else if (t === '--all') a.all = true;
    else pos.push(t);
  }
  a.deck = pos[0];
  return a;
}

/** Best-effort path to a Chromium the sandbox already has (mirrors screenshot.js). */
function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  const roots = [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome'];
  for (const root of roots) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter(d => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

/** Front-matter `theme:` of a deck, or null. */
function frontmatterTheme(src) {
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const t = m[1].match(/^\s*theme:\s*(\S+)/m);
  return t ? t[1] : null;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (!a.deck) {
    console.error('usage: node tools/export-chart-svg.js <deck.md> [--slide N] [--chart I] [--theme NAME] [--mode light|dark] [-o out.svg] [--all]');
    process.exit(2);
  }
  const deckPath = path.resolve(a.deck);
  const src = fs.readFileSync(deckPath, 'utf8');
  const theme = a.theme || frontmatterTheme(src) || 'indaco';
  // The render seam: docs/public/playground/lattice-playground.js defines
  // window.LatticePlayground.render(md, theme) -> {html, css}. It is a BUILT
  // bundle synced from lib/ (docs/scripts/sync-playground-assets.mjs) — a stale
  // bundle exports stale output, so rebuild+sync before trusting an export.
  const bundlePath = path.join(ROOT, 'docs', 'public', 'playground', 'lattice-playground.js');
  const bundle = fs.readFileSync(bundlePath, 'utf8');
  // The engine CSS the docs site loads as page stylesheets (render() returns only
  // deck HTML, not the base/theme CSS). The chart's tokens (--chart-cat-N-hue,
  // --text-body) + the `.chart-key-*` rules live here; without them the detached
  // chart computes black/serif.
  const latticeCss = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
  const themePath = path.join(ROOT, 'themes', `${theme}.css`);
  if (!fs.existsSync(themePath)) { console.error(`unknown theme '${theme}' (no themes/${theme}.css)`); process.exit(2); }
  const themeCss = fs.readFileSync(themePath, 'utf8');

  // slideBox: pin each section to its intrinsic @size box so container-type:size
  // resolves (chart text font-family/fill don't depend on it, but a collapsed
  // container can drop some computed values — cheap insurance, mirrors the host).
  const slideBox = '.lattice>section{display:block;width:1280px;height:720px;container-type:size;}';

  const browser = await puppeteer.launch({
    executablePath: resolveChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--hide-scrollbars'],
  });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 2 });
    await page.setContent('<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>', { waitUntil: 'load' });
    await page.addScriptTag({ content: bundle });

    // Render via the shared seam, then mount the slides + the engine CSS.
    const count = await page.evaluate((args) => {
      const PG = window.LatticePlayground;
      if (!PG || typeof PG.render !== 'function') throw new Error('LatticePlayground.render unavailable (playground bundle did not load)');
      const out = PG.render(args.src, args.theme);
      for (const css of [args.slideBox, args.latticeCss, args.themeCss, out.css || '']) {
        const s = document.createElement('style');
        s.textContent = css;
        document.head.appendChild(s);
      }
      // Single-file themes resolve light/dark via light-dark(); force the canvas
      // scheme so dark resolves the dark value (mirrors the Drawing Board's
      // `colorScheme: mode`). The chart's `fill`/text colours then compute dark.
      document.documentElement.style.colorScheme = args.mode === 'dark' ? 'dark' : 'light';
      document.body.innerHTML = out.html || '';
      return document.querySelectorAll('.lattice > section').length;
    }, { src, theme, mode: a.mode, slideBox, latticeCss, themeCss });

    if (!count) throw new Error('deck rendered no slides');
    // Let the runtime settle (FIT/mermaid bootstrap) — charts are pre-rendered in
    // the HTML, so a short tick is enough.
    await new Promise(r => setTimeout(r, 350));

    // Enumerate charts: [{slide (1-based), chart (0-based)}] for every keyed chart.
    // Scope to the FOUR keyed layouts (their svgs are the one-unit diagram+key
    // this feature exports), keyed off the section class — NOT aria-hidden: the
    // quadrant's own svg is aria-hidden (its a11y rides text/desc), so filtering
    // that out would wrongly drop it. Same set the Drawing Board gate uses, and
    // it skips aux overlays (e.g. the state-chart edge svg).
    const index = await page.evaluate(() => {
      // Keyed charts render as a single self-contained <svg> → export as vector.
      // Every OTHER chart-frame slide (gantt/kanban/progress/journey/… — HTML/CSS
      // or mixed) → screenshot its container to PNG. The engine renders these
      // correctly (the section is pinned to its real box so container queries
      // resolve), so a real element screenshot captures them — exactly how the
      // chart galleries are produced.
      const KEYED = ['piechart', 'radar', 'map', 'quadrant', 'funnel'];
      const out = [];
      const sections = Array.from(document.querySelectorAll('.lattice > section'));
      sections.forEach((sec, si) => {
        if (!sec.classList.contains('chart-frame')) return;
        const svgs = KEYED.some(c => sec.classList.contains(c))
          ? Array.from(sec.querySelectorAll('svg[viewBox]')) : [];
        if (svgs.length) svgs.forEach((_, ci) => { out.push({ slide: si + 1, chart: ci, kind: 'svg' }); });
        else out.push({ slide: si + 1, chart: 0, kind: 'png' });
      });
      return out;
    });
    if (!index.length) throw new Error('no charts found in this deck');

    // Which targets to export.
    let targets;
    if (a.all) targets = index;
    else if (a.slide != null) targets = [{ slide: a.slide, chart: a.chart }];
    else targets = [index[0]]; // first chart anywhere

    // Expose the shared flatten fn in the page once.
    await page.evaluate(`window.__flattenSvgStyles = ${flattenSvgStyles.toString()};`);

    const deckBase = path.basename(deckPath).replace(/\.md$/i, '');
    const sectionHandles = await page.$$('.lattice > section');
    const written = [];
    for (const t of targets) {
      // PNG tier — screenshot the chart's container element. The engine has
      // rendered it at its real box, so this captures real pixels (no in-browser
      // DOM-clone, which collapses container-query layouts to blank).
      if (t.kind === 'png') {
        const handle = sectionHandles[t.slide - 1];
        if (!handle) { console.warn(`! slide ${t.slide}: not found, skipped`); continue; }
        const outPath = a.out && !a.all
          ? path.resolve(`${a.out.replace(/\.(svg|png)$/i, '')}.png`)
          : path.resolve(a.all
            ? `${deckBase}-s${String(t.slide).padStart(2, '0')}-c00.png`
            : `${deckBase}-slide${t.slide}.png`);
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        // Keep the section at its full box (container queries need the fixed
        // height to resolve) but CLIP the capture to where content actually ends:
        // short charts (gantt/kanban) otherwise trail a half-slide of dead canvas.
        const box = await handle.boundingBox();
        const contentH = await page.evaluate((idx) => {
          const sec = document.querySelectorAll('.lattice > section')[idx];
          const top = sec.getBoundingClientRect().top;
          const full = sec.getBoundingClientRect().height;
          let bottom = top;
          sec.querySelectorAll('*').forEach((el) => {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0) return;
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0) bottom = Math.max(bottom, r.bottom);
          });
          const padB = parseFloat(getComputedStyle(sec).paddingBottom) || 0;
          return Math.min(full, Math.ceil((bottom - top) + Math.min(padB, 48)));
        }, t.slide - 1);
        await page.screenshot({ path: outPath, clip: { x: box.x, y: box.y, width: box.width, height: contentH } });
        const bytes = fs.statSync(outPath).size;
        written.push({ outPath, bytes });
        console.log(`✓ slide ${t.slide} (image) → ${path.relative(process.cwd(), outPath)} (${(bytes / 1024).toFixed(1)} KB)`);
        continue;
      }
      const markup = await page.evaluate((sel) => {
        const sections = Array.from(document.querySelectorAll('.lattice > section'));
        const sec = sections[sel.slide - 1];
        if (!sec) return null;
        const svgs = Array.from(sec.querySelectorAll('svg[viewBox]'));
        const svg = svgs[sel.chart];
        if (!svg) return null;
        const flat = window.__flattenSvgStyles(svg, window);
        return new XMLSerializer().serializeToString(flat);
      }, t);
      if (!markup) { console.warn(`! slide ${t.slide} chart ${t.chart}: not found, skipped`); continue; }

      const families = collectFontFamilies(markup);
      const fontFaceCss = buildChartFontFaceCss(families);
      const svgDoc = finalizeStandaloneSvg(markup, { fontFaceCss });

      const outPath = a.out && !a.all
        ? path.resolve(a.out)
        : path.resolve(a.all
          ? `${deckBase}-s${String(t.slide).padStart(2, '0')}-c${String(t.chart).padStart(2, '0')}.svg`
          : `${deckBase}-slide${t.slide}.svg`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, svgDoc, 'utf8');
      written.push({ outPath, families, bytes: Buffer.byteLength(svgDoc) });
      console.log(`✓ slide ${t.slide} chart ${t.chart} → ${path.relative(process.cwd(), outPath)} (${(written[written.length - 1].bytes / 1024).toFixed(1)} KB, fonts: ${families.join(', ') || 'none'})`);
    }
    if (!written.length) { console.error('nothing exported'); process.exit(1); }
  } finally {
    await browser.close();
  }
}

main().catch(e => { console.error('export-chart-svg failed:', e.message); process.exit(1); });
