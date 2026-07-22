/**
 * Standalone chart-SVG export — make a chart's `<svg>` a self-contained file.
 *
 * WHY THIS EXISTS
 * The four keyed charts (pie/radar/map/cohort quadrant) emit the diagram, spine,
 * and key as ONE `<svg>` viewBox (svg-legend.js) — "self-contained / exportable"
 * was a stated goal of that design (2026-06-13-svg-native-legend.md §2). But a
 * chart `<svg>` lifted out of the rendered deck is NOT yet portable, for two
 * reasons that this module fixes:
 *   1. COLOUR + TYPE come from the deck's stylesheet. Swatches/spine use
 *      `fill="…var(--token)…"`; key text uses CLASSES (`.chart-key-label` …)
 *      whose fill + `font-family` live in chart-family.css. Detached, the
 *      `var()`/`color-mix()` go undefined (→ black) and the class rules don't
 *      match (no `section.chart-frame` ancestor) — the chart renders black and
 *      unstyled. FIX: `flattenSvgStyles` inlines the *computed* paint/text props
 *      (which the browser has already resolved to literal rgb()) onto every node.
 *   2. FONTS are referenced by family NAME, not glyphs — opened where the face
 *      isn't installed, text falls back to serif (§4d). FIX: the caller embeds a
 *      data-URI `@font-face` block (subsetted to the families the chart uses, via
 *      `collectFontFamilies`) which `finalizeStandaloneSvg` injects into a
 *      `<defs><style>`. Embed-only (text stays selectable); outlining was
 *      considered and deferred (§4d).
 *
 * SHAPE — one module, two contexts (no DOM/Node-only deps in the shared parts):
 *   • `finalizeStandaloneSvg`, `collectFontFamilies` — PURE string helpers; unit
 *     tested in Node, no browser. Both surfaces (CLI + Drawing Board) call them.
 *   • `flattenSvgStyles` — runs in a BROWSER context (uses `getComputedStyle`).
 *     The CLI ships it into a puppeteer page via `page.evaluate`; the Drawing
 *     Board imports it through Vite. It is closure-free so it serialises cleanly.
 * The font bytes differ per context (Vite-bundled woff2 vs. read-from-disk), so
 * the `@font-face` CSS is built by each surface and passed in — see
 * docs/src/playground/font-embed.js (browser) and tools/lib/chart-font-embed.js
 * (Node), which share the FACES manifest.
 *
 * NOT a render transform — it never runs in the three deck-render kernels, so
 * HARD RULE 1 does not apply; it post-processes already-rendered SVG.
 */

// Computed presentation properties we copy inline. PAINT + TEXT only — never
// layout/geometry (those stay as the SVG's own attributes/viewBox). Copying the
// computed value captures the browser's already-resolved var()/color-mix() as a
// literal, so the detached file needs no external CSS and no token definitions.
const STYLE_PROPS = [
  'fill', 'fill-opacity', 'fill-rule',
  'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit',
  'opacity', 'color',
  // Gradient stops carry their colour here, NOT in `fill` — and the chart's
  // swatch/wedge/spine gradients reference var()/color-mix() in stop-color, so
  // these must be captured or the gradients render black when detached.
  'stop-color', 'stop-opacity',
  'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'letter-spacing', 'word-spacing',
  'text-anchor', 'dominant-baseline', 'alignment-baseline',
  'paint-order', 'mix-blend-mode',
];

// Properties whose CSS initial value is safe to OMIT (keeps the file lean —
// most <g>/<path> nodes inherit or never paint these). We still emit a prop when
// it differs from this initial, so intended values (e.g. an explicit black fill)
// are never dropped.
const INITIAL = {
  'fill-opacity': '1', 'fill-rule': 'nonzero',
  'stroke': 'none', 'stroke-opacity': '1', 'stroke-width': '1px',
  'stroke-linecap': 'butt', 'stroke-linejoin': 'miter',
  'stroke-dasharray': 'none', 'stroke-dashoffset': '0px', 'stroke-miterlimit': '4',
  'opacity': '1', 'font-style': 'normal', 'font-variant': 'normal',
  'font-weight': '400', 'letter-spacing': 'normal', 'word-spacing': '0px',
  'dominant-baseline': 'auto', 'alignment-baseline': 'auto',
  'paint-order': 'normal', 'mix-blend-mode': 'normal',
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Flatten a rendered chart `<svg>` into a self-styled clone — BROWSER ONLY.
 * Walks the live element (which must be in the rendered document so computed
 * styles resolve), copying the curated computed paint/text props inline onto a
 * parallel clone. Returns the clone (caller serialises it). Closure-free so it
 * survives structured-clone into a puppeteer page.
 *
 * @param {SVGElement} srcSvg - the live, rendered chart <svg>
 * @param {Window} [win] - defaults to the global window
 * @returns {SVGElement} a detached clone with computed styles inlined
 */
function flattenSvgStyles(srcSvg, win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!w) throw new Error('flattenSvgStyles requires a browser window');
  const PROPS = [
    'fill', 'fill-opacity', 'fill-rule',
    'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin',
    'stroke-dasharray', 'stroke-dashoffset', 'stroke-miterlimit',
    'opacity', 'color',
    'stop-color', 'stop-opacity',
    'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
    'letter-spacing', 'word-spacing',
    'text-anchor', 'dominant-baseline', 'alignment-baseline',
    'paint-order', 'mix-blend-mode',
  ];
  const INIT = {
    'fill-opacity': '1', 'fill-rule': 'nonzero',
    'stroke': 'none', 'stroke-opacity': '1', 'stroke-width': '1px',
    'stroke-linecap': 'butt', 'stroke-linejoin': 'miter',
    'stroke-dasharray': 'none', 'stroke-dashoffset': '0px', 'stroke-miterlimit': '4',
    'opacity': '1', 'font-style': 'normal', 'font-variant': 'normal',
    'font-weight': '400', 'letter-spacing': 'normal', 'word-spacing': '0px',
    'dominant-baseline': 'auto', 'alignment-baseline': 'auto',
    'paint-order': 'normal', 'mix-blend-mode': 'normal',
  };
  const doc = srcSvg.ownerDocument;

  // Gradient <stop>s live in <defs>, which is never rendered — so getComputedStyle
  // there does NOT resolve var()/color-mix() (it returns the initial black). To
  // resolve a stop's colour we evaluate its authored expression through a probe
  // <rect> rendered alongside the chart: set `color`, read it back concrete. It
  // goes on the svg's PARENT (still inheriting the chart's custom props from the
  // section ancestor) — never inside srcSvg, so `walk` can't clone it into output.
  const SVGNS = 'http://www.w3.org/2000/svg';
  const probe = doc.createElementNS(SVGNS, 'rect');
  probe.setAttribute('width', '0');
  probe.setAttribute('height', '0');
  (srcSvg.parentNode || srcSvg).appendChild(probe);
  function resolveColor(expr) {
    if (!expr) return '';
    probe.style.color = '';
    probe.style.color = expr;
    return w.getComputedStyle(probe).color || expr;
  }

  function walk(src) {
    const clone = src.cloneNode(false);
    if (src.nodeType === 1) {
      const cs = w.getComputedStyle(src);
      const prev = src.getAttribute ? src.getAttribute('style') : null;
      const tag = src.tagName ? src.tagName.toLowerCase() : '';
      let decl = '';
      if (tag === 'stop') {
        // Resolve through the probe (defs isn't rendered → cs is unreliable here).
        const expr = src.style.stopColor || src.getAttribute('stop-color') || cs.getPropertyValue('stop-color');
        const col = resolveColor(expr);
        if (col) decl += 'stop-color:' + col + ';';
        const so = src.style.stopOpacity || src.getAttribute('stop-opacity');
        if (so) decl += 'stop-opacity:' + so + ';';
      } else {
        for (let i = 0; i < PROPS.length; i++) {
          const p = PROPS[i];
          const v = cs.getPropertyValue(p);
          if (!v) continue;
          if (Object.hasOwn(INIT, p) && v === INIT[p]) continue;
          decl += p + ':' + v + ';';
        }
      }
      // The element's own inline style wins over computed (author intent), so
      // append it last — but a <stop>'s inline style holds the UNRESOLVED
      // var()/color-mix() expression, so drop it there (we just resolved it).
      const keepPrev = tag === 'stop' ? '' : (prev || '');
      if (decl || keepPrev) clone.setAttribute('style', decl + keepPrev);
      for (let n = src.firstChild; n; n = n.nextSibling) {
        if (n === probe) continue; // never serialise the resolver probe (parentNode fallback)
        if (n.nodeType === 1 || n.nodeType === 3) clone.appendChild(walk(n));
      }
    }
    return clone;
  }

  const out = walk(srcSvg);
  probe.remove();
  // Carry the namespace explicitly — a cloned-then-serialised SVG needs xmlns to
  // open as a file (finalizeStandaloneSvg also guards this). Literal, not the
  // module SVG_NS const: this fn is serialised via toString() into a browser
  // page (CLI) where module scope is gone, so it must be closure-free.
  if (out.setAttribute && !out.getAttribute('xmlns')) out.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  return out;
}

/**
 * Collect the font families referenced by `font-family` in an SVG markup string
 * (inline style or presentation attribute). Returns a de-duped, lower-cased set
 * of family names with quotes stripped — used to SUBSET the embedded faces to
 * only those the chart actually uses (keeping the export small).
 *
 * @param {string} svgMarkup
 * @returns {string[]} family names, de-duped, in first-seen order
 */
function collectFontFamilies(svgMarkup) {
  if (!svgMarkup) return [];
  // XMLSerializer escapes inner attribute quotes as &quot; — whose trailing ';'
  // would otherwise truncate the value mid-stack. DROP the quote entities (and
  // any literal quotes) so a clean comma list remains, then capture the whole
  // value up to the declaration terminator (`;` or the tag/attr close).
  const text = String(svgMarkup)
    .replace(/&quot;|&#34;|&apos;|&#39;/g, '')
    .replace(/&amp;/g, '&');
  const seen = new Map();
  const re = /font-family\s*[:=]\s*"?([^;">]+)/gi;
  let m;
  while ((m = re.exec(text))) {
    for (const raw of m[1].split(',')) {
      const fam = raw.trim().replace(/['"]/g, '').trim();
      if (!fam) continue;
      const key = fam.toLowerCase();
      if (!seen.has(key)) seen.set(key, fam);
    }
  }
  return Array.from(seen.values());
}

/**
 * Wrap a (already style-flattened) chart `<svg>` markup into a complete,
 * self-contained `.svg` document string: guarantees `xmlns`, gives it an
 * intrinsic `width`/`height` from the `viewBox` so it opens at a sane size, and
 * injects the embedded-font `<style>` (if any) as the first child.
 *
 * Pure string surgery — no DOM, Node-testable.
 *
 * @param {string} svgMarkup  - `<svg …>…</svg>`, styles already inlined
 * @param {object} [opts]
 * @param {string} [opts.fontFaceCss]  - `@font-face{…data-URI…}` rules to embed
 * @param {string} [opts.background]  - a CSS color baked as a full-bleed backdrop
 *                                      `<rect>` (e.g. an image set's light/dark canvas);
 *                                      omit / falsy leaves the SVG transparent
 * @param {boolean} [opts.xmlProlog=true] - prepend the XML declaration
 * @returns {string} a standalone SVG document
 */
function finalizeStandaloneSvg(svgMarkup, opts) {
  const o = opts || {};
  const src = String(svgMarkup || '').trim();
  const open = src.match(/^<svg\b([^>]*?)\/?>/i);
  if (!open) throw new Error('finalizeStandaloneSvg: input is not an <svg> element');
  let attrs = open[1]; // `[^>]*?\/?` keeps a self-closing root's `/` out of attrs

  // xmlns (+ xlink if used anywhere in the body)
  if (!/\bxmlns\s*=/.test(attrs)) attrs += ` xmlns="${SVG_NS}"`;
  if (/\bxlink:/.test(src) && !/\bxmlns:xlink\s*=/.test(attrs)) {
    attrs += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
  }

  // Intrinsic size from viewBox when width/height are absent, so a file viewer
  // gives it a real footprint instead of a 100%/0 collapse.
  if (!/\bwidth\s*=/.test(attrs) || !/\bheight\s*=/.test(attrs)) {
    const vb = attrs.match(/\bviewBox\s*=\s*"(\s*[-\d.]+\s+[-\d.]+\s+([-\d.]+)\s+([-\d.]+)\s*)"/i);
    if (vb) {
      if (!/\bwidth\s*=/.test(attrs)) attrs += ` width="${vb[2]}"`;
      if (!/\bheight\s*=/.test(attrs)) attrs += ` height="${vb[3]}"`;
    }
  }

  const body = src.slice(open[0].length);
  // Escape any `]]>` so it can't close the CDATA early (defensive — data-URI font
  // sheets never contain it, but never emit malformed XML).
  const fontCss = (o.fontFaceCss || '').trim().replace(/]]>/g, ']]]]><![CDATA[>');
  const styleBlock = fontCss
    ? `<defs><style type="text/css"><![CDATA[\n${fontCss}\n]]></style></defs>`
    : '';

  // Optional solid backdrop — a full-bleed <rect> as the FIRST painted child, behind
  // everything. `width/height="100%"` fills the viewport at whatever intrinsic size the
  // root resolves to (viewBox or width/height attrs above), so it scales with the file.
  const bg = String(o.background || '').trim();
  const bgRect = bg ? `<rect x="0" y="0" width="100%" height="100%" fill="${bg}"/>` : '';

  const prolog = o.xmlProlog === false ? '' : '<?xml version="1.0" encoding="UTF-8"?>\n';
  return `${prolog}<svg${attrs}>${styleBlock}${bgRect}${body}`;
}

module.exports = {
  STYLE_PROPS,
  INITIAL,
  SVG_NS,
  flattenSvgStyles,
  collectFontFamilies,
  finalizeStandaloneSvg,
};
