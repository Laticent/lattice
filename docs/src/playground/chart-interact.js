// CHART INTERACTION — parent-hosted, so the slide iframe stays a pure paint surface
// (isolation + screen===PDF parity untouched). See
// engineering/decisions/2026-06-19-css-3d-charts-feasibility.md ›
// "Present/practice interactive integration".
//
// Renamed off the `drawing-board-` prefix (2026-07-15): shared infra for the SURVIVING
// Playground plus the frozen Drawing-Board present/practice, per the 2026-07-03
// studio-succession code-ownership boundary. The Playground imports this (not a
// drawing-board-* module), so removal of the frozen surfaces is a clean `git rm`.
//
// The slide is a same-origin `srcdoc` iframe under a full-stage pointer-capture
// overlay. Rather than fight that overlay, the interaction lives on the PARENT
// side of the boundary:
//   - a thin hit-surface sits ABOVE the capture layer, but only over the chart's
//     rectangle (the rest of the stage keeps swipe / tap-to-reveal / edge-arrows);
//   - the popover renders as parent present-chrome in stage coordinates, reading
//     the mark's inert <template class="chart-detail" data-mark> by index;
//   - reveal is one command bound to pointer (in the hit-surface), number keys
//     (1–9 → slice n, 0/Esc clears), and (later) a console control.
// Navigation never leaves keyboard / edge-arrows / wheel, so ceding the chart's
// own rectangle is safe — there is no click-to-advance to lose.
//
// Cross-iframe is fine because `srcdoc` is same-origin: we read the chart's
// geometry + `elementFromPoint` hit + the legend/template content directly.
//
// Popover POSITIONING is delegated to Floating UI (@floating-ui/dom — the same
// engine shadcn/Radix popovers run on), driven by a VIRTUAL REFERENCE built from
// the chart's geometry. This is the right tool for a cross-iframe anchor (no DOM
// node to point at) and gives real flip/shift/collision handling instead of a
// hand-rolled clamp. A direct dependency (not borrowed transitively from Radix).
import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom';
import { frameGeom as sharedFrameGeom } from './frame-geom.js';

const REDUCED = (() => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
})();
const COARSE = (() => {
  try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
})();

function el(cls) { const d = document.createElement('div'); if (cls) d.className = cls; return d; }

/**
 * @param {object} o
 * @param {HTMLElement} o.stage  the .db-pp-stage (positioning context for our chrome)
 * @param {() => HTMLIFrameElement} o.getFrame  the live slide iframe
 * @param {boolean} [o.lift=true]  the geometric half of the emphasis — a pie slice steps out, a dot
 *   grows. The dim and the elevation shadow apply either way; reduced motion turns this off.
 * @param {() => void} [o.onReveal]  fired when a slice opens (practice uses it to pause autoplay)
 * @param {(detail: object|null) => void} [o.onDetail]  RENDER HOOK. When provided, the
 *   host owns the popover UI (e.g. the Playground renders the shadcn Popover): this is
 *   called with `{ label, value, dot, body, meta, lean, x, y }` on reveal (x/y = the
 *   cursor point in parent-viewport coords) and `null` on clear, and the built-in vanilla
 *   popover is suppressed. Omit it (the frozen Drawing Board) to keep the vanilla popover.
 * @param {boolean} [o.hoverAny=false]  PREVIEW mode — instead of a parent hit-surface
 *   pinned over one onSlide()-designated chart (Present/Practice), listen on the
 *   same-origin iframe document and reveal whichever chart is under the pointer, so
 *   an author scrolling a multi-slide deck gets the detail in place AS THEY EDIT.
 *   No hit-surface is pinned (it would eat the iframe's own pointer events); the
 *   popover stays a parent overlay. Re-bind to the doc on every srcdoc rewrite.
 */
export function createChartInteract({ stage, getFrame, lift = true, onReveal, onDetail, hoverAny = false }) {
  const useLift = lift && !REDUCED;

  // Chart-family vocabulary. Every SVG chart — pie included, now that it rides
  // the shared mark-detail substrate — emits ONE vocabulary: each mark carries
  // data-mark; the inert payload is .chart-details holding template.chart-detail.
  // (.piechart-svg etc. are just the per-chart figure classes the reveal layer
  // scopes to.) See engineering/decisions/2026-06-20-chart-detail-reveal-family.md.
  // The chart ROOT the interaction scopes to. Tier-1 roots are the SVG sheet
  // itself (the marks are SVG elements). Tier-2 roots are HTML containers (the
  // marks are HTML elements — state-chart nodes today): the root is the figure,
  // so its nodes and edge overlay are one scope (the figure must NOT contain the inert .chart-details
  // payload, or its <template data-mark> would be miscounted as a mark — the
  // kernels emit the payload as a sibling). See
  // engineering/decisions/2026-06-20-chart-detail-reveal-family.md.
  // Every entry is the chart's own <svg>, which is what the Anima host mounts as
  // the live clone — so the same selector finds the static poster AND the animated
  // copy. `.gantt-chart` used to appear here because the gantt was HTML; it is
  // SVG-native now, so it is matched by `.gantt-svg` like every other chart.
  // The state-chart lists BOTH its figure and its `.state-chart-edges` svg: the
  // figure is the static root (and still holds the measuring column's marks),
  // while the svg is what gets cloned onto the live stage, so listing only the
  // figure would leave the popover unbound during motion.
  const CHART_SVG_SEL = '.bar-svg, .bullet-svg, .line-svg, .scatter-svg, .slope-svg, .stacked-bar-svg, .waterfall-svg, .piechart-svg, .funnel-svg, .map-svg, .quadrant-svg, .radar-svg, .hub-spoke-svg, .heatmap-svg, .state-chart-figure, .state-chart-edges, .gantt-svg';
  // The same list scoped to the Anima live stage — each selector must be prefixed individually (a bare
  // `.scene-live ${CHART_SVG_SEL}` would only scope the FIRST of the comma list). Prefers the clone
  // EXPLICITLY over inferring visibility from box size (see chartSvgIn).
  const LIVE_CHART_SVG_SEL = CHART_SVG_SEL.split(',').map((s) => `.scene-live ${s.trim()}`).join(', ');
  const DETAILS_SEL = '.chart-details';
  const TPL_SEL = 'template.chart-detail';
  const MARK_SEL = '[data-mark]';
  // A TAP PROXY — text that names one mark (a slope entity's name and values, a funnel stage's
  // label, a waterfall's category, a quadrant dot's name, a pie or map legend row) carries
  // `data-mark-for="i"`. It is a
  // separate attribute from `data-mark` so the proxy never becomes a mark: `chartToScene` strokes
  // every highlighted `[data-mark]` and the Present Guide ranks `[data-label]` nodes, and neither
  // should see the labels. Only this file reads it.
  const PROXY_SEL = '[data-mark-for]';
  const markIndex = (elm) => {
    if (!elm) return -1;
    const v = elm.dataset.mark;
    return v == null ? -1 : Number(v);
  };

  // Parent chrome: a transparent container (pointer-events:none — lets the
  // capture layer/HUD through) holding the hit-surface and the popover, which
  // opt back into pointer-events as needed.
  const root = el('db-pp-chartlayer');
  if (hoverAny) root.classList.add('db-pp-chartlayer--preview');
  const hit = el('db-pp-charthit');
  const pop = el('db-pp-chartpop');
  pop.setAttribute('role', 'status');
  pop.setAttribute('aria-live', 'polite');
  // In preview mode the hit-surface is never pinned (we listen on the iframe doc
  // directly), so don't even mount it — it must never cover the live preview.
  if (hoverAny) root.append(pop); else root.append(hit, pop);
  stage.append(root);

  let curIdx = -1;       // current slide index
  let curSection = null; // the <section> whose chart is active (scopes all wedge/legend queries)
  let chartEl = null;    // the <svg class="piechart-svg"> in the current section (same-origin)
  let detailsEl = null;  // its sibling .chart-details (the <template> payload)
  let chartRO = null;    // re-pins the hit-surface when the CURRENT chart's own box settles (see setChart)
  let frameMO = null;    // re-pins on the frame's LATE transform/opacity reveal (loader host — see watchFrame)
  let watchedFrame = null; // the iframe element frameMO is currently attached to
  let reflowRaf = 0;     // pending coalesced reflow (rAF handle) — collapses an observer BURST into one
  let sliceN = 0;        // slice count on the current chart
  let openSlice = -1;    // which slice's detail is showing (-1 = none)
  let chartBox = null;   // current chart rect in stage coords (Present hit-surface)
  let boundDoc = null;   // iframe document we've bound hover listeners to (preview mode)
  let stopAutoUpdate = null; // Floating UI autoUpdate teardown (while a popover is open)
  const timers = [];     // pending reflow re-pins (cleared on slide change / destroy)

  const doc = () => { try { return getFrame().contentDocument; } catch { return null; } };

  // The frame's on-screen rect PLUS its CSS-transform scale — see ./frame-geom.js for the why.
  // Lifted out of this closure when the Guide rung became a second consumer: two copies of a
  // coordinate bridge is how they end up disagreeing by a pane width (HARD RULE #15).
  const frameGeom = () => sharedFrameGeom(getFrame());

  // ── generic mark access (one code path for every chart kind) ────────────────
  // Marks are the addressable data elements INSIDE the chart <svg> (pie wedges,
  // funnel bands, map regions, quadrant dots, radar axis labels). Scoping to
  // chartEl excludes the inert <template> payloads (they live in a sibling
  // .chart-details div) and legend swatches (no data-mark).
  const markEls = () => (chartEl ? [...chartEl.querySelectorAll(MARK_SEL)] : []);
  // The chart svg to bind to — the visible one when a chart has both a hidden poster and a live
  // animated clone (see setChart). PREFER the Anima clone EXPLICITLY: it's mounted inside `.scene-live`
  // (the host's live stage), so a direct `.scene-live` query is robust to HOW the poster is hidden. Only
  // if there's no live stage (a static chart) do we fall back to the "has a box" heuristic — which works
  // ONLY because the Anima host hides the poster with `display:none` (docs/src/lib/anima/hydrate.ts) →
  // zero box; a future `visibility:hidden`/`opacity:0` would keep a box and fool the heuristic, but NOT
  // the explicit `.scene-live` query above (see docs/src/lib/chart-anima.ts, which flags the coupling).
  const chartSvgIn = (sec) => {
    const live = sec.querySelector(LIVE_CHART_SVG_SEL);
    if (live) return live;
    const all = [...sec.querySelectorAll(CHART_SVG_SEL)];
    return all.find((s) => s.getBoundingClientRect().width > 0) || all[0] || null;
  };
  const marksFor = (i) => markEls().filter((m) => markIndex(m) === i);
  // Distinct mark indices present (a map group shares one index across regions),
  // so number keys / range checks count data points, not DOM nodes.
  const markCount = () => {
    const s = new Set(markEls().map(markIndex).filter((n) => n >= 0));
    return s.size;
  };

  // Title / value / color for mark i, from whichever source the kind provides:
  //   label  — the mark's data-label (funnel/map/quadrant) · its own text node
  //            (radar axis label) · the legend row (pie has no text on a wedge).
  //   value  — data-value · the legend value column (pie).
  //   color — the legend swatch's computed fill (pie/map gradients are URL refs,
  //            meaningless in the parent) · else the mark's own computed fill.
  function infoFor(i) {
    const el = marksFor(i)[0] || null;
    let label = '';
    let value = '';
    if (el && el.dataset.label != null) {
      // substrate marks self-describe (funnel/map/quadrant)
      label = el.dataset.label;
      value = el.dataset.value || '';
    } else if (el && isTextMark(el)) {
      // radar axis label IS the text node — but its text may be split across
      // <tspan> lines now that in-diagram labels wrap, so read it the same way
      // `textOf` reads a wrapped legend row rather than testing for "no child
      // elements" (which a wrapped label always fails, silently falling through
      // to the pie branch and titling the popover with a SERIES name).
      label = tspanText(el);
    } else {
      // pie — the wedge has no text, so read the SVG legend row by index
      label = textOf('.chart-key-label', i);
      value = textOf('.chart-key-value', i);
    }
    const swatch = curSection?.querySelectorAll('.chart-key-swatch')[i];
    // A usable swatch color — reject the SVG `fill` INITIAL (black) that an HTML
    // box computes to, plus transparents, so an HTML mark never shows a stray
    // black dot. Returns null when there's no real color (→ the dot is hidden).
    // A paint-server reference (`url("#cart-fill-…")` — every gradient-filled bar, band and wedge) is
    // not a color either: as a CSS background it paints nothing, so the card showed an EMPTY dot
    // that still took its space and pushed the title right. Rejecting it falls through to the
    // mark's stroke, which is its real outline color.
    const usable = (c) => (c && c !== 'none' && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)' && !c.startsWith('url(')) ? c : null;
    let dot = null;
    try {
      if (swatch) {
        dot = usable((swatch.ownerDocument?.defaultView || window).getComputedStyle(swatch).fill) || 'currentColor';
      } else if (el) {
        const cs = (el.ownerDocument?.defaultView || window).getComputedStyle(el);
        dot = typeof el.getBBox === 'function'
          // SVG mark — fill (or stroke) IS the wedge color.
          ? (usable(cs.fill) || usable(cs.stroke) || 'currentColor')
          // HTML mark (gantt bar, state node): `fill` is the SVG initial (black)
          // on an HTML box — useless. These paint their status via the canonical
          // chart fill, whose --fill-ink shows as the left ACCENT BORDER; read
          // that resolved color — but only when a left border actually exists
          // (borderLeftColor otherwise computes to currentColor, never
          // transparent). A mark with no accent (e.g. a milestone diamond
          // container) returns null → the dot is hidden, not a dark blob.
          : (cs.borderLeftStyle !== 'none' && parseFloat(cs.borderLeftWidth) > 0
              ? usable(cs.borderLeftColor) : null);
      }
    } catch { /* cross-doc / detached */ }
    return { label, value, dot };
  }

  // ── geometry ──────────────────────────────────────────────────────────────
  // Map the chart's box (measured inside the iframe) into stage coordinates and
  // pin the hit-surface over it. Same for any open popover.
  function reflow() {
    // The live svg can change UNDER a binding: the Anima host mounts its clone ASYNCHRONOUSLY (after a
    // pinned onSlide already bound the poster), then hides the poster. Re-resolve to the visible svg so
    // a first-view pinned chart (Present, entered directly on a motion-on slide) recovers the clone once
    // it mounts — setChart is otherwise sticky (same-section no-op). The scheduled reflow timers give it
    // several chances; harmless in hoverAny, where each pointer move already re-resolves via setChart.
    if (curSection) {
      const live = chartSvgIn(curSection);
      // Re-target the per-chart ResizeObserver too — the clone is a DIFFERENT node than the poster
      // chartRO was bound to in setChart, so without this the animated chart's async layout-settle
      // re-pin (pinned mode) would keep watching the now-hidden poster and never fire.
      if (live && live !== chartEl) { chartEl = live; observeChart(); }
    }
    if (!chartEl) { hide(); return; }
    let g, sr, cr;
    try { g = frameGeom(); sr = stage.getBoundingClientRect(); cr = chartEl.getBoundingClientRect(); }
    catch { hide(); return; }
    if (!g) { hide(); return; }
    // A zero box means the chart node is detached (a section PATCH replaced it
    // without a db-frame-ready, so curSection is now orphaned) or scrolled
    // off-screen (content-visibility). Either way an open preview popover is stale
    // — dismiss it (it re-resolves on the next hover). hide() only clears the
    // Present hit-surface, so in hoverAny we clear() explicitly.
    if (!cr.width || !cr.height) { if (hoverAny && openSlice >= 0) clear(); hide(); return; }
    // `cr` is in the iframe's INNER coords; scale it into parent space (× S) before subtracting the
    // stage origin — otherwise the hit-surface mis-sizes/mis-places on a scaled preview frame.
    chartBox = { left: g.fr.left + cr.left * g.S - sr.left, top: g.fr.top + cr.top * g.S - sr.top, width: cr.width * g.S, height: cr.height * g.S };
    if (!hoverAny) {
      hit.style.cssText =
        `display:block;left:${chartBox.left}px;top:${chartBox.top}px;width:${chartBox.width}px;height:${chartBox.height}px`;
    }
    // Popover position is owned by Floating UI's autoUpdate (started on reveal),
    // so reflow only pins the Present hit-surface here.
  }

  function hide() { if (!hoverAny) hit.style.display = 'none'; }

  // Coalesce reflow to ONE run per animation frame. During a pane-divider DRAG (or a resize) the stage
  // ResizeObserver, the frame `style` MutationObserver, and the frame ResizeObserver can each fire in the
  // SAME frame — three cross-iframe `getBoundingClientRect` layout flushes where one would do. The
  // observers/resize schedule through here; direct callers that need a synchronous pin (reveal, onSlide's
  // spaced timers) still call reflow() outright.
  function scheduleReflow() {
    if (reflowRaf) return;
    reflowRaf = requestAnimationFrame(() => { reflowRaf = 0; reflow(); });
  }

  // Anchor point for mark i in PARENT-viewport coords, computed from the mark's OWN box. The fallback
  // when there is NO live pointer — a number-key reveal in Present — so the popover
  // still opens AT the mark instead of the host's off-screen (-9999) no-anchor default. A pointer reveal
  // keeps the cursor anchor; this only fires for the keyboard path.
  function markAnchor(i) {
    const g = frameGeom();
    const m = marksFor(i)[0];
    if (!g || !m) return null;
    let r;
    try { r = m.getBoundingClientRect(); } catch { return null; }
    if (!r.width || !r.height) return null;
    return { x: g.fr.left + (r.left + r.width / 2) * g.S, y: g.fr.top + (r.top + r.height / 2) * g.S };
  }

  // The whole chart's center in PARENT-viewport coords — the SECOND fallback when there's no pointer AND
  // the mark itself has no box yet (a not-yet-laid-out mark during the build, or a box-less milestone
  // container). Keeps the host (shadcn) popover anchored to the chart instead of the host's off-screen
  // (-9999) default, mirroring the vanilla path's `discRect` behavior.
  function chartCenter() {
    const g = frameGeom();
    if (!g || !chartEl) return null;
    let r;
    try { r = chartEl.getBoundingClientRect(); } catch { return null; }
    if (!r.width || !r.height) return null;
    return { x: g.fr.left + (r.left + r.width / 2) * g.S, y: g.fr.top + (r.top + r.height / 2) * g.S };
  }

  // (Re)attach the per-chart ResizeObserver to the CURRENT chartEl — watches its box for the async
  // layout settle and re-pins without polling. Called from setChart (initial bind) AND from reflow when
  // it swaps chartEl to a freshly-mounted Anima clone (a different node than the poster), so the observer
  // follows the chart it's meant to watch. Uses the iframe's OWN ResizeObserver (chartEl lives there).
  function observeChart() {
    try {
      chartRO?.disconnect();
      chartRO = null;
      const ROc = chartEl?.ownerDocument?.defaultView?.ResizeObserver;
      if (chartEl && ROc) { chartRO = new ROc(scheduleReflow); chartRO.observe(chartEl); }
    } catch { /* cross-doc / older browser */ }
  }

  // Point the interaction at a specific <section>'s chart (the active Present
  // slide, or the hovered preview chart). Idempotent — re-selecting the same
  // section is a no-op so a hover stream doesn't thrash the open popover.
  function setChart(sec) {
    if (sec === curSection) return;
    clear();
    while (timers.length) clearTimeout(timers.pop());
    curSection = sec || null;
    // Prefer the VISIBLE chart svg. An ANIMATED chart carries TWO matching svgs — the original poster
    // (hidden `display:none` by the Anima host) plus the live clone it animates — and the poster is
    // first in DOM order. Binding to the poster would give a zero-box geometry (breaking the Present
    // hit-surface) and read a hidden node; pick the one that actually has a box. Static charts have a
    // single svg, so this is a plain first-match there.
    chartEl = sec ? chartSvgIn(sec) : null;
    detailsEl = sec ? sec.querySelector(DETAILS_SEL) : null;
    // Watch the CURRENT chart's box for its async layout settle (it lives in the iframe, so use the
    // iframe's own ResizeObserver). Re-pins the hit-surface without polling — the fix for a chart that
    // reflows after onSlide's fixed timers have run.
    observeChart();
    // Only "interactive" when the authored detail is actually present.
    if (chartEl && detailsEl) {
      // Gate on the MARK count, not the template count — detail is optional per
      // mark, so every mark is revealable (label/value with an empty body), and
      // a chart with non-contiguous detail (e.g. only marks 0 and 2) must not cap
      // reveal at the template count. Falls back to templates if no marks query.
      sliceN = markCount() || detailsEl.querySelectorAll(TPL_SEL).length;
      reflow();
    } else {
      curSection = chartEl = detailsEl = null; sliceN = 0; hide();
    }
  }

  // Watch the frame ELEMENT's inline style for the LATE reveal that ResizeObserver can't see. A loader
  // host (Present) keeps its iframe at `opacity:0` / a placeholder scale until single-slide-render's
  // scaleFrame reveals it — by mutating the iframe's inline `transform` + `opacity` (docs/src/lib/
  // single-slide-render.ts) once a real width is known and the slide has painted. Those are transform/
  // opacity changes, so they DON'T resize the border-box and the frame ResizeObserver never fires; and
  // they land AFTER onSlide's fixed re-pin timers, so the pinned hit-surface is left at a stale/zero
  // geometry and taps miss (the Present-on-mobile "popup never shows" bug). A MutationObserver on the
  // frame's `style` catches exactly that reveal and re-pins. The iframe element persists across srcdoc
  // rewrites, so one observer stays valid; we still re-target if getFrame() ever returns a new element.
  // This ALSO owns the srcdoc-`load` self-heal listener (the parse-race fix, see onFrameLoad): both the
  // MutationObserver and the `load` listener follow the SAME frame element, so a host that swaps the
  // iframe can't strand either on a dead node.
  function watchFrame() {
    const fe = getFrame();
    if (fe === watchedFrame) return;
    try { frameMO?.disconnect(); } catch { /* noop */ }
    frameMO = null;
    try { watchedFrame?.removeEventListener('load', onFrameLoad); } catch { /* gone */ }
    watchedFrame = fe;
    if (fe) {
      try { fe.addEventListener('load', onFrameLoad); } catch { /* gone */ }
      if (window.MutationObserver) {
        try { frameMO = new MutationObserver(scheduleReflow); frameMO.observe(fe, { attributes: true, attributeFilter: ['style'] }); }
        catch { /* older browser */ }
      }
    }
  }

  // ── lifecycle: called after every slide change (Present/Practice) ───────────
  function onSlide(idx) {
    curIdx = idx | 0;
    // Clear pending re-pin timers up front so a SAME-index re-emit doesn't STACK them. A host re-pins
    // every render (the editing preview calls onSlide(0) on every keystroke; Present on every onRender),
    // and setChart early-returns on an unchanged section BEFORE it clears timers — so without this the
    // [80,360,1240]ms timers would pile up under fast typing.
    while (timers.length) clearTimeout(timers.pop());
    watchFrame();
    const d = doc();
    setChart(d ? d.querySelectorAll('.lattice > section')[curIdx] : null);
    if (interactive()) {
      // The iframe re-fits at [60, 300, 1200]ms after a pv message; re-pin just after.
      [80, 360, 1240].forEach((t) => { timers.push(setTimeout(reflow, t)); });
    }
  }

  function interactive() { return !!(chartEl && detailsEl); }

  // ── hit-testing: parent pointer → iframe slice via elementFromPoint ─────────
  function sliceAt(clientX, clientY) {
    const d = doc(); const g = frameGeom(); if (!d || !g) return -1;
    // parent viewport → iframe INNER coords: subtract the frame origin, then un-scale.
    const x = (clientX - g.fr.left) / g.S, y = (clientY - g.fr.top) / g.S;
    const t = d.elementFromPoint(x, y);
    const hit = markIndex(t?.closest(MARK_SEL));
    if (hit >= 0) return hit;
    const named = namedMark(t, chartEl);
    return named >= 0 ? named : nearestMark(chartEl, x, y, reachPx() / g.S);
  }

  // The mark a piece of TEXT names, or -1 — a tap proxy (`data-mark-for`, see PROXY_SEL). A pie or
  // map LEGEND row is one too: the legend kernel stamps it only when the chart says which mark the
  // row names, so a legend of SERIES (line, stacked-bar, radar) stays inert rather than being
  // matched by position or text to some unrelated mark.
  function namedMark(t, svg) {
    if (!t || !svg?.contains(t)) return -1;
    const px = t.closest?.(PROXY_SEL);
    if (!px) return -1;
    const n = Number(px.getAttribute('data-mark-for'));
    return Number.isInteger(n) && n >= 0 ? n : -1;
  }

  // ── near-miss hit-testing: the THIN-MARK problem ──────────────────────────────
  // elementFromPoint only finds a mark when the pointer is ON its painted geometry. That is fine
  // for a bar or a wedge, but a slope chart's marks are its LINES, about 1.5 slide px wide: on a
  // phone the preview is scaled to roughly a third, so the stroke is under one screen pixel and a
  // finger practically never lands on it (seen on a real iPhone: tapping a slope line did nothing).
  // So when a point misses every mark, take the nearest mark whose OUTLINE is within reach, where
  // reach is set in SCREEN px — a fingertip on touch, a small halo for a mouse. The distance is
  // measured to points sampled along each mark's outline, not to its box: a slope line's box is
  // the whole diagonal and overlaps its neighbors', so the box would pick the wrong line at a
  // crossing. A mark the pointer is actually ON still wins outright (the caller tries that first).
  const reachPx = () => (COARSE ? 22 : 6);
  function nearestMark(svg, x, y, reach) {
    if (!svg || !(reach > 0)) return -1;
    let best = -1, bestD = reach;
    for (const m of svg.querySelectorAll(MARK_SEL)) {
      if (typeof m.getTotalLength !== 'function') continue;
      let ctm, L;
      try { ctm = m.getScreenCTM(); L = m.getTotalLength(); } catch { continue; }
      if (!ctm || !(L > 0)) continue;
      // One sample every ~3 iframe px along the outline, bounded both ways.
      const n = Math.max(12, Math.min(240, Math.ceil((L * Math.hypot(ctm.a, ctm.b)) / 3)));
      for (let k = 0; k <= n; k++) {
        const p = m.getPointAtLength((L * k) / n);
        const px = ctm.a * p.x + ctm.c * p.y + ctm.e, py = ctm.b * p.x + ctm.d * p.y + ctm.f;
        const dd = Math.hypot(px - x, py - y);
        if (dd < bestD) { bestD = dd; best = markIndex(m); }
      }
    }
    return best;
  }

  // ── reveal command (pointer / keys / presenter window all route here) ───────
  function reveal(i) {
    if (!interactive()) return;
    if (i < 0 || i >= sliceN) return;
    if (i === openSlice) return;
    if (openSlice < 0 && onReveal) { try { onReveal(); } catch { /* host hook */ } }
    openSlice = i;
    // Title/value/color come from the mark (data-label/value, or the legend for
    // the pie); body/meta from the authored <template>. All scoped to curSection
    // so a multi-chart preview reads the HOVERED chart's detail, not the first
    // chart in the doc. See infoFor().
    const { label, value, dot } = infoFor(i);
    const tpl = detailsEl?.querySelector(`template.chart-detail[data-mark="${i}"]`);
    const lis = tpl ? [...tpl.content.querySelectorAll('li')].map((n) => n.innerHTML.trim()) : [];
    const body = lis[0] || '';
    const meta = lis.slice(1).join(' · ');
    // Two reveal depths (the data-viz "details-on-demand" model). Every mark is
    // revealable, but a mark with NO authored body/meta (e.g. a pie slice that
    // didn't author a detail sublist) gets a COMPACT value-on-hover tooltip chip,
    // not the full detail-card chrome — so the lean readout reads as an
    // intentional tooltip and the richer card stays the signal of authored
    // detail. CSS keys off the --lean modifier. See
    // engineering/decisions/2026-06-21-chart-reveal-lean-tooltip.md.
    const lean = !body && !meta;
    // Freeze the anchor at the cursor point that opened THIS mark, so the card holds
    // its spot instead of sliding as the cursor drifts within the mark. With NO pointer
    // (a number-key reveal), fall back to the mark's own center, then the
    // whole chart's center — so the popover opens on the chart rather than off-screen at the
    // host's (-9999) default (or, on the vanilla path, unplaced — see placePop's guard).
    anchorPt = ptr ? { x: ptr.x, y: ptr.y } : (markAnchor(i) || chartCenter());
    emphasize(i);
    if (onDetail) {
      // The host owns the popover UI (Playground → shadcn Popover). Hand it the content + the cursor
      // anchor (parent-viewport coords); the host renders a readable, collision-aware tooltip there.
      try { onDetail({ label, value, dot, body, meta, lean, x: anchorPt?.x, y: anchorPt?.y }); } catch { /* host hook */ }
      return;
    }
    pop.classList.toggle('db-pp-chartpop--lean', lean);
    pop.innerHTML =
      `<div class="db-pp-chartpop-h">` +
      (dot ? `<span class="db-pp-chartpop-dot" style="background:${dot}"></span>` : '') +
      `<span class="db-pp-chartpop-l">${label}</span>` +
      (value ? `<span class="db-pp-chartpop-v">${value}</span>` : '') + `</div>` +
      (body ? `<p>${body}</p>` : '') + (meta ? `<div class="db-pp-chartpop-m">${meta}</div>` : '');
    pop.classList.add('show');
    reflow();   // re-pin the Present hit-surface
    startPop(); // Floating UI owns the popover position from here
  }

  // A mark whose own text IS its label (the radar's axis labels). True for a
  // <text> node with no element children AND for one whose only children are
  // the <tspan> lines a wrapped label emits.
  function isTextMark(el) {
    if (!el.textContent?.trim()) return false;
    const kids = el.children ? [...el.children] : [];

    return kids.every((k) => k.tagName?.toLowerCase() === 'tspan');
  }

  // The visible text of a node whose lines may be split across <tspan>s —
  // joined with a space so a wrapped label doesn't read "Costpredictability".
  function tspanText(el) {
    const spans = el.querySelectorAll?.('tspan') || [];
    return (spans.length
      ? [...spans].map((s2) => s2.textContent.trim()).join(' ')
      : el.textContent).trim();
  }

  function textOf(sel, i) {
    if (!curSection) return '';
    const n = curSection.querySelectorAll(sel)[i];
    if (!n) return '';
    // A wrapped legend label is split across <tspan> lines; textContent would glue
    // them ("Actuallydeciding") — join the tspans with a space instead.
    const spans = n.querySelectorAll('tspan');
    return (spans.length ? [...spans].map((s) => s.textContent.trim()).join(' ') : n.textContent).trim();
  }

  // The popover anchors to the pie DISC (the union of the current chart's wedge
  // boxes), not an individual wedge — a calm, stable spot; the active slice is
  // already identified by the lift, the dim, and the popover's color dot + label.
  // Floating UI anchors to a VIRTUAL REFERENCE: an object exposing the disc's box
  // in viewport coords, mapped from the iframe's own geometry through its offset.
  // That sidesteps the cross-iframe problem (no DOM node to point at) and lets the
  // engine do the hard part — flip below↔above, shift to stay in view.
  const EMPTY_RECT = { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 };
  const discRect = () => {
    if (!curSection) return EMPTY_RECT;
    const wedges = markEls();
    if (!wedges.length) return EMPTY_RECT;
    let fr;
    try { fr = getFrame().getBoundingClientRect(); } catch { return EMPTY_RECT; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    wedges.forEach((w) => {
      const r = w.getBoundingClientRect();
      minX = Math.min(minX, fr.left + r.left); minY = Math.min(minY, fr.top + r.top);
      maxX = Math.max(maxX, fr.left + r.right); maxY = Math.max(maxY, fr.top + r.bottom);
    });
    return { x: minX, y: minY, left: minX, top: minY, right: maxX, bottom: maxY, width: maxX - minX, height: maxY - minY };
  };
  // Pointer anchor — the popover sits next to the CURSOR (touch/mouse point) that
  // revealed the mark, in parent-viewport coords. `ptr` is refreshed on every
  // pointer move (Present hit-surface = parent coords; Preview iframe = mapped
  // through the frame offset), and the autoUpdate loop below re-places each frame,
  // so the card follows the cursor. A zero-size rect at the point is Floating UI's
  // idiom for a cursor anchor. Falls back to the disc when there's no live pointer
  // (keyboard reveal / presenter window).
  let ptr = null;      // live cursor { x, y } in parent-viewport coords, updated on move
  let anchorPt = null; // the point FROZEN at reveal — the popover holds here (calm), not sliding as the cursor drifts within a mark
  const pointerRect = () => (anchorPt
    ? { x: anchorPt.x, y: anchorPt.y, left: anchorPt.x, top: anchorPt.y, right: anchorPt.x, bottom: anchorPt.y, width: 0, height: 0 }
    : null);
  const anchorRect = () => pointerRect() || discRect();
  const virtualRef = { getBoundingClientRect: anchorRect };

  function placePop() {
    // Hold the frame ONLY when there's no usable anchor at all — no live pointer AND no frozen
    // reveal point (`anchorPt`) AND an empty disc box (mid-patch/detached): the autoUpdate loop
    // would otherwise flash the popover to (0,0). A keyboard reveal sets `anchorPt` to a zero-SIZE
    // rect at the mark/chart center, which IS a usable anchor — position against it, don't bail.
    const r = anchorRect();
    if (!ptr && !anchorPt && (!r.width || !r.height)) return;
    computePosition(virtualRef, pop, {
      // Off the cursor's lower-right so it never sits under the pointer; flip/shift
      // keep it on-screen. Disc fallback keeps the calm centered-below placement.
      placement: ptr ? 'bottom-start' : 'bottom',
      strategy: 'absolute',
      middleware: [offset(ptr ? 14 : 12), flip({ padding: 8 }), shift({ padding: 8 })],
    }).then(({ x, y }) => {
      pop.style.left = `${Math.round(x)}px`;
      pop.style.top = `${Math.round(y)}px`;
    }).catch(() => { /* frame torn down mid-measure */ });
  }

  // Keep the popover pinned to the disc while it's open — autoUpdate re-runs
  // placePop on scroll/resize/layout shift (animationFrame:true also catches the
  // iframe's OWN internal scroll, which ancestor listeners would miss).
  function startPop() {
    stopPop();
    stopAutoUpdate = autoUpdate(virtualRef, pop, placePop, { animationFrame: true });
  }
  function stopPop() {
    if (stopAutoUpdate) { stopAutoUpdate(); stopAutoUpdate = null; }
  }

  // An ANIMATED chart's live svg is the Anima clone (mounted inside `.scene-live`), whose marks carry
  // the renderer's baked final-frame transform/opacity. The reveal's dim/lift (and its reset on clear)
  // would OVERWRITE those inline styles and shift the settled chart — so for an anima chart the reveal
  // is popover-ONLY: it never touches the marks. A static chart's poster is not in `.scene-live`, so it
  // keeps the full emphasis (no regression).
  const isAnimaChart = () => !!chartEl?.closest?.('.scene-live');

  // A MATRIX chart — a grid of abutting tiles whose ROW and COLUMN are the reading. It takes the dim
  // and the emphasis class but NO lift: a shadow or a grow on one tile spills over the two neighbors
  // it shares an edge with, and a matrix locates a value by the INTERSECTION of two discrete labels,
  // so anything that blurs a tile's edge makes the reader re-count.
  //
  // What carries the emphasis instead is the dim. The active mark does take `.chart-mark-active`, and
  // chart-family.css thickens its stroke to `--chart-edge-strong` — but a heatmap cell's stroke is the
  // GUTTER color (`var(--bg)`, measured `rgb(255,255,255)` in light and `rgb(0,29,51)` in dark), so
  // that rule only widens the gap around the tile. The cue a reader sees is that every OTHER tile drops
  // to 0.45 while this one stays at 1 — emphasis in the chart's own language, color intensity.
  const isMatrixChart = () => !!chartEl?.classList?.contains('heatmap-svg');

  // ── EMPHASIS: dim the rest, lift the one — and never move the data ──────────────────────────────
  //
  // This used to tip the whole chart back with `perspective(900px) rotateX(7deg)` and push the active
  // mark 7 units away from the mean of all mark centers. Both distorted exactly what a chart is for:
  //  * The rotation keystoned the sheet. A 900px perspective on a ~1000px-wide svg shrinks its top edge
  //    visibly, so bars turned into trapezoids, the baseline and gridlines went oblique, and every label
  //    rendered skewed — the "cheap 3D" look.
  //  * The push moved the value. A bar rose off its baseline and into its own value label, a funnel's
  //    top and bottom bands moved in opposite directions while the middle ones stayed put, and a dot
  //    left the coordinates it plots.
  //  * Both moved the mark out from under the cursor, so near an edge the pointer landed on a gap, the
  //    card closed, the mark settled back under the pointer and the card re-opened.
  //
  // Depth now comes from ELEVATION, not rotation: the active mark casts a soft two-layer shadow (a
  // tight contact shadow plus a wide ambient one), so it reads as lifted toward the viewer while its
  // geometry stays exactly where the data puts it. On top of that, each GEOMETRY gets the one extra
  // move it can carry without lying — keyed off the `data-anima-role` every chart kernel already stamps:
  //   sector  (pie wedge)       → steps out along its own bisector from the true disc center, by 3% of
  //                                the radius. An exploded slice is the pie's native emphasis, and it
  //                                keeps the slice's angle, which is the value.
  //   point   (scatter/quadrant) → grows about its own center by a fixed ~3 slide px of radius. The
  //                                center (the value) never moves.
  //   everything else (bars, bands, segments, regions, slope lines, state nodes) → elevation only.
  // A text mark (the radar's axis labels) and an HTML mark (the state-chart's measuring <li>) take the
  // dim and the class only — a shadow on type blurs it.
  //
  // Sizes are authored in SLIDE px (a 1280-wide slide) and converted to the svg's own user units, so a
  // lift looks the same on a pie drawn in a 400-unit viewBox and a map drawn in a 1000-unit one, and
  // stays proportional on a scaled-down preview.
  const DIM = '0.45';
  const EASE = 'cubic-bezier(.2,.7,.3,1)';
  const SECTOR_OUT = 0.03;   // explode distance, as a share of the disc radius
  const POINT_GROW = 3;      // extra radius on a hovered dot, slide px
  const POINT_MAX = 1.5;     // …but never more than this scale (a tiny quadrant dot)

  // User units per slide px for mark `w`. getScreenCTM maps user units → iframe px, which includes
  // the preview's own fit-scale on the <section>; dividing that back out leaves slide px.
  function unitsPerSlidePx(w) {
    try {
      const a = w.getScreenCTM?.()?.a;
      const sec = w.closest?.('section');
      const s = sec?.offsetWidth ? sec.getBoundingClientRect().width / sec.offsetWidth : 1;
      return a ? s / a : 1;
    } catch { return 1; }
  }

  // Elevation — a contact shadow plus an ambient one, both below the mark (light from above).
  function liftShadow(w) {
    const u = unitsPerSlidePx(w);
    const n = (v) => (v * u).toFixed(2);
    return `drop-shadow(0 ${n(1)}px ${n(1.5)}px rgba(0,0,0,.18)) drop-shadow(0 ${n(6)}px ${n(10)}px rgba(0,0,0,.16))`;
  }

  // A pie wedge's outward step: the circular mean of the directions from the disc center to points
  // sampled along the wedge's outline, skipping the hub. The disc center is the middle of the union of
  // every wedge's box, which is exact for a whole pie — the old mean-of-centroids drifted toward the
  // largest slice, so a 46% slice and its neighbor were pushed along visibly different axes.
  function sectorStep(w, all) {
    try {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      all.forEach((o) => { const b = o.getBBox(); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.width); y1 = Math.max(y1, b.y + b.height); });
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.max(x1 - x0, y1 - y0) / 2;
      const L = w.getTotalLength();
      let sx = 0, sy = 0;
      for (let k = 0; k < 48; k++) {
        const p = w.getPointAtLength((L * k) / 48);
        const dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
        if (d > R * 0.2) { sx += dx / d; sy += dy / d; }
      }
      const len = Math.hypot(sx, sy);
      if (!R || len < 1e-3) return ''; // a lone full-circle slice has no "out"
      const out = R * SECTOR_OUT;
      return `translate(${((sx / len) * out).toFixed(2)}px, ${((sy / len) * out).toFixed(2)}px)`;
    } catch { return ''; }
  }

  function pointGrow(w) {
    try {
      const r = w.r?.baseVal?.value;
      if (!r) return '';
      const rPx = r / unitsPerSlidePx(w);
      return `scale(${Math.min(POINT_MAX, 1 + POINT_GROW / rPx).toFixed(3)})`;
    } catch { return ''; }
  }

  // What the active mark gets: { transform, filter }. Empty strings mean "leave it alone".
  function emphasisFor(w, marks) {
    if (typeof w.getBBox !== 'function' || isMatrixChart()) return { transform: '', filter: '' };
    if (w.tagName?.toLowerCase() === 'text') return { transform: '', filter: '' };
    const filter = liftShadow(w);
    // A mark with its own `transform` attribute would lose it to a CSS transform (the property
    // replaces the attribute), so such a mark keeps its shadow and skips the geometric move.
    if (!useLift || w.hasAttribute('transform')) return { transform: '', filter };
    const role = w.dataset?.animaRole;
    if (role === 'sector') return { transform: sectorStep(w, marks.filter((o) => o.dataset?.animaRole === 'sector')), filter };
    if (role === 'point') return { transform: pointGrow(w), filter };
    return { transform: '', filter };
  }

  function emphasize(i) {
    if (!chartEl || !curSection || isAnimaChart()) return;
    const marks = markEls();
    const tr = REDUCED ? 'none' : `transform .24s ${EASE}, opacity .2s ease, filter .24s ${EASE}`;
    // Compare by MARK index, not DOM order — a map group shares one index across
    // several region paths, and quadrant/radar DOM order ≠ data index.
    marks.forEach((w) => {
      const active = markIndex(w) === i;
      const { transform, filter } = active ? emphasisFor(w, marks) : { transform: '', filter: '' };
      w.style.transition = tr;
      w.style.opacity = active ? '1' : DIM;
      // A point grows about its OWN center. Set on every point, active or not, and never reset: a
      // dot shrinking back after the pointer moves on must ease about its own center too, not jump
      // to scale about the svg origin halfway through.
      if (w.dataset?.animaRole === 'point') { w.style.transformBox = 'fill-box'; w.style.transformOrigin = 'center'; }
      w.style.transform = transform;
      w.style.filter = filter;
      // CSS emphasis hook — lets a chart style its active mark (the gantt bar's
      // ink edge) without the reveal layer hard-coding per-chart visuals.
      w.classList?.toggle('chart-mark-active', active);
    });
    // The proxies dim with their marks, so the open entry's own name and values stay at full
    // strength while every other entry's recede — the card and the chart agree on what is open.
    chartEl.querySelectorAll(PROXY_SEL).forEach((p) => {
      p.style.transition = REDUCED ? 'none' : 'opacity .2s ease';
      p.style.opacity = Number(p.getAttribute('data-mark-for')) === i ? '' : DIM;
    });
  }

  // Put every mark back. The transition stays on, so the exit eases out the way the entry eased in,
  // and a point's transform box stays on its own center for the same reason (see emphasize).
  function unemphasize() {
    markEls().forEach((w) => {
      w.style.opacity = '';
      w.style.transform = '';
      w.style.filter = '';
      w.classList?.remove('chart-mark-active');
    });
    chartEl?.querySelectorAll(PROXY_SEL).forEach((p) => { p.style.opacity = ''; });
  }

  function clear() {
    cancelHoverClear(); // a direct clear (e.g. setChart on a chart change) cancels any pending debounce
    openSlice = -1;
    ptr = null;       // next reveal (e.g. keyboard) falls back to the disc until a pointer moves
    anchorPt = null;
    stopPop();
    if (onDetail) { try { onDetail(null); } catch { /* host hook */ } }
    pop.classList.remove('show');
    // Reset the lift/dim we applied — but NOT on an anima chart, where those inline styles are the
    // renderer's baked frame (emphasize never touched them), so clearing would shift the settled chart.
    if (!isAnimaChart()) unemphasize();
  }

  // ── keyboard: number keys reveal; 0/Esc clear ───────────────────────────────
  function handleKey(e) {
    if (!interactive()) return false;
    if (e.key === 'Escape') { if (openSlice >= 0) { clear(); return true; } return false; }
    if (e.key === '0') { clear(); return true; }
    if (e.key >= '1' && e.key <= '9') {
      const i = +e.key - 1;
      if (i < sliceN) { reveal(i); return true; } // out-of-range digit → don't swallow it
    }
    return false;
  }

  // ── PRESENT/PRACTICE: pointer wiring on the pinned hit-surface ───────────────
  // Fine pointer (mouse): hover-follow. Coarse (touch): tap a slice to reveal,
  // tap again / off-slice to clear.
  if (!hoverAny) {
    // Present hit-surface lives in the PARENT, so its event coords are already
    // parent-viewport — use them directly as the popover's cursor anchor.
    if (!COARSE) {
      hit.addEventListener('pointermove', (e) => { ptr = { x: e.clientX, y: e.clientY }; const s = sliceAt(e.clientX, e.clientY); if (s >= 0) reveal(s); });
      hit.addEventListener('pointerleave', () => clear());
    } else {
      hit.addEventListener('pointerdown', (e) => {
        ptr = { x: e.clientX, y: e.clientY };
        const s = sliceAt(e.clientX, e.clientY);
        if (s < 0 || s === openSlice) clear(); else reveal(s);
        e.stopPropagation(); // don't let the tap fall through to the capture layer
      });
    }
  }

  // ── PREVIEW (hoverAny): listen on the iframe document; reveal the chart under
  // the pointer. No hit-surface, so the author can still scroll/select the slide.
  function resolveAt(target, e) {
    const w = target?.closest?.(MARK_SEL);
    if (w) {
      setChart(w.closest('.lattice > section') || w.closest('section'));
      return interactive() ? markIndex(w) : -1;
    }
    // A near miss inside a chart (see nearestMark). Only searched when the pointer is over a
    // chart's own svg, so moving across the rest of the slide costs nothing.
    const svg = e && target?.closest?.(CHART_SVG_SEL);
    if (!svg) return -1;
    const g = frameGeom();
    const named = namedMark(target, svg);
    const i = named >= 0 ? named : nearestMark(svg, e.clientX, e.clientY, reachPx() / (g?.S || 1));
    if (i < 0) return -1;
    setChart(svg.closest('.lattice > section') || svg.closest('section'));
    return interactive() ? i : -1;
  }
  // Preview events fire on the IFRAME document, so map their iframe-INNER coords into parent-viewport
  // coords (× the frame scale, then + the frame offset) for the cursor anchor.
  function ptrFromFrame(e) {
    const g = frameGeom();
    if (g) ptr = { x: g.fr.left + e.clientX * g.S, y: g.fr.top + e.clientY * g.S };
  }
  // Close-hysteresis: sweeping the pointer across a mark BOUNDARY (or the gap between two marks) makes
  // onDocMove fire off-mark for a frame or two. Clearing immediately there toggles the popover
  // open→close→open faster than its ~150ms zoom animation → visible flicker. Debounce the off-mark clear
  // by a hair; a reveal within the window cancels it, so a genuine leave still clears (~70ms later) but a
  // momentary edge-crossing doesn't. Only the hoverAny path needs this (it clears on every off-mark move);
  // the pinned hit-surface clears only on pointerleave, so it never edge-flickers.
  let hoverClearTimer = 0;
  function cancelHoverClear() { if (hoverClearTimer) { clearTimeout(hoverClearTimer); hoverClearTimer = 0; } }
  // Hold zone: the open mark's CURRENT box (after its lift) grown by a few slide px. A pointer that
  // slips off the mark into empty chart — the gap between two bars, the hairline between a stepped-out
  // wedge and the hub, the rim of a grown dot — keeps the card, instead of closing it and re-opening it
  // a frame later. Landing on a DIFFERENT mark still switches at once (resolveAt wins before this runs),
  // so the zone only ever decides "keep or close", never "which".
  const HOLD_SLIDE_PX = 10;
  function inHoldZone(e) {
    if (openSlice < 0 || !curSection) return false;
    let pad = HOLD_SLIDE_PX;
    try { if (curSection.offsetWidth) pad *= curSection.getBoundingClientRect().width / curSection.offsetWidth; } catch { /* detached */ }
    return marksFor(openSlice).some((m) => {
      let r;
      try { r = m.getBoundingClientRect(); } catch { return false; }
      return r.width > 0 && e.clientX >= r.left - pad && e.clientX <= r.right + pad
        && e.clientY >= r.top - pad && e.clientY <= r.bottom + pad;
    });
  }
  function onDocMove(e) {
    // resolveAt → setChart may clear() (which nulls ptr) when the hovered chart
    // changes, so capture the cursor AFTER it, right before reveal snapshots it.
    const s = resolveAt(e.target, e);
    ptrFromFrame(e);
    if (s >= 0) { cancelHoverClear(); reveal(s); }
    else if (inHoldZone(e)) cancelHoverClear();
    else if (openSlice >= 0 && !hoverClearTimer) {
      hoverClearTimer = setTimeout(() => { hoverClearTimer = 0; clear(); }, 70);
    }
  }
  function onDocTap(e) {
    const s = resolveAt(e.target, e);
    ptrFromFrame(e);
    if (s < 0 || s === openSlice) clear(); else reveal(s);
  }
  const onDocLeave = () => { cancelHoverClear(); clear(); }; // leaving the doc entirely = a deliberate dismiss
  const onDocScroll = () => { if (openSlice >= 0) reflow(); };
  function bindDoc() {
    const d = doc();
    if (!d || d === boundDoc) return;
    boundDoc = d;
    if (!COARSE) {
      d.addEventListener('pointermove', onDocMove, { passive: true });
      d.addEventListener('pointerleave', onDocLeave);
    } else {
      d.addEventListener('pointerdown', onDocTap, { passive: true });
    }
    d.addEventListener('scroll', onDocScroll, { passive: true, capture: true });
  }
  function unbindDoc() {
    cancelHoverClear();
    if (!boundDoc) return;
    try {
      boundDoc.removeEventListener('pointermove', onDocMove);
      boundDoc.removeEventListener('pointerleave', onDocLeave);
      boundDoc.removeEventListener('pointerdown', onDocTap);
      boundDoc.removeEventListener('scroll', onDocScroll, { capture: true });
    } catch { /* doc already torn down */ }
    boundDoc = null;
  }
  // A srcdoc rewrite replaces the document (listeners + section refs die with it).
  // Hosts may call this (the Drawing Board does, on `db-frame-ready`); it's also
  // wired to the iframe's own `load` below. unbindDoc() first so a re-bind to the
  // SAME live doc can't double-attach — bindDoc's own d===boundDoc guard is moot.
  function rebind() {
    unbindDoc();
    curSection = null; chartEl = detailsEl = null; openSlice = -1;
    // A full srcdoc write tears down the iframe's realm, so the per-chart chartRO (built from THAT
    // realm's ResizeObserver, watching a now-detached node) is dead — drop it rather than let it linger
    // until the next setChart. Re-arm the frame `style` observer too: the element usually persists across
    // rewrites (→ watchFrame no-ops), but if a host swaps it, this re-targets instead of watching a corpse.
    try { chartRO?.disconnect(); } catch { /* noop */ }
    chartRO = null;
    watchFrame();
    if (hoverAny) bindDoc();
  }
  // Self-sufficient re-bind: the iframe ELEMENT persists across srcdoc rewrites,
  // but its DOCUMENT is replaced and fires `load` once it's parseable. Binding to
  // that is more robust than relying on the host to call rebind() at the right
  // moment — the React playground's render() can return "done" before the new
  // doc is ready, so a host-timed rebind() would no-op (doc() still null) and the
  // listeners would never attach. A document patch (no srcdoc rewrite) keeps the
  // same doc, so `load` doesn't fire and the surviving listeners are reused.
  // The iframe fires `load` when a srcdoc REWRITE finishes parsing. This is the ONLY reliable "the new
  // doc is ready" signal: a host re-pin (onSlide) / rebind runs a microtask after render(), but srcdoc
  // parses on the next TASK — so a host-timed call races AHEAD of the parse and finds no chart. hoverAny
  // re-attaches its document listeners; PINNED re-runs onSlide (re-resolve the section + arm the re-pin
  // timers) — WITHOUT this, the slide Present opens on never binds its hit-surface (the parse race), so a
  // tap has no target and no popover ever shows. A PATCH (no srcdoc rewrite) keeps the doc, fires no
  // `load`, and reuses the surviving binding — so this only re-fires on a genuine write.
  function onFrameLoad() {
    if (hoverAny) rebind();
    else onSlide(curIdx < 0 ? 0 : curIdx);
  }
  // The `load` listener is attached by watchFrame() (below) so it follows the frame element on a swap —
  // NOT pinned here to the at-construction frame.
  if (hoverAny) bindDoc();

  // Re-pin the hit-surface whenever the geometry it depends on settles. The stage RO catches the
  // preview PANE resizing; the frame RO catches the iframe being RE-SCALED to fit (its box changes
  // without the pane changing); and a per-chart RO (re-targeted in setChart) catches the chart's OWN
  // async layout inside the iframe (a chart renders/reflows a beat after the slide paints, AFTER
  // onSlide's fixed re-pin timers have fired — the pinned-surface staleness the timers alone miss).
  let ro = null;
  try {
    ro = new ResizeObserver(scheduleReflow);
    ro.observe(stage); // the preview PANE resizing
    // NOTE: observing the frame here is a cheap BELT — the frame's untransformed border-box is pinned to
    // the fixed `@size` box, so a transform-only rescale never fires this RO; the LATE reveal is caught by
    // watchFrame's style MutationObserver below. Kept for the rare case single-slide-render rewrites the
    // frame's width/height. Both route through scheduleReflow, so a drag can't double up the reflow.
    const fe = getFrame();
    if (fe) ro.observe(fe);
  } catch { /* older browser */ }
  watchFrame(); // MutationObserver on the frame's style — catches the LATE transform/opacity reveal (loader host)
  window.addEventListener('resize', scheduleReflow);

  function destroy() {
    clear();
    while (timers.length) clearTimeout(timers.pop());
    try { watchedFrame?.removeEventListener('load', onFrameLoad); } catch { /* gone */ }
    unbindDoc();
    curSection = chartEl = detailsEl = null;
    try { ro?.disconnect(); } catch { /* noop */ }
    try { chartRO?.disconnect(); } catch { /* noop */ }
    try { frameMO?.disconnect(); } catch { /* noop */ }
    if (reflowRaf) { try { cancelAnimationFrame(reflowRaf); } catch { /* noop */ } reflowRaf = 0; }
    window.removeEventListener('resize', scheduleReflow);
    root.remove();
  }

  return { onSlide, reflow, handleKey, reveal, clear, interactive, rebind, destroy };
}
