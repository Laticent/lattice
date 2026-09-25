#!/usr/bin/env node
/**
 * check-viz-render — the SCOPED-CSS black-fill guard (born from the #956
 * map/quadrant/radar iOS-black bug).
 *
 * THE GAP THIS CLOSES. Every other color check in the tree renders through the
 * UNSCOPED emulator/PDF path (each `section` IS the page, tokens land directly).
 * The docs-site hosts a human actually taps — playground / Studio / Player —
 * render WITHOUT Marp's `<foreignObject>`, so the engine re-scopes every selector
 * under `article.lattice > section` via `packTheme` (lib/engine/css.js) and composes
 * with `composeCss`. #956 was a bug in THAT scoper: a chart rule led by
 * `:is(section.map, figure.chart-frame)` was mis-scoped as a slide descendant,
 * so a component-local token it defined (`--map-base`, quadrant's `--cell-*`,
 * radar's base) stayed undefined and every SVG fill reading it fell to SVG's
 * black initial value. color-parity.test.js could not see it — it never renders
 * the scoped path. This tool does.
 *
 * WHAT IT DOES. Renders the chart gallery deck through the REAL scoped
 * `composeCss()` output a browser loads, in headless Chromium, across a
 * representative theme × {light, dark} matrix, and reads
 * `getComputedStyle().fill/stroke` (plus gradient `<stop>` stop-color) on every
 * SVG paintable element. Any paint that computes to opaque black `rgb(0, 0, 0)`
 * is a candidate: black is the SVG initial value a dropped/undefined `var()`
 * color falls to, so a NEW black where a themed color belongs is the signature
 * of a scoping/token regression.
 *
 * SCOPE. It renders the whole chart gallery, so every SVG chart on it is inspected
 * (an earlier version of this line named seven families; the gallery has since
 * grown). The HTML/CSS-layout charts emit no SVG (a dropped `var()` there goes
 * transparent, not black), and Mermaid diagrams bake INLINE fills at mmdc time
 * (immune to the scoped-`var()` mechanism; covered by test/integration/mermaid/).
 *
 * A SECOND PASS, COPY PARITY (#2344), covers the surfaces that show a chart
 * OUTSIDE its slide — Read · Article (flat) and a stylesheet-free SVG (baked) —
 * and catches the HTML charts too, because it looks for a LOST paint rather than a
 * black one. See `collectCopies` below and
 * engineering/decisions/2026-09-24-one-style-delivery-spine.md.
 *
 * THE BASELINE RATCHET (mirrors bench:bless + the check-ownership allowlists).
 * Some SVG paint is legitimately black — a max-contrast text ink
 * (`light-dark(black, white)` on the light canvas), a diagram hairline. Those
 * live in test/viz-render/black-baseline.json, snapshotted from a known-good
 * tree. The gate FAILS on any black NOT in the baseline (a regression) AND on a
 * STALE baseline entry that no longer appears (so the list can't rot). Re-bless
 * ONLY with the change that justifies it: `node tools/check-viz-render.js --bless`.
 *
 * Usage:
 *   node tools/check-viz-render.js            # gate: exit 1 on an unsanctioned black
 *   node tools/check-viz-render.js --bless    # rewrite the baseline (justify in the PR)
 *   node tools/check-viz-render.js --json      # machine-readable findings
 *
 * Needs a Chromium (CHROME_PATH or the puppeteer cache) — same as the other
 * integration renders. On a headless host with no browser it SKIPS (exit 0) with
 * a loud notice, never a false green claim (HARD RULE #23).
 */

const fs = require('node:fs');
const path = require('node:path');
const { resolveChrome } = require('./lib/resolve-chrome');

const ROOT = path.join(__dirname, '..');
const BASELINE_FILE = path.join(ROOT, 'test', 'viz-render', 'black-baseline.json');

// The theme × scheme matrix. Two themes with different brand hues so a
// theme-specific token gap can't hide behind indaco; both canvases because a
// token can resolve on one scheme and drop on the other (light-dark()).
// `concrete` earns its place: its hues are the darkest-on-light in the set, and
// it is where a graphical ink first fell below the text floor (3.04:1) while
// indaco sailed through at 6.72:1. A two-theme matrix that excludes the
// hard case is a matrix that agrees with you.
const THEMES = ['indaco', 'cuoio', 'concrete'];
const SCHEMES = ['light', 'dark'];

// The deck whose slides carry SVG kernels that paint themed color through the
// scoped path. SCOPE NOTE (checker H1/M1): only the SVG-painting chart components
// are inspectable by the BLACK pass — the HTML/CSS-layout charts
// (gantt/kanban/progress/roadmap/timeline-list) emit no SVG for it (the copy-parity
// pass covers them), and diagram/Mermaid is NOT rendered to SVG in the preview path (mmdc bakes
// it at build time, with INLINE `fill:#…`, so it is immune to the scoped-`var()`
// #956 mechanism and is covered separately by test/integration/mermaid/). This
// guard therefore targets exactly the surface where the #956 bug can occur.
const DECKS = [{ file: path.join(ROOT, 'lib', 'components', 'chart', 'chart.gallery.md'), family: 'chart' }];

// TEXT that sits on the PAGE CANVAS rather than on a chart's own fill, and must
// therefore clear WCAG AA (4.5:1) against it.
//
// The chart categorical inks (`--chart-cat-N-ink`) were designed and gated as
// GRAPHICAL inks at the 3:1 floor (WCAG 1.4.11) — dots, strokes, borders. The
// moment one of them carries type on the canvas it is a text ink and needs 4.5,
// and nothing else in the tree checks that: `checkCatContrast` reads the
// engine-wide `--cat-*` tokens from themes/, never the chart palette derived in
// chart-family.css. That gap shipped a quadrant name at 3.04:1 on `concrete`
// light, down from 10.56:1.
//
// Add a selector here when a chart starts painting text on the canvas. It is an
// allowlist, so a NEW canvas-text class is a deliberate act, not a silent one.
const CANVAS_TEXT = [
  { selector: '.quadrant-label', floor: 4.5, what: 'quadrant name' },
];

// SVG paint that is legitimately absent — never a "dropped color" signal.
const TRANSPARENT = new Set(['none', 'transparent', 'rgba(0, 0, 0, 0)']);

// Only LEAF paintable shapes carry a visible fill/stroke. Structural elements
// (defs, gradients, <stop>, <g> groups, desc/title) compute fill:black by
// default but paint nothing, so they are pure noise for a dropped-color check.
const PAINTABLE_TAGS = new Set(['path', 'rect', 'circle', 'ellipse', 'polygon', 'polyline', 'line', 'text', 'tspan', 'use']);

/**
 * A stable key for a black finding: family + component + element tag.class +
 * property + SCHEME. NOT the theme (a legit black ink is black on both indaco and
 * cuoio) and NOT the slide index (position shifts as galleries grow) — but the
 * scheme IS part of the key: a `light-dark(black, white)` ink is black on light
 * and white on dark, so a light-only sanction must NOT excuse a black on the dark
 * canvas (where that same element must be white — a real dropped-token symptom).
 * Coarse enough to be durable, specific enough that a real regression can't alias
 * onto a sanctioned entry (checker H2 + M3).
 */
function findingKey(f) {
  // A copy-parity finding carries its MODE (flat / baked); the scoped black-paint
  // findings predate modes and keep their original key, so the baseline stays valid.
  const mode = f.mode && f.mode !== 'scoped' ? `${f.mode}:` : '';
  return `${mode}${f.family}/${f.component}/${f.selector}/${f.property}/${f.scheme}`;
}

async function collectBlacks() {
  const chrome = resolveChrome();
  if (!chrome) return { skipped: true, blacks: [] };

  // Lazy-require so --help / no-browser paths don't need the dep resolved.
  const puppeteer = require('puppeteer');
  const engine = require('../lib/engine');
  const { composeCss } = require('../lib/engine/css.js');
  const baseLatticeCss = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');

  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const blacks = [];
  const dimText = [];
  try {
    for (const deck of DECKS) {
      const src = fs.readFileSync(deck.file, 'utf8');
      for (const theme of THEMES) {
        const themeCss = fs.readFileSync(path.join(ROOT, 'themes', `${theme}.css`), 'utf8');
        const out = engine.render(src, theme, { preview: true });
        // THE PRODUCTION SURFACE: the scoped stylesheet a browser host loads,
        // not the unscoped emulator/PDF CSS.
        const css = composeCss({ themeCss, baseLatticeCss, sizeName: out.sizeName });
        for (const scheme of SCHEMES) {
          const page = await browser.newPage();
          await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
          const doc =
            `<!doctype html><html><head><style>:root{color-scheme:${scheme}}` +
            `${css}\n.lattice>section{width:1280px;height:720px}</style></head>` +
            `<body><article class="lattice" data-scheme="${scheme}">${out.html}</article></body></html>`;
          await page.setContent(doc, { waitUntil: 'networkidle0' });
          const found = await page.evaluate((TRANSPARENT_ARR, PAINTABLE_ARR, scheme) => {
            const transparent = new Set(TRANSPARENT_ARR);
            const paintable = new Set(PAINTABLE_ARR);
            const black = (v) => v === 'rgb(0, 0, 0)' || v === '#000000' || v === 'black';
            const out = [];
            for (const el of document.querySelectorAll('.lattice svg *')) {
              const tag = el.tagName.toLowerCase();
              const section = el.closest('section');
              const component = section
                ? [...section.classList].find((c) => c !== 'lattice') || section.className || '?'
                : '?';
              // The element's own most-specific class (or tag), PREFIXED with the
              // tag — so two different elements sharing a first class can't alias
              // onto one sanction key (checker M3).
              //
              // A CLASSLESS element gets its nearest classed ancestor as a
              // prefix. Wrapped SVG labels are `<text class="…"><tspan>` — the
              // tspan carries no class of its own and inherits the text's fill,
              // so a bare `tspan.` key would alias EVERY unclassed tspan in
              // every chart onto one sanction. One legitimately-black ink would
              // then mask a genuinely dropped color anywhere else.
              // When neither exists the key is the BARE TAG, with no trailing
              // dot: `tspan.` reads like a class that happens to be empty and
              // still aliases every classless tspan, which is the masking this
              // guards against. `tspan` says plainly that the sanction is for
              // an unattributable element — and that is a reason to look.
              const own = el.getAttribute('class');
              let selector = tag;
              if (own) {
                selector = `${tag}.${own.split(/\s+/)[0]}`;
              } else {
                const host = el.parentElement?.closest('svg [class]');
                const hostClass = host?.getAttribute('class');
                if (hostClass) {
                  selector = `${host.tagName.toLowerCase()}.${hostClass.split(/\s+/)[0]}>${tag}`;
                }
              }

              // A gradient <stop> paints no shape but feeds a shape's fill; a
              // themed stop-color that dropped to black is a real #956-family
              // regression (checker M2). Stops have no bbox — check stop-color
              // directly and skip the paintable/bbox path.
              if (tag === 'stop') {
                const sc = getComputedStyle(el).stopColor;
                if (!transparent.has(sc) && black(sc)) out.push({ component, selector, property: 'stop-color', scheme });
                continue;
              }

              if (!paintable.has(tag)) continue;
              // A zero-area element paints nothing — skip so an off-screen/empty
              // shape can't seed a phantom black. getBBox can throw on a
              // not-yet-laid-out/detached node in some engine states — treat a
              // throw as "unknown geometry, keep checking" rather than crashing
              // the whole run (checker L1).
              let box = null;
              try {
                box = el.getBBox ? el.getBBox() : null;
              } catch {
                box = null;
              }
              if (box && box.width === 0 && box.height === 0) continue;

              // A <line>/<polyline> has no fillable area — it paints via stroke
              // only, so its (always-black-by-default) fill is never visible.
              const props = tag === 'line' || tag === 'polyline' ? ['stroke'] : ['fill', 'stroke'];
              const cs = getComputedStyle(el);
              for (const property of props) {
                const v = cs[property];
                if (transparent.has(v)) continue;
                if (black(v)) out.push({ component, selector, property, scheme });
              }
            }
            return out;
          }, [...TRANSPARENT], [...PAINTABLE_TAGS], scheme);
          for (const f of found) blacks.push({ family: deck.family, ...f });

          // Canvas TEXT must clear its contrast floor against the slide it sits
          // on. Measured by painting each color onto a 1x1 canvas and reading
          // the pixel back — `getComputedStyle` hands back `oklab()`/`color()`
          // for a `color-mix`, and parsing digits out of that as if they were
          // RGB is how you get confident nonsense.
          const dim = await page.evaluate((SPECS) => {
            const cv = document.createElement('canvas'); cv.width = cv.height = 1;
            const ctx = cv.getContext('2d', { willReadFrequently: true });
            const px = (c) => {
              ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, 1, 1);
              ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
              const d = ctx.getImageData(0, 0, 1, 1).data;
              return [d[0], d[1], d[2]];
            };
            const lum = ([r, g, b]) => {
              const f = (c) => { const u = c / 255; return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4; };
              return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
            };
            const ratio = (a, b) => { const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
            const out = [];
            for (const spec of SPECS) {
              for (const el of document.querySelectorAll(spec.selector)) {
                const sec = el.closest('section');
                if (!sec) continue;
                let bg = getComputedStyle(sec).backgroundColor;
                if (/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) bg = getComputedStyle(sec).getPropertyValue('--bg').trim() || '#ffffff';
                const r = ratio(px(getComputedStyle(el).fill), px(bg));
                if (r < spec.floor) out.push({ selector: spec.selector, what: spec.what, floor: spec.floor, ratio: Math.round(r * 100) / 100 });
              }
            }
            return out;
          }, CANVAS_TEXT);
          for (const d of dim) {
            const key = `${theme}/${scheme}/${d.selector}/${d.ratio}`;
            if (!dimText.some((x) => x.key === key)) dimText.push({ key, theme, scheme, ...d });
          }
          await page.close();
        }
      }
    }
  } finally {
    await browser.close();
  }
  return { skipped: false, blacks, dimText };
}

// ─────────────────────────────────────────────────────────────────────────────
// COPY PARITY — the two surfaces that show a chart OUTSIDE the slide it was drawn on.
//
// The pass above renders slides only, in the preview's scoped CSS. Two more
// surfaces show the same chart somewhere else, each with its own way of getting
// the deck's CSS (engineering/decisions/2026-09-24-one-style-delivery-spine.md):
//
//   · FLAT — the exported player's Read · Article, which lifts each chart out of its
//     slide into a `<figure>`. It gets the engine's flat pack (`composeCss({ flat })`).
//     #2344 shipped every chart there black: this pass would have failed on it.
//   · BAKED — a chart SVG passed through `bakeSvg` (standalone-svg.js): computed paint
//     inlined, tokens frozen onto the root. The same call the Studio makes, shown where there is
//     NO stylesheet at all: the Studio's PDF/PPTX rasterizer and "download as SVG".
//
// THE SLIDE IS THE REFERENCE. Every element in the slide is stamped with an index
// before the copy is made, so the copy carries the same stamp and each element meets
// its own twin. A finding is a paint the slide HAS and the copy LOSES: a color that
// becomes none or black, a background that becomes transparent. A copy may change a
// color (the article follows the page's scheme); it may not drop one. That rule also
// sees an HTML chart (roadmap, kanban) that lost its CSS, which goes transparent
// rather than black and so is invisible to the black-paint pass.
//
// KNOWN LIMITS of the rule, so nobody reads more coverage into it than it has:
//   · text COLOR is inherited. An HTML text color that loses its token inherits the
//     article's body ink, which is a changed color, so it is allowed. The rule sees a
//     lost text color only where it falls to black or nothing. (SVG fills do fall to
//     black, which is how #2344 surfaced.)
//   · a fill of `url(#g)` counts as a paint whether or not `#g` exists in the copy. A
//     gradient whose STOPS lost their color is caught (stops are stamped); a gradient
//     the copy dropped entirely is not.
//   · `fill-opacity` / `stroke-opacity` of 0 are not read.
//
// Not the full player: the article is built by the real `projectDeckToProse` and
// styled by the real flat pack plus `playerCss()`, but without the player's sanitizer
// and without `themeDualMode`'s light/dark rewrite. It gates the stylesheet's SHAPE.
// ─────────────────────────────────────────────────────────────────────────────

const STAMP = 'data-vr';

/**
 * In the page: every stamped element under `root` → its paints, plus a key for
 * reporting. Serialized into `page.evaluate`, so it must stay closure-free.
 */
function paintsIn(rootSelector, PAINTABLE_ARR, STAMP_ATTR) {
  const paintable = new Set(PAINTABLE_ARR);
  const out = {};
  // DRAWN is recorded, never used to skip a copy. Computed paint and getBBox() are
  // both blind to a copy that is not drawn at all: a checker hid every chart in the
  // article with `display:none` and the pass reported the same 7,218 clean pairs.
  // `checkVisibility` sees display, visibility and opacity, on SVG and HTML alike.
  const seen = (el) => (el.checkVisibility ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true);
  for (const el of document.querySelectorAll(`${rootSelector} [${STAMP_ATTR}]`)) {
    const tag = el.tagName.toLowerCase();
    const isSvg = el instanceof SVGElement;
    const cs = getComputedStyle(el);
    const paints = {};
    let drawn;
    if (isSvg) {
      if (tag === 'stop') {
        paints['stop-color'] = cs.stopColor;
        drawn = true; // a stop never renders on its own; its gradient's shape does
      } else if (paintable.has(tag)) {
        let box = null;
        try { box = el.getBBox ? el.getBBox() : null; } catch { box = null; }
        drawn = seen(el) && !(box && box.width === 0 && box.height === 0);
        if (tag !== 'line' && tag !== 'polyline') paints.fill = cs.fill;
        paints.stroke = cs.stroke;
      } else continue;
    } else {
      drawn = seen(el) && el.getClientRects().length > 0;
      paints['background-color'] = cs.backgroundColor;
      paints['background-image'] = cs.backgroundImage;
      paints.color = cs.color;
    }
    const section = el.closest('section');
    const component = section ? [...section.classList].find((c) => c !== 'lattice') || '?' : '';
    const own = el.getAttribute('class');
    out[el.getAttribute(STAMP_ATTR)] = { component, selector: own ? `${tag}.${own.split(/\s+/)[0]}` : tag, drawn, paints };
  }
  return out;
}

/** Classify a computed paint: 'none' (paints nothing), 'black', or 'paint'. */
function paintClass(v) {
  const t = String(v || '').trim();
  if (!t || t === 'none' || t === 'transparent') return 'none';
  if (/^rgba\(.*,\s*0\)$/.test(t) || /\/\s*0\)$/.test(t)) return 'none';
  if (t === 'rgb(0, 0, 0)' || t === 'black' || t === '#000000') return 'black';
  return 'paint';
}

/**
 * The copy LOST a paint the slide had. Pure, so the unit suite can pin the rule.
 * A background only counts as lost when it goes to nothing (a copy that turns a
 * background black is a changed color, which is allowed); a fill, stroke, stop or
 * text color counts when it goes to nothing OR to black, because black is what an
 * SVG paint falls to when its `var()` resolves to nothing.
 */
function lostPaint(property, ref, copy) {
  const r = paintClass(ref);
  const c = paintClass(copy);
  if (r !== 'paint') return false;
  if (property === 'background-color' || property === 'background-image') return c === 'none';
  return c === 'none' || c === 'black';
}

function compareCopies(mode, scheme, ref, copy) {
  const out = [];
  const pairs = {}; // component → pairs compared, for the per-component floor
  for (const [id, twin] of Object.entries(copy)) {
    const orig = ref[id];
    if (!orig?.drawn) continue; // nothing on the slide to keep
    pairs[orig.component] = (pairs[orig.component] || 0) + 1;
    const base = { family: 'chart', mode, component: orig.component, selector: orig.selector, scheme };
    if (!twin.drawn) {
      out.push({ ...base, property: 'drawn', from: 'drawn', to: 'not drawn' });
      continue;
    }
    for (const [property, value] of Object.entries(orig.paints)) {
      if (!(property in twin.paints)) continue;
      if (lostPaint(property, value, twin.paints[property])) out.push({ ...base, property, from: value, to: twin.paints[property] });
    }
  }
  return { lost: out, pairs };
}

/**
 * THE ARM OPTIONS exist so the integration test can prove this pass FAILS on each shape
 * it guards, cheaply (one theme, one scheme): `flatPack: false` is #2344 (the preview's
 * slide-scoped pack), `extraFlatCss` hides the copy (the blind spot a checker found in
 * the first draft), `freezeTokens: false` is #2210 (a bake that leaves `var()` behind).
 * The gate itself never passes them.
 *
 * Render every chart as a FLAT copy (Read · Article) and a BAKED copy (a detached,
 * stylesheet-free SVG) and return each paint the copy lost. `flatPack: false` feeds
 * the article the preview's scoped pack instead — the shape #2344 shipped — and the
 * integration test's arm runs it to prove this pass can fail. `readingSheet: false` is the
 * Studio Reading view before it had a deck sheet at all (followups.d/2344-p1).
 *
 * `unpaired` lists every chart that SHOULD have had a copy and compared nothing: a
 * figure the article re-hosts (catalog `figure` svg / flow / spatial), and a component
 * with a stylesheet-styled SVG to bake. One global pair count cannot see a single chart
 * going missing; this can. The gate fails on it, and it is not baselinable.
 */
async function collectCopies({ flatPack = true, themes = THEMES, schemes = SCHEMES, extraFlatCss = '', extraReadingCss = '', readingSheet = true, freezeTokens = true } = {}) {
  const chrome = resolveChrome();
  if (!chrome) return { skipped: true, lost: [], compared: { flat: 0, baked: 0, reading: 0 }, unpaired: [] };
  const puppeteer = require('puppeteer');
  const { JSDOM } = require('jsdom');
  const engine = require('../lib/engine');
  const { composeCss } = require('../lib/engine/css.js');
  const { projectDeckToProse } = await import('../lib/transformers/prose-projection.mjs');
  const { playerCss } = await import('../lib/export/player-core.mjs');
  const { PROJECTION } = await import('../lib/core/projection-catalog.generated.mjs');
  const { rehostContainerCss } = await import('../lib/export/player-core.mjs');
  const { collectBaseSelectors, scopeReHostedCss } = require('../lib/export/player-prune.js');
  const REHOSTED = new Set(['svg', 'flow', 'spatial']);
  const bakeSrc = fs.readFileSync(path.join(ROOT, 'lib', 'components', 'chart', '_chart-family', 'standalone-svg.js'), 'utf8');
  const baseLatticeCss = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
  const lpCss = playerCss();

  const browser = await puppeteer.launch({ executablePath: chrome, args: ['--no-sandbox'] });
  const lost = [];
  // How many slide/copy element pairs each mode compared. A pass that compared
  // nothing would report no losses, so the gate asserts these are not zero.
  const compared = { flat: 0, baked: 0, reading: 0 };
  const unpaired = [];
  try {
    for (const deck of DECKS) {
      const src = fs.readFileSync(deck.file, 'utf8');
      for (const theme of themes) {
        const themeCss = fs.readFileSync(path.join(ROOT, 'themes', `${theme}.css`), 'utf8');
        const out = engine.render(src, theme, { preview: true });
        // Stamp every element inside every slide, then build the article from the
        // stamped slides: each figure is a clone, so it carries its twin's stamp.
        const dom = new JSDOM(`<body>${out.html}</body>`);
        let n = 0;
        for (const el of dom.window.document.querySelectorAll('section *')) el.setAttribute(STAMP, String(++n));
        const slidesHtml = dom.window.document.body.innerHTML;
        const { articleHtml } = projectDeckToProse([...dom.window.document.querySelectorAll('section')]);
        const scoped = composeCss({ themeCss, baseLatticeCss, sizeName: out.sizeName });
        const flat = composeCss({ themeCss, baseLatticeCss, sizeName: out.sizeName, flat: flatPack }).replace(/article\.lattice\s*>\s*/g, '');
        // The schemes run side by side in one browser: each is independent, and the pass
        // is page-load bound, so this is most of its wall-clock cost.
        await Promise.all(schemes.map(async (scheme) => {
          // FLAT: slides and article in one flat document, as the player lays them out.
          const page = await browser.newPage();
          await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
          await page.setContent(
            `<!doctype html><html><head><style>:root{color-scheme:${scheme}}${flat}\nsection{width:1280px;height:720px}\n${lpCss}\n#lp-article{display:grid}\n${extraFlatCss}</style></head>` +
              // `data-lp-view=read-article` is what shows `#lp-doc`: `playerCss()` hides it in
            // every other view, and a hidden copy measures zero and would compare nothing.
            `<body data-lp-view="read-article"><div id="vr-slides">${slidesHtml}</div><div id="lp-doc"><article id="lp-article">${articleHtml}</article></div></body></html>`,
            { waitUntil: 'networkidle0' },
          );
          const flatRef = await page.evaluate(paintsIn, '#vr-slides', [...PAINTABLE_TAGS], STAMP);
          const flatCopy = await page.evaluate(paintsIn, '#lp-article', [...PAINTABLE_TAGS], STAMP);
          const flatCmp = compareCopies('flat', scheme, flatRef, flatCopy);
          compared.flat += Object.values(flatCmp.pairs).reduce((a, b) => a + b, 0);
          lost.push(...flatCmp.lost);
          const inDeck = new Set(Object.values(flatRef).map((r) => r.component));
          for (const c of inDeck) {
            if (REHOSTED.has(PROJECTION[c]?.figure) && !flatCmp.pairs[c]) unpaired.push({ mode: 'flat', theme, scheme, component: c });
          }
          await page.close();

          // READING: the Studio's in-app Reading view. The article sits in an APP document, so
          // it gets no whole-document sheet: only what `scopeReHostedCss` keeps of the same
          // flat pack, fenced by selector to the figures, plus `rehostContainerCss` — exactly
          // what `scopedArticleCss` (docs/…/article-projection.ts) builds. The prune's `isUsed`
          // is answered by querySelector against this page's own article, as the Studio does.
          const reading = await browser.newPage();
          await reading.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
          const articleDoc = `<body><article class="st-read-article">${articleHtml}</article></body>`;
          await reading.setContent(`<!doctype html><html><head></head>${articleDoc}</html>`);
          const bases = collectBaseSelectors(flat, { legacyPseudoElements: true });
          const usedBases = new Set(await reading.evaluate((list) => list.filter((b) => {
            try { return !!document.querySelector(b); } catch { return true; }
          }), bases));
          const readingCss = `${rehostContainerCss('.st-read-article')}\n${!readingSheet ? '' : scopeReHostedCss(flat, (b) => usedBases.has(b), { root: '.st-read-article', within: '.lp-figure', colorScheme: scheme }).css}`;
          await reading.setContent(
            `<!doctype html><html><head><style>${readingCss}\n.st-read-article{display:block;width:1100px}\n${extraReadingCss}</style></head>${articleDoc}</html>`,
            { waitUntil: 'networkidle0' },
          );
          const readingCopy = await reading.evaluate(paintsIn, '.st-read-article', [...PAINTABLE_TAGS], STAMP);
          const readingCmp = compareCopies('reading', scheme, flatRef, readingCopy);
          compared.reading += Object.values(readingCmp.pairs).reduce((a, b) => a + b, 0);
          lost.push(...readingCmp.lost);
          for (const c of inDeck) {
            if (REHOSTED.has(PROJECTION[c]?.figure) && !readingCmp.pairs[c]) unpaired.push({ mode: 'reading', theme, scheme, component: c });
          }
          await reading.close();

          // BAKED: bake every stylesheet-styled chart SVG on the preview's slides, then
          // show the baked clones in a page that carries no stylesheet at all.
          const live = await browser.newPage();
          await live.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
          await live.setContent(
            `<!doctype html><html><head><style>:root{color-scheme:${scheme}}${scoped}\n.lattice>section{width:1280px;height:720px}</style></head>` +
              `<body><article class="lattice">${slidesHtml}</article></body></html>`,
            { waitUntil: 'networkidle0' },
          );
          await live.addScriptTag({ content: `(function(){var module={exports:{}};${bakeSrc}\nwindow.__vrBake=module.exports;})();` });
          const bakeRef = await live.evaluate(paintsIn, '.lattice', [...PAINTABLE_TAGS], STAMP);
          const { baked, attempted, threw } = await live.evaluate((freeze) => {
            const out = [];
            const attempted = new Set();
            const threw = [];
            for (const svg of document.querySelectorAll('.lattice section svg')) {
              if (svg.querySelector('style') || svg.parentElement.closest('svg')) continue; // self-styled, or nested
              const sec = svg.closest('section');
              const component = sec ? [...sec.classList].find((c) => c !== 'lattice') || '?' : '?';
              // Only an SVG with a shape in it owes a baked copy. A state-chart's static
              // SVG is an empty edge layer (`<title>`, `<desc>`) the runtime draws into
              // later, so there is nothing of it to bake or to compare.
              if (svg.querySelector('path, rect, circle, ellipse, polygon, polyline, line, text, use')) attempted.add(component);
              try {
                const flatSvg = window.__vrBake.bakeSvg(svg, window, { freezeTokens: freeze });
                out.push(flatSvg.outerHTML);
              } catch (e) {
                // The export falls back to the unbaked SVG, which paints black on a host
                // with no stylesheet: a finding, never a silent drop from coverage.
                threw.push({ component, message: String(e?.message).slice(0, 120) });
              }
            }
            return { baked: out, attempted: [...attempted], threw };
          }, freezeTokens);
          for (const t of threw) {
            lost.push({ family: 'chart', mode: 'baked', component: t.component, selector: 'svg', property: 'bake-threw', scheme, from: 'baked', to: t.message });
          }
          await live.close();
          const bare = await browser.newPage();
          await bare.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
          await bare.setContent(`<!doctype html><html><head><style>:root{color-scheme:${scheme}}</style></head><body><div id="vr-baked">${baked.join('\n')}</div></body></html>`, { waitUntil: 'networkidle0' });
          const bakedCopy = await bare.evaluate(paintsIn, '#vr-baked', [...PAINTABLE_TAGS], STAMP);
          // A baked clone is an SVG only: compare SVG paints, not the slide's HTML around it.
          const bakedCmp = compareCopies('baked', scheme, bakeRef, bakedCopy);
          compared.baked += Object.values(bakedCmp.pairs).reduce((a, b) => a + b, 0);
          lost.push(...bakedCmp.lost);
          for (const c of attempted) if (!bakedCmp.pairs[c]) unpaired.push({ mode: 'baked', theme, scheme, component: c });
          await bare.close();
        }));
      }
    }
  } finally {
    await browser.close();
  }
  return { skipped: false, lost, compared, unpaired };
}

/** Dedupe findings to unique keys, keeping a representative for reporting. */
function uniqueByKey(findings) {
  const seen = new Map();
  for (const f of findings) if (!seen.has(findingKey(f))) seen.set(findingKey(f), f);
  return [...seen.values()];
}

/**
 * Run both passes and fold them into one finding list. A scoped black-paint finding
 * and a copy-parity loss share one baseline: each is a paint that is not what the
 * slide promised, and each is sanctioned only with a reason (`why`).
 */
async function gather(opts = {}) {
  const { skipped, blacks, dimText } = await collectBlacks();
  if (skipped) return { skipped: true, found: [], dimText: [], compared: { flat: 0, baked: 0, reading: 0 }, unpaired: [] };
  const copies = await collectCopies(opts);
  const found = uniqueByKey([...blacks, ...copies.lost]).sort((a, b) => findingKey(a).localeCompare(findingKey(b)));
  return { skipped: false, found, dimText, compared: copies.compared, unpaired: copies.unpaired };
}

/**
 * A copy-loss sanction must say why it is accepted. `--bless` writes a TODO for a new
 * one so the author is forced to fill it in; this is what makes "forced" true.
 */
function unjustified(baseline) {
  return baseline.sanctioned.filter((e) => e.mode && (!e.why || /^TODO\b/.test(e.why))).map(findingKey);
}

function readBaseline() {
  return fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : { sanctioned: [] };
}

/**
 * The pure comparison, shared by the CLI gate and the integration test: render,
 * diff against the baseline, return { skipped, regressions, stale, found, compared }.
 */
async function evaluate(opts = {}) {
  const { skipped, found, dimText, compared, unpaired } = await gather(opts);
  if (skipped) return { skipped: true, regressions: [], stale: [], found: [], dimText: [], compared, unpaired, unjustified: [] };
  const baseline = readBaseline();
  const foundKeys = new Set(found.map(findingKey));
  const sanctionedKeys = new Set(baseline.sanctioned.map(findingKey));
  const regressions = found.filter((f) => !sanctionedKeys.has(findingKey(f)));
  const stale = [...sanctionedKeys].filter((k) => !foundKeys.has(k));
  return { skipped: false, regressions, stale, found, dimText, compared, unpaired, unjustified: unjustified(baseline), findingKey };
}

module.exports = { collectBlacks, collectCopies, compareCopies, gather, lostPaint, paintClass, evaluate, findingKey, uniqueByKey, BASELINE_FILE, THEMES, SCHEMES };

async function main() {
  const args = process.argv.slice(2);
  const bless = args.includes('--bless');
  const asJson = args.includes('--json');

  const { skipped, found, dimText, compared, unpaired } = await gather();
  if (skipped) {
    console.error('check-viz-render: SKIPPED — no Chromium (set CHROME_PATH). Not a pass; the scoped-render guard did not run.');
    process.exit(0);
  }
  // Contrast is a hard floor, not a ratchet: there is no such thing as a
  // sanctioned illegible label, so this has no baseline to bless.
  if (dimText.length && !bless) {
    console.error(`\ncheck-viz-render FAILED — ${dimText.length} canvas TEXT paint(s) below their contrast floor:`);
    for (const d of dimText.sort((a, b) => a.ratio - b.ratio)) {
      console.error(`  ✗ ${d.theme} ${d.scheme} · ${d.what} (${d.selector}) is ${d.ratio.toFixed(2)}:1 against the canvas, below ${d.floor}:1`);
    }
    console.error('\n  A chart ink that carries TEXT on the page canvas needs WCAG AA. The categorical inks are graphical (3:1) by design — darken toward --text-heading rather than taking the raw hue.');
    process.exit(1);
  }
  // A copy pass that paired nothing reports no losses. That is a broken harness,
  // not a clean surface (the first draft of this pass hid the whole article that way).
  const empty = Object.entries(compared).filter(([, n]) => n === 0).map(([m]) => m);
  if (empty.length) {
    console.error(`check-viz-render FAILED — the ${empty.join(' and ')} copy pass compared 0 element pairs; the harness is not showing the copy.`);
    process.exit(1);
  }
  // Per chart, not only in total: one chart going missing from a copy is invisible in
  // a global count. Not baselinable — a chart with no copy has no paints to sanction.
  if (unpaired.length) {
    console.error(`check-viz-render FAILED — ${unpaired.length} chart copy(ies) compared nothing:`);
    for (const u of unpaired) console.error(`  ✗ ${u.mode} · ${u.component} · ${u.theme} ${u.scheme}`);
    console.error('\n  The chart should have a copy in that mode and none of its elements met their slide twin.');
    process.exit(1);
  }

  const baseline = readBaseline();
  const foundKeys = new Set(found.map(findingKey));

  if (bless) {
    // Keep each surviving entry's `why`; a NEW entry gets a placeholder the PR must replace.
    const why = new Map(baseline.sanctioned.map((e) => [findingKey(e), e.why]));
    const payload = {
      note: 'Sanctioned findings of tools/check-viz-render.js. An entry without `mode` is opaque-black SVG paint on the SCOPED (preview) path: a legitimately-black ink or hairline. An entry with `mode` (flat = the player Read · Article, reading = the Studio in-app Reading view, baked = a stylesheet-free SVG) is a paint the slide has and that copy loses, accepted with the reason in `why`. Regenerate with `node tools/check-viz-render.js --bless`; justify any addition in the PR.',
      themes: THEMES,
      schemes: SCHEMES,
      sanctioned: found.map((f) => ({
        family: f.family,
        ...(f.mode ? { mode: f.mode } : {}),
        component: f.component,
        selector: f.selector,
        property: f.property,
        scheme: f.scheme,
        ...(why.get(findingKey(f)) || f.mode ? { why: why.get(findingKey(f)) || 'TODO: say why this loss is accepted' } : {}),
      })),
    };
    fs.mkdirSync(path.dirname(BASELINE_FILE), { recursive: true });
    fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(`check-viz-render: blessed ${found.length} sanctioned entries → ${path.relative(ROOT, BASELINE_FILE)}`);
    return;
  }

  const sanctionedKeys = new Set(baseline.sanctioned.map(findingKey));
  const regressions = found.filter((f) => !sanctionedKeys.has(findingKey(f)));
  const stale = [...sanctionedKeys].filter((k) => !foundKeys.has(k));
  const noWhy = unjustified(baseline);

  if (asJson) {
    console.log(JSON.stringify({ regressions, stale, found, compared, unpaired, unjustified: noWhy }, null, 2));
  }

  if (noWhy.length) {
    console.error(`\ncheck-viz-render FAILED — ${noWhy.length} copy-loss sanction(s) with no reason (a missing or TODO \`why\` in ${path.relative(ROOT, BASELINE_FILE)}):`);
    for (const k of noWhy) console.error(`  ✗ ${k}`);
    process.exit(1);
  }

  if (regressions.length === 0 && stale.length === 0) {
    console.log(`check-viz-render OK — ${found.length} sanctioned finding(s); no new black paint on the scoped path and no new lost paint in a copy (flat ${compared.flat} / reading ${compared.reading} / baked ${compared.baked} pairs; ${THEMES.join('/')} × ${SCHEMES.join('/')}).`);
    return;
  }

  if (regressions.length) {
    console.error(`\ncheck-viz-render FAILED — ${regressions.length} new finding(s):`);
    for (const f of regressions) {
      if (f.mode) console.error(`  ✗ ${f.mode} copy · ${f.component} · ${f.selector} { ${f.property} } ${f.from} → ${f.to}`);
      else console.error(`  ✗ ${f.family} · section.${f.component} · ${f.selector} { ${f.property} } → rgb(0,0,0)`);
    }
    console.error('\n  Black on the scoped path: a themed SVG color resolved to nothing (a selector-scoping or token-name break, see #956).');
    console.error('  A flat or baked loss: the chart lost a paint when it was shown outside its slide (see #2344 and');
    console.error('  engineering/decisions/2026-09-24-one-style-delivery-spine.md).');
    console.error('  If a finding is INTENTIONAL, re-bless and write its `why`: node tools/check-viz-render.js --bless');
  }
  if (stale.length) {
    console.error(`\ncheck-viz-render FAILED — ${stale.length} STALE baseline entr(y/ies) no longer found (the list rotted):`);
    for (const k of stale) console.error(`  ✗ ${k}`);
    console.error('\n  Re-bless to drop them: node tools/check-viz-render.js --bless');
  }
  process.exit(1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('check-viz-render: crashed —', e?.stack ? e.stack : e);
    process.exit(1);
  });
}
