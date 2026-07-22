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
//     (1–9 → slice n, 0/Esc clears), and (later) a presenter-window control.
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
 * @param {boolean} [o.tilt=true]  interaction-coupled tilt (lifts/tips toward the open slice, settles flat)
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
export function createChartInteract({ stage, getFrame, tilt = true, onReveal, onDetail, hoverAny = false }) {
  const useTilt = tilt && !REDUCED;

  // Chart-family vocabulary. Every SVG chart — pie included, now that it rides
  // the shared mark-detail substrate — emits ONE vocabulary: each mark carries
  // data-mark; the inert payload is .chart-details holding template.chart-detail.
  // (.piechart-svg etc. are just the per-chart figure classes the reveal layer
  // scopes to.) See engineering/decisions/2026-06-20-chart-detail-reveal-family.md.
  // The chart ROOT the interaction scopes to. Tier-1 roots are the SVG sheet
  // itself (the marks are SVG elements, the tilt rotates the whole sheet).
  // Tier-2 roots are HTML containers (the marks are HTML elements — state-chart
  // nodes today): the root is the figure so the tilt rotates nodes AND the edge
  // overlay together (the figure must NOT contain the inert .chart-details
  // payload, or its <template data-mark> would be miscounted as a mark — the
  // kernels emit the payload as a sibling). See
  // engineering/decisions/2026-06-20-chart-detail-reveal-family.md.
  const CHART_SVG_SEL = '.piechart-svg, .funnel-svg, .map-svg, .quadrant-svg, .radar-svg, .state-chart-figure, .gantt-chart';
  const DETAILS_SEL = '.chart-details';
  const TPL_SEL = 'template.chart-detail';
  const MARK_SEL = '[data-mark]';
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
  let sliceN = 0;        // slice count on the current chart
  let openSlice = -1;    // which slice's detail is showing (-1 = none)
  let chartBox = null;   // current chart rect in stage coords (Present hit-surface)
  let boundDoc = null;   // iframe document we've bound hover listeners to (preview mode)
  let stopAutoUpdate = null; // Floating UI autoUpdate teardown (while a popover is open)
  const timers = [];     // pending reflow re-pins (cleared on slide change / destroy)

  const doc = () => { try { return getFrame().contentDocument; } catch { return null; } };

  // ── generic mark access (one code path for every chart kind) ────────────────
  // Marks are the addressable data elements INSIDE the chart <svg> (pie wedges,
  // funnel bands, map regions, quadrant dots, radar axis labels). Scoping to
  // chartEl excludes the inert <template> payloads (they live in a sibling
  // .chart-details div) and legend swatches (no data-mark).
  const markEls = () => (chartEl ? [...chartEl.querySelectorAll(MARK_SEL)] : []);
  // The chart svg to bind to — the visible one when a chart has both a hidden poster and a live
  // animated clone (see setChart). Falls back to first-match if none reports a box yet (pre-layout).
  // COUPLING: this "has a box" test distinguishes the two ONLY because the Anima host hides the poster
  // with `display:none` (docs/src/lib/anima/hydrate.ts mount()) — the sole hiding that yields a zero
  // box. If that ever becomes `visibility:hidden` / `opacity:0` (both keep a box), this would pick the
  // poster (first in DOM); keep the two in step (see docs/src/lib/chart-anima.ts, which flags the same).
  const chartSvgIn = (sec) => {
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

  // Title / value / colour for mark i, from whichever source the kind provides:
  //   label  — the mark's data-label (funnel/map/quadrant) · its own text node
  //            (radar axis label) · the legend row (pie has no text on a wedge).
  //   value  — data-value · the legend value column (pie).
  //   colour — the legend swatch's computed fill (pie/map gradients are URL refs,
  //            meaningless in the parent) · else the mark's own computed fill.
  function infoFor(i) {
    const el = marksFor(i)[0] || null;
    let label = '';
    let value = '';
    if (el && el.dataset.label != null) {
      // substrate marks self-describe (funnel/map/quadrant)
      label = el.dataset.label;
      value = el.dataset.value || '';
    } else if (el && !el.querySelector?.('*') && el.textContent.trim()) {
      // radar axis label IS the text node
      label = el.textContent.trim();
    } else {
      // pie — the wedge has no text, so read the SVG legend row by index
      label = textOf('.chart-key-label', i);
      value = textOf('.chart-key-value', i);
    }
    const swatch = curSection?.querySelectorAll('.chart-key-swatch')[i];
    // A usable swatch colour — reject the SVG `fill` INITIAL (black) that an HTML
    // box computes to, plus transparents, so an HTML mark never shows a stray
    // black dot. Returns null when there's no real colour (→ the dot is hidden).
    const usable = (c) => (c && c !== 'none' && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') ? c : null;
    let dot = null;
    try {
      if (swatch) {
        dot = usable((swatch.ownerDocument?.defaultView || window).getComputedStyle(swatch).fill) || 'currentColor';
      } else if (el) {
        const cs = (el.ownerDocument?.defaultView || window).getComputedStyle(el);
        dot = typeof el.getBBox === 'function'
          // SVG mark — fill (or stroke) IS the wedge colour.
          ? (usable(cs.fill) || usable(cs.stroke) || 'currentColor')
          // HTML mark (gantt bar, state node): `fill` is the SVG initial (black)
          // on an HTML box — useless. These paint their status via the canonical
          // chart fill, whose --fill-ink shows as the left ACCENT BORDER; read
          // that resolved colour — but only when a left border actually exists
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
      if (live && live !== chartEl) chartEl = live;
    }
    if (!chartEl) { hide(); return; }
    let fr, sr, cr;
    try { fr = getFrame().getBoundingClientRect(); sr = stage.getBoundingClientRect(); cr = chartEl.getBoundingClientRect(); }
    catch { hide(); return; }
    // A zero box means the chart node is detached (a section PATCH replaced it
    // without a db-frame-ready, so curSection is now orphaned) or scrolled
    // off-screen (content-visibility). Either way an open preview popover is stale
    // — dismiss it (it re-resolves on the next hover). hide() only clears the
    // Present hit-surface, so in hoverAny we clear() explicitly.
    if (!cr.width || !cr.height) { if (hoverAny && openSlice >= 0) clear(); hide(); return; }
    chartBox = { left: fr.left + cr.left - sr.left, top: fr.top + cr.top - sr.top, width: cr.width, height: cr.height };
    if (!hoverAny) {
      hit.style.cssText =
        `display:block;left:${chartBox.left}px;top:${chartBox.top}px;width:${chartBox.width}px;height:${chartBox.height}px`;
    }
    // Popover position is owned by Floating UI's autoUpdate (started on reveal),
    // so reflow only pins the Present hit-surface here.
  }

  function hide() { if (!hoverAny) hit.style.display = 'none'; }

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

  // ── lifecycle: called after every slide change (Present/Practice) ───────────
  function onSlide(idx) {
    curIdx = idx | 0;
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
    const d = doc(); if (!d) return -1;
    const fr = getFrame().getBoundingClientRect();
    const t = d.elementFromPoint(clientX - fr.left, clientY - fr.top);
    return markIndex(t?.closest(MARK_SEL));
  }

  // ── reveal command (pointer / keys / presenter window all route here) ───────
  function reveal(i) {
    if (!interactive()) return;
    if (i < 0 || i >= sliceN) return;
    if (i === openSlice) return;
    if (openSlice < 0 && onReveal) { try { onReveal(); } catch { /* host hook */ } }
    openSlice = i;
    // Title/value/colour come from the mark (data-label/value, or the legend for
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
    // its spot instead of sliding as the cursor drifts within the mark.
    anchorPt = ptr ? { x: ptr.x, y: ptr.y } : null;
    liftAndTilt(i);
    if (onDetail) {
      // The host owns the popover UI (Playground → shadcn Popover). Hand it the
      // content + the cursor anchor; the vanilla popover stays dormant.
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
  // already identified by the lift, the dim, and the popover's colour dot + label.
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
    // Hold the frame if there's no usable anchor (mid-patch/detached with no live
    // pointer): the autoUpdate loop would otherwise flash the popover to (0,0).
    const r = anchorRect();
    if (!ptr && (!r.width || !r.height)) return;
    computePosition(virtualRef, pop, {
      // Off the cursor's lower-right so it never sits under the pointer; flip/shift
      // keep it on-screen. Disc fallback keeps the calm centred-below placement.
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
  // the renderer's baked final-frame transform/opacity. The reveal's lift/dim/tilt (and its reset on
  // clear) would OVERWRITE those inline styles and shift the settled chart — so for an anima chart the
  // reveal is popover-ONLY: it never touches the marks. A static chart's poster is not in `.scene-live`,
  // so it keeps the full lift + tilt flourish (no regression).
  const isAnimaChart = () => !!chartEl?.closest?.('.scene-live');

  // ── interaction-coupled tilt (settles flat; resting chart stays proportion-true) ──
  function liftAndTilt(i) {
    if (!chartEl || !curSection || isAnimaChart()) return;
    const wedges = markEls();
    // Compare by MARK index, not DOM order — a map group shares one index across
    // several region paths, and quadrant/radar DOM order ≠ data index.
    wedges.forEach((w) => {
      const active = markIndex(w) === i;
      w.style.transition = 'transform .22s cubic-bezier(.2,.7,.3,1), opacity .22s';
      w.style.opacity = active ? '1' : '0.45';
      w.style.transform = active ? liftVec(w, wedges) : '';
      // CSS emphasis hook — lets a chart style its active mark (the gantt bar
      // lift/glow) without the reveal layer hard-coding per-chart visuals.
      w.classList?.toggle('chart-mark-active', active);
    });
    // 3D tilt: SVG sheets (pie/funnel/…) + the state-chart node+edge graph only.
    // HTML grids (gantt/kanban) must NOT tilt — a rotateX would skew the time axis —
    // and the flat state-chart inline strip skips it (a rotateX on a flat row reads
    // as skew). The state-chart edge-router skips re-measuring while the transform
    // is live (state-chart.transform.js draw()), so its edges tilt rigidly + aligned.
    const tiltable = typeof chartEl.getBBox === 'function'
      || (chartEl.classList?.contains('state-chart-figure') && chartEl.getAttribute('data-variant') !== 'inline');
    if (useTilt && tiltable) {
      chartEl.style.transition = 'transform .3s cubic-bezier(.2,.7,.3,1)';
      chartEl.style.transformOrigin = '50% 55%';
      chartEl.style.transform = 'perspective(900px) rotateX(7deg)';
    }
  }

  // Nudge the active wedge a few px along its centroid→hub vector (its "out").
  // HTML marks: the state-chart node lifts PERPENDICULAR to the flow (it carries
  // data-sc-dir) — lr → up, tb → right — so it steps off its wire cleanly instead
  // of a scale() swelling it into its neighbours/edge labels. offsetHeight is the
  // node's slide-space height (immune to the Drawing Board's fit-scale), so the
  // lift stays proportional on a scaled-down mobile slide; the edges don't
  // re-route while tilted (router guard), so a small gap reads as "stepping out".
  // Other HTML charts (gantt bars) get NO inline transform here — their active-mark
  // emphasis is a CSS class (.chart-mark-active), so the bar's --gantt-x/--gantt-w
  // positioning is never disturbed.
  function liftVec(w, wedges) {
    if (typeof w.getBBox !== 'function') {
      const dir = chartEl?.getAttribute?.('data-sc-dir');
      if (!dir) return '';
      const d = (w.offsetHeight || 28) * 0.4;
      return dir === 'lr'
        ? `translateY(${(-d).toFixed(1)}px)`
        : `translateX(${d.toFixed(1)}px)`;
    }
    try {
      const box = w.getBBox();
      const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
      // hub ≈ mean of all wedge centroids
      let mx = 0, my = 0;
      wedges.forEach((o) => { const b = o.getBBox(); mx += b.x + b.width / 2; my += b.y + b.height / 2; });
      mx /= wedges.length; my /= wedges.length;
      let dx = cx - mx, dy = cy - my; const len = Math.hypot(dx, dy) || 1;
      dx = (dx / len) * 7; dy = (dy / len) * 7;
      return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    } catch { return ''; }
  }

  function clear() {
    openSlice = -1;
    ptr = null;       // next reveal (e.g. keyboard) falls back to the disc until a pointer moves
    anchorPt = null;
    stopPop();
    if (onDetail) { try { onDetail(null); } catch { /* host hook */ } }
    pop.classList.remove('show');
    // Reset the lift/dim we applied — but NOT on an anima chart, where those inline styles are the
    // renderer's baked frame (liftAndTilt never touched them), so clearing would shift the settled chart.
    if (!isAnimaChart()) markEls().forEach((w) => { w.style.opacity = ''; w.style.transform = ''; w.classList?.remove('chart-mark-active'); });
    if (chartEl && !isAnimaChart()) chartEl.style.transform = '';
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
  function resolveAt(target) {
    const w = target?.closest?.(MARK_SEL);
    if (!w) return -1;
    setChart(w.closest('.lattice > section') || w.closest('section'));
    return interactive() ? markIndex(w) : -1;
  }
  // Preview events fire on the IFRAME document, so map their iframe-local coords
  // into parent-viewport coords (through the frame's offset) for the cursor anchor.
  function ptrFromFrame(e) {
    try { const fr = getFrame().getBoundingClientRect(); ptr = { x: fr.left + e.clientX, y: fr.top + e.clientY }; }
    catch { /* frame gone */ }
  }
  function onDocMove(e) {
    // resolveAt → setChart may clear() (which nulls ptr) when the hovered chart
    // changes, so capture the cursor AFTER it, right before reveal snapshots it.
    const s = resolveAt(e.target);
    ptrFromFrame(e);
    if (s >= 0) reveal(s); else if (openSlice >= 0) clear();
  }
  function onDocTap(e) {
    const s = resolveAt(e.target);
    ptrFromFrame(e);
    if (s < 0 || s === openSlice) clear(); else reveal(s);
  }
  const onDocLeave = () => clear();
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
    if (hoverAny) bindDoc();
  }
  // Self-sufficient re-bind: the iframe ELEMENT persists across srcdoc rewrites,
  // but its DOCUMENT is replaced and fires `load` once it's parseable. Binding to
  // that is more robust than relying on the host to call rebind() at the right
  // moment — the React playground's render() can return "done" before the new
  // doc is ready, so a host-timed rebind() would no-op (doc() still null) and the
  // listeners would never attach. A document patch (no srcdoc rewrite) keeps the
  // same doc, so `load` doesn't fire and the surviving listeners are reused.
  let frameEl = null;
  if (hoverAny) {
    frameEl = getFrame();
    if (frameEl) frameEl.addEventListener('load', rebind);
    bindDoc();
  }

  let ro = null;
  try { ro = new ResizeObserver(reflow); ro.observe(stage); } catch { /* older browser */ }
  window.addEventListener('resize', reflow);

  function destroy() {
    clear();
    while (timers.length) clearTimeout(timers.pop());
    if (frameEl) { try { frameEl.removeEventListener('load', rebind); } catch { /* gone */ } }
    unbindDoc();
    curSection = chartEl = detailsEl = null;
    try { ro?.disconnect(); } catch { /* noop */ }
    window.removeEventListener('resize', reflow);
    root.remove();
  }

  return { onSlide, reflow, handleKey, reveal, clear, interactive, rebind, destroy };
}
