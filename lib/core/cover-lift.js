/**
 * lib/core/cover-lift.js
 *
 * A split cover that cannot hold its subtitle moves it to the first body page (owner,
 * 2026-11-06). The cover is an accent field holding the slide's eyebrow, title, subtitle, lede and
 * the run's lead-in, at reading size; a long title on a small box runs them into the footer band
 * (measured: 57px on the export check deck at square). Shrinking the cover's type is ruled out
 * (fit-everywhere-model.md: a venue sets type), so the text that is not the title moves instead:
 * the subtitle first, then the lede, each only while the cover still runs into its footer. They
 * land at the top of the run's first body page, above its members, where the reader meets them
 * next, and only while that page has room for them; a cover whose page 1 is full keeps its text.
 *
 * CSS cannot do it: whether a cover overflows depends on the rendered title. So this pass
 * MEASURES the cover's content bottom against its footer's top and moves DOM nodes. The export
 * runs it before every verify round of the measured split (lattice.js), so a body page that the
 * moved text makes too full is tightened and re-planned like any other; the runtime runs the
 * same kernel. Once moved, the cover fits and nothing is left to move, so a second pass writes
 * nothing.
 *
 * Pure and self-contained (no closure over module scope), so `.toString()` can inject it into
 * the export page: one source of truth with lib/runtime/index.js (HARD RULE #1), the
 * lib/core/card-tag-equalize.js pattern.
 */
function liftCoverText(doc) {
  const TOL = 2;
  let moves = 0;
  const covers = [...doc.querySelectorAll('section[data-split-role="cover"]')];
  for (const cover of covers) {
    const run = (cover.getAttribute('data-lattice-slide') || '').split('.')[0];
    if (!run) continue;
    const foot = cover.querySelector(':scope > .cell-footer, :scope > footer');
    const parts = () => [...cover.querySelectorAll(':scope > .split-feat-eye, :scope > .split-feat-h, :scope > .split-feat-sub, :scope > .split-feat-lede, :scope > .split-cover-lead')];
    const floor = () => (foot ? foot.getBoundingClientRect().top : cover.getBoundingClientRect().bottom);
    const over = () => Math.max(...parts().map((e) => e.getBoundingClientRect().bottom)) - floor();
    if (!(over() > TOL)) continue;
    // The run's first body page: the next body section of the same run, in document order.
    let page = null;
    for (const s of doc.querySelectorAll('section[data-split-role="body"]')) {
      if ((s.getAttribute('data-lattice-slide') || '').split('.')[0] === run) { page = s; break; }
    }
    if (!page) continue;
    // Where the text lands: the page's stage cell, or, on a page a strategy built without one
    // (split-panel's points pages: a run heading, the list, the chrome), the page itself, before
    // its first content element.
    const CHROME = '.cell-footer, .split-runhead, .lat-split-rel, .split-lifted, [data-lattice-berth], header, footer';
    const stage = page.querySelector(':scope > .cell-stage');
    const box = stage || page;
    const content = [...box.children].filter((k) => !k.matches(CHROME));
    if (!content.length) continue;
    let held = box.querySelector(':scope > .split-lifted');
    const before = moves;
    // The page's spare height, measured on the content's own height: a run that centers its pages
    // (lib/core/run-placement.js) pads the stage's top, and counting that padding as used left a
    // page with half its height free reading as full. Text moves only while the page has room for
    // it (measured at the cover's larger size, so the guess is generous): a moved subtitle that
    // overfilled page 1 would trade a cut cover for a cut page, and the measured split would
    // re-plan the whole run around it.
    const view = doc.defaultView || globalThis;
    const cs = view.getComputedStyle(box);
    const boxes = content.map((k) => k.getBoundingClientRect());
    const used = Math.max(...boxes.map((r) => r.bottom)) - Math.min(...boxes.map((r) => r.top));
    let spare;
    if (stage) {
      const runOffset = Number.parseFloat(page.style.getPropertyValue('--run-offset')) || 0;
      const padTop = (Number.parseFloat(cs.paddingTop) || 0) - runOffset;
      spare = stage.clientHeight - padTop - (Number.parseFloat(cs.paddingBottom) || 0) - used;
    } else {
      const pageFoot = page.querySelector(':scope > .cell-footer');
      const limit = pageFoot ? pageFoot.getBoundingClientRect().top : page.getBoundingClientRect().bottom - (Number.parseFloat(cs.paddingBottom) || 0);
      spare = limit - Math.max(...boxes.map((r) => r.bottom));
    }
    const gap = Number.parseFloat(cs.rowGap) || 0;
    for (const sel of [':scope > .split-feat-sub', ':scope > .split-feat-lede']) {
      if (!(over() > TOL)) break;
      const el = cover.querySelector(sel);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      const need = r.bottom - r.top + gap;
      if (need > spare) break;
      spare -= need;
      if (!held) {
        held = doc.createElement('div');
        held.className = 'split-lifted';
        box.insertBefore(held, content[0]);
      }
      held.appendChild(el);
      moves += 1;
    }
    if (moves > before) cover.setAttribute('data-cover-lifted', '');
  }
  return moves;
}

module.exports = { liftCoverText, LIFT_COVER_TEXT_SRC: liftCoverText.toString() };
