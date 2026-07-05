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

/**
 * Does `s` (a slide <section>) overflow its frame, counting the internal
 * overflow of any bounded content cell that clips? Pure + browser-evaluable
 * (no closures, no module refs) so it can be `.toString()`-injected into the
 * emulator's inline watcher and page.evaluate contexts verbatim.
 *
 * @returns {{over:boolean, vOver:boolean, scrollH:number, clientH:number}}
 *   vOver = vertical overflow only (autosplit can only fix vertical);
 *   scrollH/clientH = the EFFECTIVE vertical extent (cell overflow folded in),
 *   for the caller's ratio math.
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
  for (let i = 0; i < cells.length; i++) {
    const c = cells[i];
    let dy = c.scrollHeight - c.clientHeight;
    let dx = c.scrollWidth - c.clientWidth;
    const cellSpill = flowedSpill(c, false);
    if (cellSpill) {
      if (cellSpill.overV > dy) dy = cellSpill.overV;
      if (cellSpill.overH > dx) dx = cellSpill.overH;
    }
    if (dy > 0) scrollH = Math.max(scrollH, clientH + dy);
    if (dx > 0) scrollW = Math.max(scrollW, clientW + dx);
  }
  const vOver = scrollH > clientH + TOL;
  const over = vOver || scrollW > clientW + TOL;
  return { over, vOver, scrollH, clientH };
}

module.exports = {
  CLIP_CELL_SELECTOR,
  probeSectionOverflow,
  // Function source for verbatim injection into browser-string contexts
  // (the emulator inline watcher + page.evaluate) — keeps the LOGIC single-sourced.
  PROBE_SRC: probeSectionOverflow.toString(),
};
