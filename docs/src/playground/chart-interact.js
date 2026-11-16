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
// The chart MODEL — selectors, mark lookup, the card's title/value/color and detail, the near-miss hit
// test, the label proxies, the hold zone and the emphasis — is shared with the exported HTML player
// (HARD RULE #1). This file is the Studio's HOST for it: the iframe bridge, the pinned hit-surface,
// the popover and the timers. engineering/decisions/2026-11-16-cenno-popover-library.md §7.
import {
  CHART_SVG_SEL,
  revealable as canReveal,
  chartSvgIn,
  markCount as countMarks,
  DETAILS_SEL,
  detailFor,
  emphasize as emphasizeMarks,
  inHoldZone as inMarkHoldZone,
  MARK_SEL,
  markIndex,
  infoFor as markInfo,
  marksFor as marksAt,
  markEls as marksOf,
  namedMark,
  nearestMark,
  sectionScale,
  TPL_SEL,
  unemphasize,
} from '../../../lib/runtime/chart-reveal/model.mjs';
import { frameGeom as sharedFrameGeom } from './frame-geom.js';

const REDUCED = (() => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
})();
const COARSE = (() => {
  try { return window.matchMedia('(pointer: coarse)').matches; } catch { return false; }
})();

function el(cls) { const d = document.createElement('div'); if (cls) d.className = cls; return d; }

// Text into markup: the five characters that can end a text run or an attribute value.
const escText = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

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

  // Chart-family vocabulary: one per kind, shared with the player (lib/runtime/chart-reveal/model.mjs).

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

  // ── the current chart, through the shared model ─────────────────────────────
  const markEls = () => marksOf(chartEl);
  const marksFor = (i) => marksAt(chartEl, i);
  const markCount = () => countMarks(chartEl);
  const infoFor = (i) => markInfo(curSection, chartEl, i);

  // ── geometry ──────────────────────────────────────────────────────────────
  // Map the chart's box (measured inside the iframe) into stage coordinates and
  // pin the hit-surface over it. Same for any open popover.
  function reflow() {
    // The live svg can change UNDER a binding: the Anima host mounts its clone ASYNCHRONOUSLY (after a
    // pinned onSlide already bound the poster), then hides the poster. Re-resolve to the visible svg so
    // a first-view pinned chart (Present, entered directly on a with-motion slide) recovers the clone once
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
    setChart(d ? d.querySelectorAll('.lattice > section, .lattice > div[data-lv-ph]')[curIdx] : null);
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

  // The near-miss reach in SCREEN px — a fingertip on touch, a small halo for a mouse. The model's
  // `nearestMark` measures in the slide document's px, so callers divide by the frame scale.
  const reachPx = () => (COARSE ? 22 : 6);

  // ── reveal command (pointer / keys / presenter window all route here) ───────
  // Whether mark index i can open. By the marks THEMSELVES, not a count: indices can have gaps (a bar
  // whose value is not a number draws no rect, so marks run 0, 2), and a count of 2 locked mark 2 —
  // and its name, since the name became a tap target — out of ever opening. `sliceN` is the fallback
  // for a chart whose marks do not query.
  const revealable = (i) => canReveal(chartEl, i, sliceN);

  function reveal(i) {
    if (!interactive()) return;
    if (!revealable(i)) return;
    if (i === openSlice) return;
    if (openSlice < 0 && onReveal) { try { onReveal(); } catch { /* host hook */ } }
    openSlice = i;
    // Title/value/color come from the mark (data-label/value, or the legend for
    // the pie); body/meta from the authored <template>. All scoped to curSection
    // so a multi-chart preview reads the HOVERED chart's detail, not the first
    // chart in the doc. See infoFor().
    const { label, value, dot } = infoFor(i);
    // The template's OWN items only (detailFor): the first is the description, the rest the meta line.
    const d = detailFor(detailsEl, i);
    const body = d.body ? d.body.innerHTML.trim() : '';
    const meta = d.meta.map((n) => n.innerHTML.trim()).join(' · ');
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
      // `section`: the slide the chart sits on, so the host can draw the rich body with the
      // deck's own CSS (its stylesheets and the slide's custom properties); chart-detail-layer.tsx.
      try { onDetail({ label, value, dot, body, meta, lean, section: curSection, x: anchorPt?.x, y: anchorPt?.y }); } catch { /* host hook */ }
      return;
    }
    pop.classList.toggle('db-pp-chartpop--lean', lean);
    // `label`, `value` and `dot` are TEXT (a mark's data-* attribute, a text node, a computed
    // color), and DOMPurify keeps data-* attributes verbatim, so an author's
    // `data-label="<img onerror=…>"` reaches here unchanged. `pop` lives in the PARENT
    // document, beside the author's stored OpenRouter key, so escape them. `body`/`meta` are
    // the sanitized template's own markup and stay markup.
    pop.innerHTML =
      `<div class="db-pp-chartpop-h">` +
      (dot ? `<span class="db-pp-chartpop-dot" style="background:${escText(dot)}"></span>` : '') +
      `<span class="db-pp-chartpop-l">${escText(label)}</span>` +
      (value ? `<span class="db-pp-chartpop-v">${escText(value)}</span>` : '') + `</div>` +
      (body ? `<div class="db-pp-chartpop-b">${body}</div>` : '') + (meta ? `<div class="db-pp-chartpop-m">${meta}</div>` : '');
    pop.classList.add('show');
    reflow();   // re-pin the Present hit-surface
    startPop(); // Floating UI owns the popover position from here
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

  // EMPHASIS — dim the rest, lift the one, never move the data (emphasize, with the rules for each
  // geometry, the matrix chart and the Anima clone).
  function emphasize(i) {
    if (!chartEl || !curSection) return;
    emphasizeMarks(chartEl, i, { lift, reduced: REDUCED });
  }

  function clear() {
    cancelHoverClear(); // a direct clear (e.g. setChart on a chart change) cancels any pending debounce
    openSlice = -1;
    ptr = null;       // next reveal (e.g. keyboard) falls back to the disc until a pointer moves
    anchorPt = null;
    stopPop();
    if (onDetail) { try { onDetail(null); } catch { /* host hook */ } }
    pop.classList.remove('show');
    // Reset the lift/dim we applied (a no-op on an anima chart, whose inline styles are the renderer's
    // baked frame — emphasize never touched them).
    unemphasize(chartEl);
  }

  // ── keyboard: number keys reveal; 0/Esc clear ───────────────────────────────
  function handleKey(e) {
    if (!interactive()) return false;
    if (e.key === 'Escape') { if (openSlice >= 0) { clear(); return true; } return false; }
    if (e.key === '0') { clear(); return true; }
    if (e.key >= '1' && e.key <= '9') {
      const i = +e.key - 1;
      if (revealable(i)) { reveal(i); return true; } // a digit naming no mark → don't swallow it
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
  // HOLD ZONE (inHoldZone): the open mark's box grown by HOLD_SLIDE_PX slide px, so a pointer that
  // slips into the gap between marks keeps the card instead of flickering it.
  const HOLD_SLIDE_PX = 10;
  function inHoldZone(e) {
    if (openSlice < 0 || !curSection) return false;
    return inMarkHoldZone(chartEl, openSlice, e.clientX, e.clientY, HOLD_SLIDE_PX * sectionScale(curSection));
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
