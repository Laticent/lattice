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
 * `opts.foreignObjectLabels: 'text'` additionally rewrites every `<foreignObject>`
 * into native SVG `<text>` (default `'keep'` — byte-identical to before for the
 * chart callers, which emit `<tspan>` and carry no foreignObject at all). Mermaid
 * DOES use foreignObject for every node/edge/cluster label, and a foreignObject is
 * HTML smuggled into the SVG namespace — the mXSS shape DOMPurify strips by default
 * and that we deliberately keep barred (HARD RULE #22 / the sanitizer's allowlist).
 * So a diagram that reaches the exported player unconverted arrives with EVERY label
 * gone: shapes and arrows, no words. Rewriting the labels here is what lets the
 * sanitizer stay strict and the diagram still read.
 *
 * @param {SVGElement} srcSvg - the live, rendered chart <svg>
 * @param {Window} [win] - defaults to the global window
 * @param {{foreignObjectLabels?: 'keep'|'text'}} [opts]
 * @returns {SVGElement} a detached clone with computed styles inlined
 */
function flattenSvgStyles(srcSvg, win, opts) {
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
  const PAINT_PROPS = { fill: 1, stroke: 1 };
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

  // Which tokens the bake FOLLOWS rather than freezes — DERIVED, not enumerated.
  //
  // Why follow anything: inlining a diagram's computed paint is right for a scheme-PINNED
  // slide and wrong for an unpinned one in a file whose viewer owns a light/dark switch. The
  // paint stays at its export-time value while the surface under it flips: connector strokes
  // stayed #1A1A1A on a #001D33 canvas (1.09:1) with their arrowheads re-themed, so the
  // diagram read as floating arrowheads with no lines between them.
  //
  // Why DERIVED: three hand-written lists in a row each missed a family, and each miss was
  // worse than the bug it fixed, because a partially-followed diagram puts moving ink on a
  // frozen surface. Following the container INK without its container SURFACE gave dark ink
  // on a frozen dark slab (1.34:1); adding those surfaces then left labels sitting directly
  // on the slide canvas (1.09:1). Ink and surface have to move together or not at all, and a
  // list maintained by hand cannot promise that.
  //
  // So the set is computed from the document itself: take every custom-property NAME the
  // stylesheets declare, then keep the ones whose value actually DIFFERS between light and
  // dark. `light-dark()` resolves against the element's own `color-scheme`, so flipping that
  // on the probe and comparing is a direct test of "does this token vary by scheme" — the
  // same property `themeDualMode` keys on when it decides what to re-emit for the player.
  // A token that does not vary needs no indirection and gains nothing from it.
  const SCHEME_TOKENS = [];
  {
    const names = {};
    const sheets = doc.querySelectorAll('style');
    const nameRe = /(--[a-zA-Z0-9-]+)\s*:/g;
    for (let i = 0; i < sheets.length; i++) {
      const text = sheets[i].textContent || '';
      let nm;
      nameRe.lastIndex = 0;
      while ((nm = nameRe.exec(text))) names[nm[1]] = 1;
    }
    const keys = Object.keys(names);
    for (let i = 0; i < keys.length; i++) {
      probe.style.colorScheme = 'light';
      const lightVal = resolveColor('var(' + keys[i] + ')');
      probe.style.colorScheme = 'dark';
      const darkVal = resolveColor('var(' + keys[i] + ')');
      if (lightVal && darkVal && lightVal !== darkVal) SCHEME_TOKENS.push(keys[i]);
    }
    probe.style.colorScheme = '';
  }
  // The label-ink half of the same contract. These are inks specifically, checked in this
  // order so a label matching more than one resolves predictably; each is a scheme-varying
  // token and therefore also present in SCHEME_TOKENS above, which is what keeps a label's
  // ink and the surface under it moving together.
  const LABEL_INK_TOKENS = [
    '--text-heading', '--c-on-container', '--c-on-subcontainer', '--cat-on-fill', '--cat-on-mark',
  ];

  // "Is this resolved paint exactly some scheme-varying token's current value?" — the one
  // question every paint in this bake has to answer, asked in one place so a paint cannot be
  // frozen just because it took a different route out of here (#1635: the label halo did).
  // FIRST match wins, and ambiguity is NOT resolved by freezing — see the note in `walk`.
  // Memoized: the probe's resolutions do not move during a bake, and a chart asks this for
  // every paint against ~130 tokens.
  const tokenByPaint = new Map();
  function followToken(value) {
    if (!value) return '';
    if (tokenByPaint.has(value)) return tokenByPaint.get(value);
    let found = '';
    for (let t = 0; t < SCHEME_TOKENS.length; t++) {
      if (resolveColor('var(' + SCHEME_TOKENS[t] + ')') === value) {
        found = SCHEME_TOKENS[t];
        break;
      }
    }
    tokenByPaint.set(value, found);
    return found;
  }

  // ── foreignObject → <text> ────────────────────────────────────────────────
  // Read the label's RENDERED line boxes rather than re-implementing HTML layout:
  // a Range over each text node yields one client rect per line the browser
  // actually drew, so wrapping, alignment, bold/italic runs and multi-<p> labels
  // all come out placed exactly where the diagram put them. Client px are mapped
  // back into the foreignObject's own user units by the ratio between its declared
  // width/height and its rendered box — the same factor the CTM applies, without
  // needing the matrix. Everything is defined INSIDE this function: it is
  // serialized with `toString()` into a puppeteer page (CLI), where module scope
  // is gone.
  const FO_TO_TEXT = !!(opts && opts.foreignObjectLabels === 'text');
  function lineRuns(node) {
    // [{ text, rect }] — one entry per rendered line of this text node.
    const range = doc.createRange();
    range.selectNodeContents(node);
    const rects = range.getClientRects();
    const raw = node.nodeValue || '';
    if (rects.length <= 1) return raw.trim() ? [{ text: raw, rect: rects[0] || range.getBoundingClientRect() }] : [];
    // Wrapped: group characters by the top of their own one-character rect.
    const runs = [];
    for (let i = 0; i < raw.length; i++) {
      range.setStart(node, i);
      range.setEnd(node, i + 1);
      const r = range.getBoundingClientRect();
      const key = Math.round(r.top);
      const last = runs[runs.length - 1];
      if (last && last.key === key) {
        last.text += raw[i];
        last.rect = { top: Math.min(last.rect.top, r.top), bottom: Math.max(last.rect.bottom, r.bottom), left: Math.min(last.rect.left, r.left), right: Math.max(last.rect.right, r.right) };
      } else if (r.width || r.height) {
        runs.push({ key, text: raw[i], rect: { top: r.top, bottom: r.bottom, left: r.left, right: r.right } });
      }
    }
    return runs.filter((run) => run.text.trim());
  }
  function foreignObjectToText(fo) {
    const box = fo.getBoundingClientRect();
    const foW = parseFloat(fo.getAttribute('width'));
    const foH = parseFloat(fo.getAttribute('height'));
    // No declared box, or not rendered → no faithful mapping is available. Return
    // null so the caller keeps the foreignObject rather than inventing a position.
    if (!box.width || !box.height || !(foW > 0) || !(foH > 0)) return null;
    const sx = foW / box.width;
    const sy = foH / box.height;
    const ox = parseFloat(fo.getAttribute('x')) || 0;
    const oy = parseFloat(fo.getAttribute('y')) || 0;
    const out = doc.createElementNS('http://www.w3.org/2000/svg', 'text');
    let any = false;
    // The spans whose ink FOLLOWS the toggle, with the literal in force at bake time. If the
    // halo under them turns out to be frozen, they have to be frozen with it — see below.
    const following = [];
    const walker = doc.createTreeWalker(fo, 4 /* NodeFilter.SHOW_TEXT */);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!(n.nodeValue || '').trim()) continue;
      const parent = n.parentElement;
      if (!parent) continue;
      const pcs = w.getComputedStyle(parent);
      for (const run of lineRuns(n)) {
        const r = run.rect;
        if (!r) continue;
        const span = doc.createElementNS('http://www.w3.org/2000/svg', 'tspan');
        span.setAttribute('x', String(ox + ((r.left + r.right) / 2 - box.left) * sx));
        span.setAttribute('y', String(oy + ((r.top + r.bottom) / 2 - box.top) * sy));
        // `y` is the line's CENTER, so the baseline has to be re-centered — and that
        // has to travel as CSS, not as a presentation attribute: `dominant-baseline`
        // is absent from DOMPurify's SVG attribute allowlist, so the attribute form is
        // silently dropped by the player's sanitizer and every label then hangs a
        // half-line high, above its own background. Inline `style` survives.
        let decl = 'text-anchor:middle;dominant-baseline:central;';
        // The label's own paint + type, resolved: the <style> mermaid injects into
        // the SVG is stripped by the same sanitizer, so nothing may be left to CSS.
        decl += `font-family:${pcs.fontFamily};font-size:${pcs.fontSize};font-weight:${pcs.fontWeight};`;
        if (pcs.fontStyle && pcs.fontStyle !== 'normal') decl += `font-style:${pcs.fontStyle};`;
        // INK, and whether this label is allowed to keep its own.
        //
        // A rewritten label lands as a `tspan` inside mermaid's `g.label`, which is what
        // `mermaid.css`'s theme rule targets: `.label tspan { fill: var(--text-heading)
        // !important; font-weight: 500 !important }`. That rule is why an ordinary label
        // stays legible when the deck's scheme flips — the chips re-theme from tokens, and
        // the ink has to follow them — so a frozen literal would be WRONG for the common
        // case, not just redundant.
        //
        // It is wrong for the opposite case. An author writing `classDef … color:#FFFFFF`
        // sets the label ink themselves, and in the live render that wins (it is HTML
        // `color` inside the foreignObject). Baked to a tspan, `!important` took it back:
        // white-on-black authored, dark-on-black shipped, 1.04:1 — while the PDF beside it
        // was legible.
        //
        // So: resolve what the theme rule WOULD impose, through the same probe the gradient
        // stops use (it sits in the section, so the token resolves in context). Matching
        // means this is the themed default — emit the token, not a literal, and keep
        // following. Differing means the author set it — emit the literal and mark the span
        // so the rule steps aside for it alone.
        //
        // `--text-heading` is not the only themed label ink. A container/subgraph label
        // (kanban lanes, flowchart clusters) is painted from `--c-on-container`, and a
        // categorical chip's from the `--cat-on-*` pair. Comparing against `--text-heading`
        // alone judged all of those to be author choices: on `mermaid-diagram-surface`, 18
        // labels with no `classDef` anywhere in the source were frozen to their dark-mode
        // literal and opted out of re-theming, so the light toggle put `#E4EDF5` ink on a
        // light card at 1.12:1. Check the whole set of label inks (LABEL_INK_TOKENS, declared
        // beside the SURFACES they pair with) and emit whichever matches; only a color that
        // matches NONE of them is the author's own.
        let inkToken = '';
        for (let t = 0; t < LABEL_INK_TOKENS.length; t++) {
          if (pcs.color && resolveColor('var(' + LABEL_INK_TOKENS[t] + ')') === pcs.color) {
            inkToken = LABEL_INK_TOKENS[t];
            break;
          }
        }
        const ownInk = !!pcs.color && !inkToken;
        // BOLD only. The source label is HTML, whose default weight is 400 — comparing that
        // against the tspan rule's 500 marked every label as author-owned and stopped the
        // whole diagram following the theme. 400 is mermaid's default, not a choice; 600+ is
        // a `<b>`/`**bold**` the author wrote, and worth keeping.
        const ownWeight = (Number.parseInt(pcs.fontWeight, 10) || 400) >= 600;
        decl += ownInk ? `fill:${pcs.color};` : `fill:var(${inkToken || '--text-heading'});`;
        span.setAttribute('style', decl);
        if (ownInk || ownWeight) span.setAttribute('class', 'lp-own-ink');
        if (!ownInk) following.push({ span, literal: pcs.color });
        span.textContent = run.text.replace(/\s+/g, ' ');
        out.appendChild(span);
        any = true;
      }
    }
    if (!any) return null;
    // The label's own HTML BACKGROUND, as a <rect> behind the text. Mermaid paints an
    // edge label's halo on the div (`.labelBkg { background-color }`), which is the one
    // piece of the label that a bare <text> cannot carry — without it an edge label sits
    // directly on the edge it labels and the line strikes through the words.
    // Mermaid nests the halo (a 50%-white div under an opaque white span), so the same
    // box is painted more than once. Key each candidate on its geometry: keep the last
    // OPAQUE paint of a box and drop everything under it — same result, one rect.
    const byBox = new Map();
    for (const el of fo.querySelectorAll('*')) {
      const bg = w.getComputedStyle(el).backgroundColor;
      if (!bg || bg === 'transparent' || /^rgba\(0, *0, *0, *0\)$/.test(bg)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      const geom = {
        x: ox + (r.left - box.left) * sx,
        y: oy + (r.top - box.top) * sy,
        w: r.width * sx,
        h: r.height * sy,
      };
      const key = `${geom.x.toFixed(2)}|${geom.y.toFixed(2)}|${geom.w.toFixed(2)}|${geom.h.toFixed(2)}`;
      const prior = byBox.get(key);
      // A translucent paint over a translucent paint really does compound, so only an
      // OPAQUE fill is allowed to replace what is already there.
      if (prior && !/^rgb\(/.test(bg)) continue;
      byBox.set(key, { geom, bg });
    }
    // THE HALO FOLLOWS TOO, or nothing does (#1635). This rect is the only paint the bake
    // used to write as a raw literal, and it is the one directly under the words: mermaid
    // paints an edge label's halo from the slide canvas, so an exported `seven-steps` /
    // `deck-class-register` player froze it at the export scheme while the ink above it kept
    // following `.label tspan{fill:var(--text-heading)!important}` — dark ink on a dark halo,
    // 1.09:1 and 1.06:1 measured after the toggle, on the labels the reader most needs.
    //
    // Ink and surface move together or not at all. So the halo is matched against the same
    // scheme-token set every other paint uses, and when a halo does NOT match (an author's own
    // background) the ink above it is frozen to its bake-time literal and marked `lp-own-ink`,
    // which takes the theme rule off it. That pairing is the whole point: freezing a surface
    // while its ink follows was measured as strictly WORSE than the bug — it guarantees the
    // divergence — and it is exactly what this branch now cannot produce.
    let frozenHalo = false;
    for (const entry of byBox.values()) {
      entry.token = followToken(entry.bg);
      if (!entry.token) frozenHalo = true;
    }
    if (frozenHalo) {
      for (let i = 0; i < following.length; i++) {
        const { span, literal } = following[i];
        span.setAttribute('style', (span.getAttribute('style') || '').replace(/fill:[^;]*;/, `fill:${literal};`));
        span.setAttribute('class', 'lp-own-ink');
      }
    }
    const bgs = [];
    for (const { geom, bg, token } of byBox.values()) {
      const rect = doc.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', String(geom.x));
      rect.setAttribute('y', String(geom.y));
      rect.setAttribute('width', String(geom.w));
      rect.setAttribute('height', String(geom.h));
      rect.setAttribute('style', `fill:${token ? `var(${token})` : bg};`);
      bgs.push(rect);
    }
    if (!bgs.length) return out;
    const group = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
    for (const rect of bgs) group.appendChild(rect);
    group.appendChild(out);
    return group;
  }

  function walk(src) {
    if (FO_TO_TEXT && src.nodeType === 1 && src.tagName && src.tagName.toLowerCase() === 'foreignobject') {
      const replaced = foreignObjectToText(src);
      if (replaced) return replaced;
    }
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
          // A paint that is exactly a scheme-varying token's current value rides as the
          // TOKEN, so it still re-themes when the player's toggle moves (see SCHEME_TOKENS).
          let out = v;
          if (Object.hasOwn(PAINT_PROPS, p)) {
            // FIRST match wins, and ambiguity is NOT resolved by freezing. That was tried and
            // is strictly worse: `mermaid.css` re-themes a label through
            // `.label tspan{fill:var(--text-heading)!important}` unless the span carries the
            // `lp-own-ink` opt-out, so a label's INK follows the viewer's toggle whether or not
            // this bake emits a token for it. Only the SURFACE under it can be frozen. Freezing
            // an ambiguous surface therefore guarantees the divergence this whole block exists
            // to prevent — measured, it put `mermaid-diagram-surface` back to four sub-1.4:1
            // labels. The ordering hazard (two tokens sharing a value here, diverging in the
            // other scheme) is real but bounded: it mis-themes a paint, where the alternative
            // makes it invisible.
            const token = followToken(v);
            if (token) out = 'var(' + token + ')';
          }
          decl += p + ':' + out + ';';
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
  // The value goes straight into `fill="…"`, so accept ONLY a safe CSS color literal —
  // hex, an rgb()/rgba()/hsl()/hsla() functional form, or a bare keyword (named color /
  // `none` / `transparent` / `currentColor`). Anything else (a `"`, `<`, `/`, url(),
  // whitespace) is dropped — no rect — so a future caller passing user-controlled input
  // can't inject an attribute or markup into the exported SVG.
  const bg = String(o.background || '').trim();
  const bgSafe = /^#[0-9a-fA-F]{3,8}$/.test(bg) || /^[a-zA-Z]+$/.test(bg) ||
    /^(rgb|hsl)a?\(\s*[\d.,%\s/]+\)$/.test(bg);
  const bgRect = bg && bgSafe ? `<rect x="0" y="0" width="100%" height="100%" fill="${bg}"/>` : '';

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
