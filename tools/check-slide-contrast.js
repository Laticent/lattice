#!/usr/bin/env node
/**
 * check-slide-contrast — WCAG AA audit of the ACTUALLY RENDERED slide, not the
 * token table.
 *
 * Complements tools/contrast-audit.js rather than duplicating it (HARD RULE #15).
 * That tool checks each theme's own token matrix — the pairs a palette DECLARES.
 * It structurally cannot see a pairing a COMPONENT invents: `--text-secondary`
 * set on a `--cat-N-fill` panel, `--cat-N-mark` used as a card label, an ink
 * chosen against `--bg-alt` instead of `--bg`. Those only exist once a slide
 * renders. This walks the real DOM of a rendered deck, resolves every text run's
 * effective background by climbing ancestors through transparent paints, and
 * scores EVERY text run against WCAG AA's 4.5:1, large text included — see
 * `THE 3:1 LARGE-TEXT ALLOWANCE IS NOT GRANTED` below, the one place this tool is
 * deliberately stricter than the spec. It reads
 * pseudo-element text too, since this engine puts real content there (axis
 * labels, step badges, checkpoint labels).
 *
 * Born from #1207: the token audit was green at 704 pairs while the rendered
 * deck carried 44 sub-AA text runs, several as low as 2.54:1.
 *
 * ELEMENT OPACITY — read since #1640, and it was a real blind spot. A CSS
 * `opacity` renders the subtree to a buffer and composites the whole buffer — ink
 * AND background — at that alpha, which moves the ink much further than the band
 * under it. Reading computed `color` alone therefore reported an OPTIMISTIC number
 * for every run inside an opacity group, silently: on indaco's `redline .stacked`
 * (`del` at .85 inside a card at .78, both removed in #1640) it said ~5:1 where the
 * rendered pixels were 3.21:1. That figure is a `<del>` nested inside the .stacked
 * card — markup the CSS allows but no shipped deck writes, so it was measured on a
 * probe deck built to reach it; the DEFAULT variant every deck does render measured
 * 4.95:1 with the washes and 6.34:1 without. `resolveStack` below now walks the ink
 * and the backdrop through the SAME group stack, which is the only way the two can
 * be composited consistently. Validated against sampled pixels: within 0.01 on the
 * nested-wash runs (3.20 vs 3.21, 2.74 vs 2.75) and within 0.07 across the wider
 * set (4.98 / 5.15 / 3.85 / 6.99 modeled against 4.95 / 5.13 / 3.90 / 6.92). `tools/composed-contrast.js` models the same stack
 * statically, from the token table rather than a render.
 *
 * A CORRECTION, KEPT ON PURPOSE. This block used to claim that the running header is
 * "fully occluded by the left rail on every `split-*` layout … ink that never reaches
 * the page", and offered a measurement for it. That was FALSE. Rendered, the header is
 * painted in white on the dark rail and is perfectly legible. The four 1.00:1 rows it
 * was excusing were real output from a real bug — in THIS FILE, not in the engine:
 * `underlays()` approximated paint order by DOM order, so it discarded the rail (a
 * later, in-flow sibling) as a backdrop for out-of-flow chrome emitted before it. That
 * is fixed below, and those four rows are gone.
 *
 * The correction is worth more than the fix. The false claim was adopted as evidence by
 * a later change without anyone rendering the slide, and it survived review because a
 * tool's confident self-description reads exactly like a measurement. Treat this header
 * — including this paragraph — as a claim to re-verify, never as evidence.
 *
 * KNOWN LIMITATION — OCCLUDED RUNS. Every run in the DOM and not `display:none` /
 * `visibility:hidden` is scored, including one painted UNDER an opaque sibling and so
 * not on screen at all. Such a run is neither a pass nor a failure, and no threshold
 * describes it; detecting it needs per-glyph hit-testing this deliberately does not do.
 * Treat a reported failure on text you cannot find in the render as a layering or
 * backdrop-sampling bug to chase, not a contrast one.
 *
 * KNOWN LIMITATION — RASTER BACKDROPS. Backgrounds are read from `backgroundColor`, so
 * text over a photograph or gradient IMAGE resolves to whatever paint sits behind the
 * picture, usually the section canvas. Those rows are noise in both directions and are
 * why `image`-backed slides carry allowlist entries in the invariants gate rather than
 * a number this tool could ever get right.
 *
 * Usage:  node tools/check-slide-contrast.js <rendered-deck.html> [more.html ...]
 * Exits non-zero if any run falls below its AA threshold. On-demand, not a
 * blocking gate: the "muted chrome" tier (footer, pagination) is WCAG-exempt by
 * palette contract and will always report.
 */
const puppeteer = require('puppeteer');

const PROBE = () => {
  const srgb = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const lum = ([r, g, b]) => 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
  // Reads BOTH computed-color serializations Chromium emits. The `color(srgb …)`
  // arm is not a nicety: `color-mix(in srgb, white N%, transparent)` — the whole
  // --on-dark-* / --on-accent-* ink ramp — computes to `color(srgb 1 1 1 / 0.68)`,
  // never to rgba(). An rgb()-only parser returns null for every one of those, and
  // the caller treats null as "not text" and DROPS the run: silent, not an error.
  // Measured on a 9-slide bookend/split probe, that hid 18 of 69 text runs (26%) —
  // and they were exactly the runs that matter, because the translucent ramp is the
  // only ink on a dark panel that isn't already white. Among them: a 2.49:1 closing
  // eyebrow and a 3.50:1 accent-rail eyebrow, both sub-AA in every palette, both
  // invisible to this tool for as long as it has existed (#1207 onward).
  // Channels in `color(srgb …)` are 0–1, so they scale to 0–255 here.
  //
  // AND THEN A GENERAL FALLBACK, because enumerating serializations is a losing
  // game: `color-mix(in oklab, …)` computes to `oklab(0.199 … / 0.62)`, and this
  // engine ships three text-bearing rules in that form (chart-family.css,
  // matrix-grid, kanban — a kanban column header drops 2 real runs). `display-p3`
  // is a fourth shape. Each new one would silently drop runs exactly as `color(srgb
  // …)` did, so the last resort hands the string to a 1x1 canvas and reads the
  // pixel: that resolves ANY color the UA can parse, including spaces this file has
  // never heard of, and gamut-maps wide-gamut values to the sRGB the WCAG formula is
  // defined on. Kept as a FALLBACK rather than the only path because the two exact
  // parsers above are lossless, while the canvas round-trips through premultiplied
  // storage and costs ~1/255 per channel at low alpha.
  // See engineering/decisions/2026-08-11-on-dark-ink-tiers.md.
  const cvs = document.createElement('canvas');
  cvs.width = cvs.height = 1;
  const ctx = cvs.getContext('2d', { willReadFrequently: true });
  const viaCanvas = (s) => {
    // Reset first: an unparseable fillStyle is IGNORED by the setter, which would
    // otherwise silently reuse the previous color and report a confident wrong answer.
    ctx.fillStyle = '#000000';
    ctx.fillStyle = s;
    if (ctx.fillStyle === '#000000' && !/^(#000000|black|rgb\(0,\s*0,\s*0\))$/i.test(s.trim())) return null;
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    const a = d[3] / 255;
    if (a <= 0) return { rgb: [0, 0, 0], a: 0 };
    return { rgb: [d[0], d[1], d[2]], a };
  };
  const parse = (s) => {
    s = String(s);
    if (!s || s === 'none' || s === 'transparent') return s === 'transparent' ? { rgb: [0, 0, 0], a: 0 } : null;
    const csrgb = s.match(/^color\(srgb\s+([^)]+)\)$/);
    if (csrgb) {
      const p = csrgb[1].split(/[\s/]+/).filter(Boolean).map(Number);
      if (p.length >= 3 && !p.some(Number.isNaN)) {
        return { rgb: [p[0] * 255, p[1] * 255, p[2] * 255], a: p.length > 3 ? p[3] : 1 };
      }
      return viaCanvas(s); // e.g. `none` channels
    }
    const m = s.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      if (p.length >= 3 && !p.some(Number.isNaN)) {
        return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
      }
    }
    return viaCanvas(s);
  };
  const over = (fg, bg, a) => fg.map((c, i) => c * a + bg[i] * (1 - a));
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

  // THE 3:1 LARGE-TEXT ALLOWANCE IS NOT GRANTED. Every run is scored against 4.5:1.
  //
  // WCAG AA lets text at 18pt — or 14pt bold — sit at 3:1 instead. Applying that to a
  // slide deck requires knowing a run's size IN POINTS, and this engine cannot hand you
  // one. Every `--fs-*` token is authored in `cqi`, a fraction of the slide's inline
  // size, so a design resolves to a different pixel count on every canvas: `--fs-body`
  // is 21.4px on an `hd` deck and 64.1px on a `4k` one. Reading those raw, a plain
  // `fs >= 24` calls ordinary body copy "large text" on any 4k deck — and both gated
  // galleries are 4k, so the lenient half was the half in force over ordinary prose.
  // Measured: rendering `gallery.md` at both sizes flips 1024 of 1534 runs between
  // thresholds and 317 pass/fail verdicts, on the front-matter `size:` line alone.
  //
  // THE OBVIOUS REPAIR IS TO NORMALIZE, AND IT DOES NOT SURVIVE CONTACT. Dividing each
  // run by its deck's canvas-over-reference ratio fixes landscape exactly, and was built
  // and measured before being deleted in favor of this. It needs ONE reference canvas,
  // and `lib/typography/scale.js` curates THREE scales against TWO reference widths
  // (landscape 1280, square/portrait 1080) with per-orientation coefficients that are
  // explicitly "curated, not derived from one another by a constant". Normalizing every
  // deck against 1280 therefore INFLATES portrait and square: measured on a rendered
  // `size: story` deck, `--fs-body` (47.0px) normalizes to 55.7px and grades as large
  // text at 3:1 — the same defect, moved to the ~20 committed portrait/square decks that
  // no gated surface measures. Nor is 1080 the repair: that file anchors portrait type on
  // the DEVICE ("body = 47px ⇒ ~17px on a phone"), i.e. ~12.75pt, which is normal text.
  // There is no unit conversion here, only a judgment about viewing scale, and the value
  // of the whole allowance is not worth encoding one.
  //
  // SO THE ALLOWANCE IS DROPPED RATHER THAN NORMALIZED. This is STRICTER than WCAG and
  // can never be more lenient, which is the only direction a contrast gate should err in.
  // It costs nothing measured: on all three gated surfaces, zero non-exempt runs sit
  // between 3:1 and 4.5:1. It is also invariant under everything that would have broken
  // the normalized version — a new entry in the size registry, a change to the default
  // canvas, a re-curation of the orientation scales, or a new preview surface.
  //
  // The cost is real but currently theoretical: genuinely poster-sized display type that
  // WCAG would pass at 3:1 fails here. Ornaments that can never clear 4.5:1 are handled
  // where they should be — as named entries in the invariants gate's exemption list, on
  // the record, rather than by a size heuristic that lets every large run through.
  //
  // Settled as #1722; engineering/decisions/2026-08-18-contrast-floor-deck-scale.md.
  const AA = 4.5;

  // Climb ancestors, compositing every translucent paint and every element
  // `opacity`, down to the page. `from` seeds the stack with paints that are NOT
  // ancestors — see the two callers below; without it this function has two blind
  // spots that both report as failures, which is worse than silence because it
  // teaches the reader to ignore the output.
  //
  // `ink` seeds the TOP of the stack with the run's own foreground, so the same
  // walk answers both questions: `resolveStack(el, unders, fg)` is the glyph pixel
  // and `resolveStack(el, unders)` is the pixel beside it. That symmetry is what
  // makes element `opacity` readable at all. CSS `opacity` renders the subtree to a
  // buffer and composites the WHOLE buffer — ink and background together — at that
  // alpha, so it cannot be applied to a foreground and a background independently.
  // Reading computed `color` alone reported ~5:1 for indaco's `redline .stacked`
  // struck clause where the rendered pixels were 3.21:1, two nested washes deep
  // (probe deck; the shipped default variant measured 4.95:1)
  // (`del` at .85 inside a card at .78, both removed in #1640).
  //
  // The early return on an opaque accumulator is deliberately gone: an ancestor
  // ABOVE the first opaque paint can still carry an opacity that scales everything
  // under it, and stopping early would miss it. Absorbing further layers into a
  // saturated accumulator is a no-op, so the full walk costs nothing but is right.
  const resolveStack = (el, from = [], ink = null) => {
    let acc = ink && ink.a > 0 ? { rgb: ink.rgb.slice(), a: ink.a } : null;
    // KNOWN WRONG for two DIFFERENTLY-COLORED translucent layers, and stated here
    // rather than left to be rediscovered: this applies `over(acc.rgb, c.rgb, acc.a)`
    // without weighting the lower layer by its own alpha or renormalizing by the output
    // alpha, so it is not true source-over. Same-color stacks (the case the note below
    // reproduces) come out right; mixed ones do not — measured, white under 20% black
    // under 50% red paints rgb(229,101,101) and this computes rgb(179,102,102).
    // Pre-dates the gate. An earlier draft of this note claimed it was "not live on any
    // gated surface: only 12 runs have ANY sibling underlay and ZERO composite two."
    // BOTH HALVES WERE WRONG — measured by instrumenting this accumulator: 16 runs have
    // an underlay, and TWO mixed-color composites are live, the `<del>` runs on p105
    // `redline` ([45,106,63 @0.1] over [153,27,27 @0.1] over opaque [242,245,250]).
    // True source-over gives rgb(214,211,211) → 5.59:1; this computes rgb(223,205,208)
    // → 5.45:1. The error is 0.14 and both sides clear the floor, so it changes no
    // verdict today — but the sentence licensing "left alone" was a measurement claim
    // that did not reproduce, which is the failure this file keeps making. Still not
    // fixed here (off-path, #1717); now at least described accurately.
    //
    // Accumulated coverage must COMPOUND — `a + c.a * (1 - a)` — not snap to 1 on the
    // second layer. Stamping `a: 1` there truncates the stack at two paints and never
    // reaches the opaque base, so two stacked 20%-black washes on white resolved to a
    // near-white backdrop and a 2.52:1 run was scored as a pass. Reproduced against
    // real Chromium: the painted pixel is rgb(163,163,163). The bug predates the
    // sibling-underlay seeding above, which is what made it reachable — `underlays()`
    // deliberately returns MULTIPLE translucent layers.
    const absorb = (c) => {
      if (!c || c.a <= 0) return false;
      acc = acc === null
        ? { rgb: c.rgb.slice(), a: c.a }
        : { rgb: over(acc.rgb, c.rgb, acc.a), a: acc.a + c.a * (1 - acc.a) };
      return acc.a >= 0.999;
    };
    for (const c of from) absorb(c);
    let node = el;
    while (node && node !== document.documentElement) {
      const cs = getComputedStyle(node);
      absorb(parse(cs.backgroundColor));
      // Leaving this element's group: its opacity scales everything accumulated
      // inside it, ink and background alike.
      const o = parseFloat(cs.opacity);
      if (acc && !Number.isNaN(o) && o < 1) acc.a *= o;
      node = node.parentElement;
    }
    absorb(parse(getComputedStyle(document.documentElement).backgroundColor));
    return acc ? over(acc.rgb, [255, 255, 255], acc.a) : [255, 255, 255];
  };

  /**
   * The ink as it reaches the pixel: its own color, and the alpha it actually paints at
   * after every enclosing `opacity` group has scaled it.
   *
   * `resolveStack` composites the ink all the way down to an opaque triple against the
   * MODELED backdrop, which is the right answer for this file and the wrong one for a
   * caller that sampled the backdrop from the rendered pixels instead. A translucent ink
   * composited over one backdrop and then scored against another is a number describing no
   * pixel anywhere — and translucent ink is not an edge case here: the whole
   * `--on-*-secondary` / `-ghost` / `-watermark` ramp is `color-mix(… N%, transparent)`.
   * Ancestor BACKGROUNDS are deliberately not folded in: a pixel sample already contains
   * them, so absorbing them here would apply them twice.
   */
  const inkAsPainted = (el, ink) => {
    if (!ink || ink.a <= 0) return null;
    let a = ink.a;
    let node = el;
    while (node && node !== document.documentElement) {
      const o = parseFloat(getComputedStyle(node).opacity);
      if (!Number.isNaN(o) && o < 1) a *= o;
      node = node.parentElement;
    }
    return { rgb: ink.rgb.map(Math.round), a: +a.toFixed(4) };
  };

  // BLIND SPOT 2: a paint that is a SIBLING, not an ancestor. This engine
  // absolutely positions the running header/footer at the slide's inset, where a
  // split layout's dark rail is a separate element underneath them — and it paints
  // pagination over stacked fills the same way. An ancestor-only climb sees the
  // section canvas instead of the panel actually behind the glyphs, which scored the
  // `split-panel.watermark` footer as white-on-white (1.00:1) where it renders as
  // white on the accent rail — a reported failure that was not real.
  //
  // Done by GEOMETRY, deliberately not by `document.elementsFromPoint`: that hit-
  // tests in VIEWPORT coordinates, and a rendered deck is one tall document with
  // every slide stacked, so it returns [] for every run below the fold (slide 6's
  // footer sits at y=4281 in a 720px viewport — measured, which is how the first cut
  // of this silently found nothing). It also skips `pointer-events:none`, which this
  // engine sets on several decorative fills. Rects are viewport-relative too, but
  // all of them share that origin, so containment comparisons hold at any scroll.
  //
  // Paint order is approximated by (PAINT LAYER, then DOM order). DOM order ALONE is
  // not enough, and the gap was not academic: it was the single largest source of
  // false failures this tool produced.
  //
  // The running header is out-of-flow chrome emitted FIRST in the section, and a
  // split layout's `.panel-left` rail is a later, in-flow sibling. CSS paints in-flow
  // block backgrounds (CSS 2.2 Appendix E, step 4) BEFORE positioned descendants
  // (step 8), so the rail really is underneath the header — but "later in the DOM"
  // said the opposite, so the rail was rejected as an underlay and the climb fell
  // through to the white section canvas. Measured on the gallery: `.panel-left` is
  // found, DOES contain the header's text rect, and was discarded on DOM order alone
  // — scoring four headers at 1.00:1 white-on-white that render in white on a dark
  // rail and are perfectly legible (p18, p94, p97, p98).
  //
  // `paintLayer` therefore ranks a box coarsely by Appendix E, and a node counts as an
  // underlay when it sits in a LOWER layer, whatever the DOM says. The run's own layer
  // is the max over itself and its ancestors up to the section, because a run paints
  // inside its nearest positioned ancestor's layer, not its own. Within one layer, DOM
  // order still decides — that is the old rule, preserved.
  //
  // NOT "strictly additive", though an earlier draft of this comment said so and that
  // was wrong. A node that PRECEDES the run but sits in a HIGHER layer was accepted by
  // the old DOM-order rule and is rejected now — correctly, because a `z-index: 1` rail
  // really does paint OVER in-flow text that follows it, and calling it a backdrop was
  // the old rule's mistake. A review built the counterexample and rendered it: an
  // absolutely-positioned z-1 panel before an in-flow `<p>` scored 7.17:1 under the old
  // filter and 1.58:1 under this one. Direction defensible, guarantee overstated.
  // Measured on the three gated galleries: 16 rows GAIN a backdrop and 34 LOSE one.
  // (An earlier draft of this line said "0 rows lose", which was wrong — the same shape
  // of unverified measurement the paragraph above apologizes for.) All 34 losses are
  // p91 `state-chart lr` SVG runs dropping `OL.state-nodes`/`LI.state-node` from their
  // underlay set; `.state-chart-edges` is `position:absolute; z-index:0`, deliberately
  // behind the node column, and every dropped paint is transparent, so no ratio moves.
  //
  // Done by GEOMETRY, deliberately not by `document.elementsFromPoint`: that hit-
  // tests in VIEWPORT coordinates, and a rendered deck is one tall document with
  // every slide stacked, so it returns [] for every run below the fold (slide 6's
  // footer sits at y=4281 in a 720px viewport — measured, which is how the first cut
  // of this silently found nothing). It also skips `pointer-events:none`, which this
  // engine sets on several decorative fills. Rects are viewport-relative too, but
  // all of them share that origin, so containment comparisons hold at any scroll.
  //
  // Ancestors are excluded — the climb above already owns them.
  // `rect` defaults to the element box, but a caller with a tighter one should pass
  // it: the running header/footer are FULL-SLIDE-WIDTH boxes holding short
  // left-aligned text, so their box center lands on the far side of a split layout
  // from the glyphs. Sampling the box center scored slide 6's footer against the
  // white right half while its text sits on the accent rail — right arithmetic,
  // wrong place. The text loop passes the text node's own Range rect.
  //
  // STILL APPROXIMATE, in two named ways. It does not build real stacking contexts
  // (an `opacity`/`transform`/`filter` ancestor makes one, and z-index is scoped to
  // it), and it does not hit-test glyphs, so a box that CONTAINS the run's center but
  // paints only around it still counts. Both fail toward a backdrop closer to the
  // truth than the section canvas.
  // `z-index` applies to a positioned box AND to a flex/grid ITEM, which may be
  // `position: static` — a census of the gated galleries found 248 / 248 / 134 such
  // boxes (`FOOTER`, `DIV.tile-progress` and `DIV.cell-masthead`, all at z=30), every
  // one of which an earlier cut of this ranked as layer 0. (An earlier draft of this
  // comment said "179"; that number reproduced on no surface.) That under-estimates the run's own layer and drops it back onto the
  // DOM-order fallback — the same shape as the bug this whole function fixes.
  const paintLayer = (n) => {
    const cs = getComputedStyle(n);
    const parent = n.parentElement;
    const zApplies = cs.position !== 'static'
      || (parent && /\b(flex|grid)\b/.test(getComputedStyle(parent).display));
    if (!zApplies) return 0;                         // in-flow background (step 4)
    const auto = cs.zIndex === 'auto';
    const z = auto ? 0 : (parseInt(cs.zIndex, 10) || 0);
    if (z < 0) return -1;                            // negative-z (step 3)
    // A static flex/grid item with `z-index: AUTO` stays in the in-flow band. An
    // EXPLICIT `z-index: 0` on one does create a stacking context (Flexbox §5.4,
    // Grid §6) and paints at step 8, so it must not be folded in with auto — testing
    // `z === 0` did exactly that, because `auto` had already been normalized to 0.
    if (cs.position === 'static' && auto) return 0;
    return z === 0 ? 1 : 1 + z;                      // positioned/stacking, then above
  };
  /**
   * A box paints in the highest layer it or any ancestor up to `stop` establishes.
   *
   * Seeded from the node's OWN layer, not from 0. Seeding at 0 and only `Math.max`ing
   * made `paintLayer`'s `return -1` unreachable, which silently retired the negative-z
   * tier: `.lattice-bg` (z=-2) and `.image-scrim` (z=-1) ranked 0 instead of below the
   * in-flow band, so they stopped being admitted as underlays on layer alone and fell
   * back to "must precede in the DOM". Emit a canvas fill AFTER the content and every
   * run over it resolves to the section — a false 1.00:1, the exact class this function
   * exists to remove. Latent today only because `.lattice-bg` happens to be emitted
   * first; that is luck, not design.
   */
  const stackLayer = (n, stop) => {
    let best = paintLayer(n);
    for (let x = n.parentElement; x && x !== stop; x = x.parentElement) {
      best = Math.max(best, paintLayer(x));
    }
    return best;
  };
  /**
   * Every non-ancestor box in the section that paints UNDER `rect`, topmost first.
   * `underlays` and `rasterUnder` differ only in which paint they read off it, so the
   * traversal, the layer rule and the containment test live here once.
   */
  const under = (el, rect) => {
    const r = rect?.width ? rect : el.getBoundingClientRect();
    if (!r.width || !r.height) return [];
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const sec = el.closest('section[data-lattice-slide]');
    if (!sec) return [];
    // The run paints in its nearest positioned ancestor's layer — take the max up
    // to (but excluding) the section, which is the stacking root here.
    const elLayer = stackLayer(el, sec);
    const found = [];
    let idx = 0;
    for (const node of sec.querySelectorAll('*')) {
      idx += 1;
      if (node === el || node.contains(el) || el.contains(node)) continue;
      // Ancestor-aware on BOTH sides: a static child of a high-z wrapper paints in the
      // wrapper's layer, and comparing its own box against `elLayer` would admit it as
      // an underlay while it actually paints above.
      const layer = stackLayer(node, sec);
      const precedes = !!(node.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);
      // A lower layer is under the run whatever the DOM order; an equal layer falls
      // back to the original "must precede" rule.
      if (!(layer < elLayer || (layer === elLayer && precedes))) continue;
      // THE BOXES THE NODE ACTUALLY GENERATES, not their union. `getBoundingClientRect()`
      // on a LINE-WRAPPED INLINE returns the union of its line fragments, and an inline
      // paints only the fragments — the union's empty corner is bare canvas. Measured on
      // gallery.md p105 (`redline`) at atelier: `<ins>Provider's standard export format</ins>`
      // wraps line 1 -> line 2, so its union spans the full column, and `<ins>ninety (90)</ins>`
      // sitting mid-line-2 was scored on a DOUBLED `--pass-bg` band (bg 184,194,174) that is
      // painted nowhere. The rasterized slide reads 204,208,190 there — one band — and the
      // run goes 4.27:1 -> 5.02:1. Four runs on that one slide, on 19 palettes.
      // A block box generates exactly one rect equal to its border box, so nothing else moves.
      const rects = node.getClientRects();
      const boxes = rects.length ? rects : [node.getBoundingClientRect()];
      let hit = false;
      for (const b of boxes) {
        if (!b.width || !b.height) continue;
        if (cx < b.left || cx > b.right || cy < b.top || cy > b.bottom) continue;
        hit = true; break;
      }
      if (!hit) continue;
      found.push({ node, layer, idx });
    }
    found.sort((a, b) => (a.layer - b.layer) || (a.idx - b.idx));
    found.reverse();
    return found.map((f) => f.node);
  };

  /**
   * Does a paint this tool CANNOT SAMPLE lie under the run — a raster
   * `background-image`, or a gradient? Every backdrop here is read off
   * `backgroundColor`, so when the answer is yes the reported ratio is not merely
   * approximate, it is measuring the wrong thing: the climb sails past the picture
   * and lands on whatever opaque color sits behind it, usually the section canvas.
   *
   * Live case: `image statement` builds its backdrop as `div.lattice-bg` (a
   * `background-image: url(…)`) with a `div.image-scrim` gradient over it, and paints
   * white display text on top. Both divs have a fully transparent `backgroundColor`,
   * so the run scored 1.00:1 white-on-white against the section while rendering as
   * white on a dark photograph — legible, and nothing like the number.
   *
   * The flag is reported rather than acted on: this file keeps listing such runs so a
   * human can see them, and the invariants gate carries the policy (an explicit,
   * justified exemption) so the two concerns stay in one place each. Ancestors count
   * as well as underlays — a scrim on a wrapper is the same problem.
   *
   * `url()` ONLY, DELIBERATELY — NOT every `background-image`. The first cut of this
   * flagged any non-`none` background-image, and a review measured what that actually
   * caught: 205 of 1518 runs on the gallery (13.5%), because this engine paints RULES
   * with two-stop same-color `linear-gradient`s — a `glossary` row, `divider`, `code`,
   * `compare-table`. An exemption keyed on that flag stopped meaning "over a photograph"
   * and started meaning "one run in eight", wide enough to swallow an injected 1.11:1
   * regression on `glossary th` and a 1.2:1 one on twelve `divider` headlines while the
   * gate stayed green. A gradient is at least COMPOSED of colors this tool could in
   * principle sample; a decoded raster is not, and the raster is the case that motivated
   * the flag. So the net is the narrow one, and the invariants gate additionally pins the
   * exact count — breadth alone is never the only thing standing between a real defect
   * and a green build.
   */
  const rasterUnder = (el, rect) => {
    const hasImage = (n) => {
      const bi = getComputedStyle(n).backgroundImage;
      return !!bi && bi !== 'none' && /(^|[\s,])url\(/.test(bi);
    };
    for (const n of under(el, rect)) if (hasImage(n)) return true;
    let node = el;
    while (node && node !== document.documentElement) {
      if (hasImage(node)) return true;
      node = node.parentElement;
    }
    return false;
  };

  // `under()` already yields topmost-first, so composite straight down it until an
  // opaque paint closes the stack.
  const underlays = (el, rect) => {
    const out = [];
    for (const node of under(el, rect)) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (!c || c.a <= 0) continue;
      out.push(c);
      if (c.a >= 1) break;
    }
    return out;
  };

  const out = [];
  // THE DOCUMENTED-EXEMPT DECORATIVE TIER. The palette contract makes `--text-muted`
  // WCAG-exempt by design — it inks the running header/footer, pagination and faint
  // decorative glyphs, and this file's own header says that tier "will always
  // report". Reporting it as a FAILURE anyway is not harmless: it padded the count by
  // roughly half, and a reader who learns to skim past known-bogus rows is exactly
  // the reader who skims past a real one. So exempt runs are resolved per section,
  // scored, and reported in their own bucket instead of inflating the verdict.
  // `--border` joins it for the same reason: `split-panel.steps`' oversized step
  // numeral is painted with it deliberately (z-index 0, pointer-events none).
  // Resolved via a probe element, NOT `getPropertyValue('--text-muted')` — that
  // returns the raw token text (`light-dark(#6B7F9A, …)`), which no color parser
  // can read. Assigning it to `color` makes the browser resolve light-dark(),
  // var() chains and the section's own color-scheme for us.
  const exemptInks = new Set();
  for (const sec of document.querySelectorAll('section[data-lattice-slide]')) {
    const probe = document.createElement('span');
    probe.style.display = 'none';
    sec.appendChild(probe);
    // `--muted-mark` joins the pair for #1715: the decorative half of what
    // `--text-muted` used to be moved to it (rules, hairlines, empty/skipped marks,
    // glyph washes), so a run painted from it is exactly the decoration this bucket
    // exists to hold. Leaving it out would have scored those runs at the 4.5 TEXT
    // threshold — and `--text-muted` itself, which now carries a 4.5 floor of its own,
    // is kept here rather than dropped: a run of it can still legitimately be chrome,
    // and the bucket is a ceiling on what escapes measurement, not a license.
    for (const tok of ['--text-muted', '--muted-mark', '--border']) {
      probe.style.color = `var(${tok})`;
      const v = parse(getComputedStyle(probe).color);
      if (v && v.a > 0) exemptInks.add(v.rgb.map(Math.round).join(','));
    }
    probe.remove();
  }
  for (const sec of document.querySelectorAll('section[data-lattice-slide]')) {
    const page = sec.getAttribute('data-lattice-slide');
    const cls = sec.getAttribute('data-class') || '';
    const walker = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    let n;
    while ((n = walker.nextNode())) {
      const t = n.textContent.trim();
      if (!t) continue;
      const el = n.parentElement;
      if (!el || seen.has(el)) continue;
      seen.add(el);
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none') continue;
      // SCREEN-READER-ONLY TEXT NEVER PAINTS, and scoring it invents a run.
      // The house idiom for "in the accessibility tree, not on the slide" is a
      // 1x1 box with `overflow:hidden` and a clip that leaves zero area —
      // `.cell-sr-label` (matrix-grid) and `.lattice-description` (the player).
      // Neither of them is `display:none` or
      // `visibility:hidden`, because either would take the text back out of the
      // accessibility tree, which is the whole point of the idiom. So they walk
      // straight past the two guards above and get scored against whatever
      // backdrop the ancestor chain resolves to — the same false-positive class
      // the SVG `<desc>`/`<style>` exclusion below exists for, and the same fix:
      // text the renderer never draws is not a contrast finding.
      //
      // The test is the BOX, not a class name: a 1x1 border box that clips its
      // overflow cannot show a glyph at any font size this engine uses, and
      // nothing real in the tree is shaped that way. Keying on the class names
      // would miss the next sr-only span someone writes.
      const box = el.getBoundingClientRect();
      if (cs.overflow === 'hidden' && box.width <= 1 && box.height <= 1) continue;
      const fs = parseFloat(cs.fontSize);
      if (!fs) continue;
      // SVG TEXT IS PAINTED BY `fill`, NOT `color`. Reading `color` on an SVG
      // <text> returns whatever it inherited from the section, so every chart
      // label in this engine was being scored against a foreground that is not
      // the one on screen — confidently, with a plausible number. Measured on one
      // word-cloud word: `color` reported 11.96:1 while its actual `fill` gave
      // 1.20:1. That blind spot is why a regression which drove word fills to
      // 1.11:1 on 12 palettes passed this tool, and why any "N sub-AA runs" figure
      // quoted over a chart deck was meaningless.
      //
      // `fill` also applies to HTML elements as an inherited SVG property, so it is
      // only authoritative INSIDE an <svg>; elsewhere it is usually the initial
      // `rgb(0, 0, 0)` and must be ignored in favor of `color`. `stroke` is the
      // paint for text drawn as an outline (none in-tree today, but it is the same
      // trap and costs one line).
      // SVG carries NON-RENDERING text elements: <desc>, <title> and <metadata> are
      // accessibility/metadata payloads the renderer never paints. They inherit the
      // initial `fill: rgb(0,0,0)`, so reading fill without excluding them invents
      // failures — a <desc> on a dark canvas scored 1.22:1 for ink that does not
      // exist. (This is the false-positive class the `fill` fix itself introduced.)
      // `style` and `script` are here for the same reason as desc/title/metadata: they carry
      // TEXT that never paints. Chrome does not report `display:none` for an SVG-scoped
      // <style>, so its CSS source was walked as a visible run and scored — a Mermaid
      // diagram's own stylesheet showed up as a 1.17:1 offender reading
      // "#lattice-mmd-1{font-family:'Outfit'…". Found by the palette sweep, which scores
      // every palette and so surfaced it on the ones where the ratio happened to fail.
      const SVG_NON_RENDERING = new Set(['desc', 'title', 'metadata', 'style', 'script']);
      const inSvg = typeof el.ownerSVGElement !== 'undefined' && el.ownerSVGElement !== null;
      if (inSvg && SVG_NON_RENDERING.has(el.tagName.toLowerCase())) continue;
      let fg = null;
      if (inSvg) {
        const fillPaint = cs.fill && cs.fill !== 'none' ? parse(cs.fill) : null;
        const strokePaint = cs.stroke && cs.stroke !== 'none' ? parse(cs.stroke) : null;
        fg = fillPaint && fillPaint.a > 0 ? fillPaint : strokePaint;
      }
      if (!fg) fg = parse(cs.color);
      if (!fg || fg.a === 0) continue;
      // A Range around the text node is the tightest true box for the glyphs — see
      // `underlays`. Cheap, and exact where the element box is not.
      const tr = document.createRange();
      tr.selectNodeContents(n);
      // #1704's resolveStack (ink and backdrop through the SAME opacity-group
      // stack) with the run's own rect hoisted, so `rasterUnder` below tests the
      // glyphs' box rather than the element's.
      const trect = tr.getBoundingClientRect();
      const unders = underlays(el, trect);
      const bg  = resolveStack(el, unders);
      const fgc = resolveStack(el, unders, fg);
      const w = parseInt(cs.fontWeight, 10) || 400;
      out.push({
        page, cls, tag: el.tagName.toLowerCase(),
        text: t.slice(0, 44), fs: +fs.toFixed(1), w,
        fg: fgc.map(Math.round), bg: bg.map(Math.round),
        r: +ratio(fgc, bg).toFixed(2), need: AA,
        exempt: exemptInks.has(fgc.map(Math.round).join(',')),
        imgBackdrop: rasterUnder(el, trect),
        // The glyphs' own box in viewport coordinates, carried so a caller that samples
        // the backdrop from RENDERED PIXELS rather than from the ancestor chain knows
        // where to look (tools/check-player-contrast.js). Costs nothing here.
        rect: { x: trect.x, y: trect.y, w: trect.width, h: trect.height },
        ink: inkAsPainted(el, fg),
      });
    }
    // pseudo-elements carry real text in this engine (axis labels, badges)
    for (const el of sec.querySelectorAll('*')) {
      for (const pe of ['::before', '::after']) {
        const cs = getComputedStyle(el, pe);
        const content = cs.content;
        if (!content || content === 'none' || content === 'normal') continue;
        // Any VISIBLE glyph counts, not just ASCII alphanumerics. `/[A-Za-z0-9]/` was a
        // content heuristic standing in for a paints-anything question, and it silently
        // dropped 24 real painted marks per gallery — the `❯` chevrons, `·` separators,
        // `✦`/`✧` stars, `›`, `↻`, `→`, `—` and curly quotes this engine draws in
        // pseudo-elements — plus any non-Latin label. Their ink could be regressed to any
        // ratio unmeasured. `content: ""` and pure-punctuation-free whitespace still drop.
        const glyphs = content.replace(/^["']|["']$/g, '').trim();
        if (!glyphs || glyphs === 'none' || /^[\s\u200b]*$/.test(glyphs)) continue;
        const fs = parseFloat(cs.fontSize); if (!fs) continue;
        const fg = parse(cs.color); if (!fg) continue;
        // BLIND SPOT 1: the PSEUDO's own background. A pseudo is not in the DOM, so
        // an ancestor climb starting at its originating element steps straight past
        // the fill the pseudo paints for itself — which in this engine is usually the
        // whole point of the pseudo (the `RECOMMENDATION` chip on split-compare's
        // verdict, the numbered counter disc on split-panel.watermark). Both scored
        // 1.09:1 white-on-near-white while rendering as white on a solid accent fill.
        // Seed the stack with the pseudo's own paint, THEN the owner's sibling
        // underlays, then climb. A pseudo needs `underlays()` at least as much as a
        // text node does — the pagination pseudo on a cover sits over an absolutely
        // positioned rail (base.modifiers.css), and without this it scored 1.00:1
        // white-on-white where it really renders 11.29:1 on the rail.
        const seed = [parse(cs.backgroundColor), ...underlays(el)].filter(Boolean);
        const bg  = resolveStack(el, seed);
        const fgc = resolveStack(el, seed, fg);
        const w = parseInt(cs.fontWeight, 10) || 400;
        out.push({
          page, cls, tag: el.tagName.toLowerCase() + pe,
          text: content.replace(/^"|"$/g, '').slice(0, 44), fs: +fs.toFixed(1), w,
          fg: fgc.map(Math.round), bg: bg.map(Math.round),
          r: +ratio(fgc, bg).toFixed(2), need: AA,
          exempt: exemptInks.has(fgc.map(Math.round).join(',')),
          imgBackdrop: rasterUnder(el),
          // The OWNER's box, not the pseudo's — CSS exposes no rect for a pseudo-element.
          // Flagged as such so a pixel-sampling caller knows this one box is an
          // approximation and can keep the modeled backdrop instead of trusting a sample
          // that may land beside the pseudo rather than under it.
          rect: (() => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })(),
          rectIsOwner: true,
          ink: inkAsPainted(el, fg),
        });
      }
    }
  }
  return out;
};

/**
 * EXPORTED so the invariants gate measures with EXACTLY this code (HARD RULE #15 /
 * #1: one source of truth). `test/integration/invariants/slide-contrast.test.js`
 * requires `{ PROBE }` and evaluates it in its own page — a second, drifting copy of
 * a WCAG implementation is precisely the "two gates disagreeing about a ratio" that
 * axe-a11y.test.js disables its own contrast rule to avoid.
 */
module.exports = { PROBE };

async function main() {
  const files = process.argv.slice(2);
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--font-render-hinting=none'],
  });
  let fails = 0, total = 0;
  for (const f of files) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720, deviceScaleFactor: 1 });
    await page.goto('file://' + require('path').resolve(f), { waitUntil: 'networkidle0' });
    await new Promise((r) => setTimeout(r, 400));
    const rows = await page.evaluate(PROBE);
    total += rows.length;
    const under = rows.filter((x) => x.r < x.need);
    const bad = under.filter((x) => !x.exempt);
    const exempt = under.filter((x) => x.exempt);
    console.log(`\n${'='.repeat(78)}\n${f}  —  ${rows.length} text runs, ${bad.length} below AA${exempt.length ? ` (+${exempt.length} in the WCAG-exempt decorative tier, not counted)` : ''}\n${'='.repeat(78)}`);
    for (const b of bad) {
      fails++;
      console.log(
        `  p${String(b.page).padStart(2)} ${b.cls.padEnd(30).slice(0, 30)} ${b.tag.padEnd(14)}` +
        ` ${String(b.fs).padStart(5)}px/${String(b.w).padEnd(3)} ${b.r.toFixed(2)}:1 (need ${b.need})` +
        `  fg rgb(${b.fg}) on rgb(${b.bg})${b.imgBackdrop ? '  [image backdrop — ratio not measurable]' : ''}\n      "${b.text}"`
      );
    }
    // font-size report for the matrix axis labels specifically
    const axis = rows.filter((x) => /REACH|COGNITION/i.test(x.text));
    if (axis.length) {
      console.log('  ── axis label sizes ──');
      for (const a of axis) console.log(`     ${a.text.padEnd(24)} ${a.fs}px  weight ${a.w}  ${a.r}:1`);
    }
    await page.close();
  }
  await browser.close();
  console.log(`\n${'='.repeat(78)}\n${total} runs checked · ${fails} below AA\n`);
  process.exit(fails ? 1 : 0);
}

if (require.main === module) main();
