/**
 * overflow-probe — the ONE source of truth for "does this slide overflow its
 * frame?", shared by every measurement site (HARD RULE #1).
 *
 * The naive test is `section.scrollHeight > section.clientHeight`. That was
 * correct while every component body flowed as direct children of `<section>`:
 * an over-stuffed body grew the section's scrollHeight, and the watcher saw it.
 *
 * The flex cell-tree (2026-06-26-frames-as-flex-cell-trees.md) changes that. A
 * bounded content Cell (`overflow: clip; min-height: 0`) CONTAINS its overflow —
 * so the cell can be 110px over its box while the SECTION reports zero overflow.
 * Left unfixed, the clip would silently swallow overflow: the red ring would
 * stop firing, the export "Overflows" warning would go quiet, and — worst —
 * runtime autosplit (lib/core/auto-split.js), which divides slides BY their
 * measured scrollHeight/clientHeight ratio, would never trigger and the content
 * would be lost off-cell with no signal. (Verified empirically on an
 * over-stuffed split-panel: section over 110px→0px once `.panel-right` clipped.)
 *
 * So overflow must be probed CELL-AWARE: a section overflows if its own box
 * overflows OR any bounded content Cell clips content internally. We surface a
 * clipped cell's internal overflow as section-equivalent (clientH + delta) so
 * the existing ratio math in measureOverflow keeps working unchanged — autosplit
 * sizes the split from the real content height, not the clipped box.
 *
 * CLIP_CELL_SELECTOR lists the bounded CONTENT cells (doc §4c: content cells
 * clip AND report; decorative cells — watermark, atmosphere, the split feature
 * bleed — clip but are NOT probed, so an intentional decorative bleed never
 * trips the ring). `.cell-stage` is the standard frame's body cell (the generic-
 * prose + migrated-component body); `.panel-right`/`.compare-right` are the split
 * frames' supporting cells. This is the single place the set is maintained.
 */

// Bounded CONTENT cells that clip their overflow and MUST be probed for it.
// Keep this in sync as frames adopt the flex cell-tree clip contract.
const CLIP_CELL_SELECTOR = '.cell-stage, .panel-right, .compare-right';

// §8 rule 8's legibility floor, as a FRACTION OF SLIDE HEIGHT — the smallest a viewBox figure's own
// text may render before the slide gets the honest ring instead of a silent shrink.
//
// A fraction, not an absolute px, because a deck is displayed scaled-to-fit: what a viewer perceives
// is the glyph's size RELATIVE to the slide, and that is also the only measure a figure's own design
// controls (its text is N user units in an M-unit viewBox, so it scales with whatever box it gets).
// An absolute px constant looked preset-invariant and is not: the SAME `state-chart` gallery figure
// measures 5.2px at `square`, 6.7px at `portrait`, 7.9px at `hd` and 23.7px at `4K` — one design,
// a 4.5× spread, and one preset where an 8px floor silently passed it. As a fraction of slide height
// `hd` and `4K` agree exactly (1.10% both), which is what an invariant floor has to do. (Found by
// the HARD RULE #25 inversion pass, which measured the spread across every preset.)
//
// 1% is a LEGIBILITY judgment, not a number fitted to the catalog: at 1% of slide height a glyph is
// ~2mm on a laptop-sized slide and ~2cm projected — the point below which a label stops being read
// and starts being decoration.
//
// MEASURED against every shipped chart + diagram gallery through the emulator (the surface this gate
// actually runs on, so the numbers are the ones a deck really gets). Nine slides fall below it:
// `state-chart` p6/p5/p9 at 0.68 / 0.74 / 0.99%, `radar` p7 (the `small-multiples` variant) at 0.94%,
// and five mermaid `diagram` pages at 0.65–0.92%. They fire ON PURPOSE — they are the rule's own
// subject: a figure whose labels render at 0.65% of the slide is exactly the "ships silently at 6px
// type" this rule was written about.
//
// DISCLOSED, because the margin is thin and a reader deserves to know: the catalog straddles this
// floor closely rather than clearing it. `diagram` p12/p29 sit at 1.02 / 1.03% and `quadrant`'s
// densest at 1.07% — one re-tune of those figures away from ringing. Everything else clears with
// room (`piechart` 1.33%, `word-cloud` 1.38%, `map` 1.78%, `funnel` 1.86%, `gantt` 2.24%). The floor
// was not moved to buy that margin; a floor chosen to keep the catalog quiet is not a floor.
//
// (Measure it the same way if you re-calibrate: through `node lattice-emulator.js`, not by loading
// the exported HTML in a bare browser — the figure's box, and so its scaled text, depends on the
// viewport, so a bare page load reports different numbers for the same slide.)
const FIGURE_TEXT_FLOOR_RATIO = 0.01;

/**
 * Does `s` (a slide <section>) overflow its frame, counting the internal
 * overflow of any bounded content cell that clips? Pure + browser-evaluable
 * (no closures, no module refs) so it can be `.toString()`-injected into the
 * emulator's inline watcher and page.evaluate contexts verbatim.
 *
 * @returns {{over:boolean, vOver:boolean, scrollH:number, clientH:number, overCells:Array<{index:number,dy:number,dx:number}>}}
 *   vOver = vertical overflow only (autosplit can only fix vertical);
 *   scrollH/clientH = the EFFECTIVE vertical extent (cell overflow folded in),
 *   for the caller's ratio math. overCells lists, by INDEX into
 *   `clipSelector`'s NodeList (never an element reference — this function is
 *   also injected into the emulator's page.evaluate context, and DOM refs
 *   can't cross that boundary), every clip cell whose own spill exceeded TOL.
 *   A clip cell that overflows genuinely clipped its own content — unlike a
 *   grow-to-fit grid card, it never pushed a neighbour — so this is a safe
 *   per-element "cause" signal where naive section-level geometry isn't (see
 *   engineering/decisions/2026-07-10-overflow-cause-highlighting.md).
 */
function probeSectionOverflow(s, clipSelector, TOL) {
  // Measure `box`'s content spill past its own rect from its FLOWED children's
  // layout rects: skips position:absolute/fixed children (decorative placement,
  // not content — a moved logo, a docked footer) and 0x0 rects
  // (display:contents / empty). With `foldChildOverflow`, each child also
  // contributes its own internal overflow (scrollHeight − clientHeight, folded
  // onto its content bottom/right) — a height-constrained body whose descendant
  // content spills would otherwise read as fitting (its BOX fits; its content
  // doesn't). Returns null when there were no measurable flowed children, so
  // callers can keep the legacy raw-dims path for the pure-dims unit fakes.
  // NESTED (not module-level) on purpose: this whole function is
  // .toString()-injected into page.evaluate / the emulator's inline watcher,
  // so everything it needs must travel inside its own source.
  function flowedSpill(box, foldChildOverflow) {
    if (typeof box.getBoundingClientRect !== 'function' || !box.children || !box.children.length) return null;
    const br = box.getBoundingClientRect();
    let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity, seen = 0;
    for (let i = 0; i < box.children.length; i++) {
      const ch = box.children[i];
      if (typeof getComputedStyle === 'function') {
        const pos = getComputedStyle(ch).position;
        if (pos === 'absolute' || pos === 'fixed') continue; // placement, not content
      }
      const r = ch.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      seen++;
      let cBottom = r.bottom, cRight = r.right;
      if (foldChildOverflow) {
        // Guarded for the pure-dims fakes whose children carry no scroll/client numbers.
        const ivh = typeof ch.scrollHeight === 'number' && typeof ch.clientHeight === 'number' ? ch.scrollHeight - ch.clientHeight : 0;
        const ivw = typeof ch.scrollWidth === 'number' && typeof ch.clientWidth === 'number' ? ch.scrollWidth - ch.clientWidth : 0;
        if (ivh > 0) cBottom = r.bottom + ivh;
        if (ivw > 0) cRight = r.right + ivw;
      }
      if (r.top < top) top = r.top;
      if (cBottom > bottom) bottom = cBottom;
      if (r.left < left) left = r.left;
      if (cRight > right) right = cRight;
    }
    if (!seen) return null;
    // spill past EITHER edge (a centered overflow spills both top and bottom)
    return {
      overV: (br.top - top > 0 ? br.top - top : 0) + (bottom - br.bottom > 0 ? bottom - br.bottom : 0),
      overH: (br.left - left > 0 ? br.left - left : 0) + (right - br.right > 0 ? right - br.right : 0),
    };
  }

  let scrollH = s.scrollHeight;
  const clientH = s.clientHeight;
  let scrollW = s.scrollWidth;
  const clientW = s.clientWidth;

  // The section's OWN content overflow, measured from its FLOWED children — NOT
  // the raw scroll dims. Raw scrollHeight/scrollWidth count DECORATIVE,
  // out-of-flow chrome intentionally placed against (or bleeding past) the slide
  // edge — a finish MARK/EDGE pseudo or a moved deck-logo — and counting those
  // as content overflow false-trips the ring / export warning / autosplit.
  // foldChildOverflow=true restores the detection raw scroll extent gave for a
  // height-constrained body whose content spills inside a fitting box (the
  // STAGE_DEFERRED chart/gantt/timeline bodies with no clip cell). Falls back
  // to raw dims when there are no measurable children (the unit fakes).
  const secSpill = flowedSpill(s, true);
  if (secSpill) {
    scrollH = clientH + (secSpill.overV > 0 ? secSpill.overV : 0);
    scrollW = clientW + (secSpill.overH > 0 ? secSpill.overH : 0);
  }

  // Bounded content cells clip their overflow (overflow:clip; min-height:0), so
  // the SECTION can report zero while a cell is 110px over. Probe each cell and
  // surface its internal overflow as section-equivalent (clientH + delta) so the
  // caller's ratio math keeps working. `scrollHeight - clientHeight` alone
  // UNDER-reports a CENTERED (or bottom-anchored) cell — content clipped off the
  // TOP sits at a negative offset scrollHeight never counts — so also measure
  // the true spill from the children's layout rects and take the larger:
  // flex-start stays correct, center / flex-end get caught.
  const cells = s.querySelectorAll(clipSelector);
  const overCells = [];
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    let dy = c.scrollHeight - c.clientHeight;
    let dx = c.scrollWidth - c.clientWidth;
    const cellSpill = flowedSpill(c, false);
    if (cellSpill) {
      if (cellSpill.overV > dy) dy = cellSpill.overV;
      if (cellSpill.overH > dx) dx = cellSpill.overH;
    }
    // …and the amount a SQUEEZED child is hiding. Neither measure above can see it: the cell's own
    // `scrollHeight - clientHeight` is zero because the flex layout SHRANK the child to make it fit,
    // and the rect walk finds no geometric spill for the same reason — a squeezed middle child's
    // folded bottom still sits above a later sibling's. So there is no overflow anywhere in the
    // geometry, and the content is simply drawn on top of itself.
    //
    // This is the common flex case, not a corner: `section.checklist > .cell-stage` distributes its
    // rows, so a `<ul>` wanting 538px in a 434px slot reports rect 434 / scrollHeight 538 while the
    // cell reports zero. Seen on a real render — a checklist with a lede, eight items, a note and a
    // key insight drew its rows over each other with NO warning and no split, because every level of
    // the measurement said it fit. The hidden amount IS the overflow, so sum it across the cell's
    // children (the same `scrollHeight - clientHeight` subtraction `flowedSpill`'s fold already
    // uses, applied where it is not masked).
    let squeezed = 0;
    for (let k = 0; k < (c.children ? c.children.length : 0); k++) {
      const ch = c.children[k];
      if (typeof ch.scrollHeight !== 'number' || typeof ch.clientHeight !== 'number') continue;
      const hidden = ch.scrollHeight - ch.clientHeight;
      if (hidden > 0) squeezed += hidden;
    }
    if (squeezed > dy) dy = squeezed;
    if (dy > 0) scrollH = Math.max(scrollH, clientH + dy);
    if (dx > 0) scrollW = Math.max(scrollW, clientW + dx);
    // Only past TOL: a cell within the same noise budget that gates `over`
    // itself isn't a provable cause, just jitter.
    if (dy > TOL || dx > TOL) overCells.push({ index: i, dy, dx });
  }
  const vOver = scrollH > clientH + TOL;
  const over = vOver || scrollW > clientW + TOL;
  return { over, vOver, scrollH, clientH, overCells };
}


/**
 * Rule 8 — the viewBox graphic's rendered-text LEGIBILITY FLOOR
 * (engineering/decisions/2026-07-22-structure-derived-split-patterns.md §8 rule 8).
 *
 * A viewBox figure is CONTAINER-RESPONSIVE: it scales to whatever box it is given, and its box
 * never overflows — so `probeSectionOverflow` above, which measures box spill and nothing else,
 * is blind to it by construction. That is the FM-1 failure the rule names: a dense figure scales
 * its internal text down without limit, the probe sees nothing, and the slide ships silently at
 * 6px type. "Container-responsive is not floor-free."
 *
 * The floor is a fraction of SLIDE HEIGHT — not the deck's type scale, and not an absolute px.
 * Not the type scale, because `--fs-meta` moves with the preset, so the SAME figure at the SAME
 * rendered size would pass in landscape (14px) and fail in portrait (27px). And not absolute px
 * either: that was this module's first answer and it was wrong for the mirror-image reason — a
 * deck is displayed scaled-to-fit, so one design measures 5.2px at `square` and 23.7px at `4K`
 * while looking identical to a viewer. The invariant a floor has to hold is the RELATIVE one; see
 * FIGURE_TEXT_FLOOR_RATIO above for the spread that settled it.
 *
 * The EFFECTIVE size is the glyph size on the page, not in the figure's coordinate space:
 * `font-size` inside a viewBox is in USER units, so it is multiplied by the viewBox→box scale.
 * (The text element's client rect is deliberately NOT the measure: for SVG text Chromium returns
 * the tight INK box, ≈ cap height, so text at exactly the floor would measure ~0.7× it.)
 *
 * Detection only — the honest ring, never a silent shrink and never a split (a figure has no seam
 * to divide). Pure + browser-evaluable and `.toString()`-injected verbatim, exactly like
 * `probeSectionOverflow`, so the live-preview watcher and the export measure share ONE rule.
 *
 * @param {Element} s a slide <section>
 * @param {number} floorRatio the floor as a fraction of slide height (FIGURE_TEXT_FLOOR_RATIO)
 * @returns {{under:boolean, minPx:number, floorPx:number, pct:number, count:number}|null}
 *   null when the section holds no viewBox figure with measurable text — nothing to judge.
 *   `floorPx` is the ratio resolved against THIS slide's height, so the report can name both.
 */
function probeFigureLegibility(s, floorRatio) {
  const figs = s.querySelectorAll ? s.querySelectorAll('svg[viewBox]') : [];
  if (!figs.length || !(floorRatio > 0)) return null;
  if (typeof getComputedStyle !== 'function') return null;
  const slideH = s.clientHeight || 0;
  if (!slideH) return null;
  const floorPx = slideH * floorRatio;
  let minPx = Infinity;
  let count = 0;
  for (let f = 0; f < figs.length; f++) {
    const fig = figs[f];
    const box = fig.getBoundingClientRect();
    const vb = fig.viewBox?.baseVal || null;
    // Uniform scale: with the default `preserveAspectRatio` the figure fits the SMALLER ratio,
    // so take the min — the honest (smaller) rendered size when the box aspect differs.
    let scale = 1;
    if (vb && vb.width > 0 && vb.height > 0 && box.width > 0 && box.height > 0) {
      scale = Math.min(box.width / vb.width, box.height / vb.height);
    }
    const texts = fig.querySelectorAll('text');
    for (let i = 0; i < texts.length; i++) {
      const t = texts[i];
      if (!t.textContent?.trim()) continue;
      const fs = parseFloat(getComputedStyle(t).fontSize);
      if (!(fs > 0)) continue;
      const px = fs * scale;
      count++;
      if (px < minPx) minPx = px;
    }
  }
  if (!count) return null;
  // Report minPx rounded DOWN, so a flagged figure never prints as EQUAL to the floor it missed
  // ("8px vs an 8px floor" reads like a bug in the check).
  return {
    under: minPx < floorPx,
    minPx: Math.floor(minPx * 10) / 10,
    floorPx: Math.round(floorPx * 10) / 10,
    pct: Math.floor((minPx / slideH) * 10000) / 100,
    count,
  };
}

module.exports = {
  CLIP_CELL_SELECTOR,
  probeSectionOverflow,
  // Function source for verbatim injection into browser-string contexts
  // (the emulator inline watcher + page.evaluate) — keeps the LOGIC single-sourced.
  PROBE_SRC: probeSectionOverflow.toString(),
  probeFigureLegibility,
  LEGIBILITY_SRC: probeFigureLegibility.toString(),
  FIGURE_TEXT_FLOOR_RATIO,
};
