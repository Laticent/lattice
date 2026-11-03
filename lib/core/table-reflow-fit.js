/**
 * Table reflow, paged: keep a narrow layout only where it FITS.
 *
 * A table that runs out of width changes shape (lib/core/table-shape.js names the layout,
 * lib/base/base.table-reflow.css switches it inside a container query). On a continuous
 * page that is always right: the page grows. On a slide it is not, because the height is
 * fixed and a card is taller than the row it replaces: a six-row table in a narrow pane that
 * fits as a table on `main` clipped as six cards. Pure CSS cannot know whether the cards fit.
 *
 * So in a PAGED host this pass measures each slide whose table switched, and if the slide now
 * overflows, it HOLDS that slide's tables in their table form (`lat-reflow-held`, which the
 * stylesheet excludes). A slide can therefore never come out worse than the table form it had
 * before reflow existed: either the narrow layout fits, or the table is exactly what it was.
 * It holds every switched table on an overflowing slide, not the fewest that would make it
 * fit, because the table form is the one known baseline; a finer search would guess.
 *
 * A CONTINUOUS host opts out with `data-lattice-flow="continuous"` on the root element: there
 * the height is free and the narrow layout always stands. Nothing sets it yet except the Frame
 * Lab; the fluid and document views will.
 *
 * WHERE IT RUNS. The CLI injects `HOLD_UNFIT_REFLOW_SRC` into the export page before it measures
 * overflow, beside the guards trim; the browser runtime calls `holdUnfitReflow` for the live
 * preview. Like the trim, it cannot reach a plain `.html` deliverable, which is written before the
 * page renders: there the runtime, if the page carries it, does the same at view time.
 *
 * SELF-CONTAINED on purpose: the CLI ships this function as source (`.toString()`), so it must not
 * close over anything in this module. The overflow probe arrives as an argument, the shared one
 * (lib/core/overflow-probe.js `probeSectionOverflow`, HARD RULE #1).
 */

/** The class that holds a table in its table form. base.table-reflow.css excludes it. */
const HELD_CLASS = 'lat-reflow-held';

/**
 * Hold, in table form, every switched reflow table on a slide that overflows.
 *
 * @param {Document} doc
 * @param {Function} probe     probeSectionOverflow(section, clipSel, tol, ignoreSel) → { over }
 * @param {string} clipSel     CLIP_CELL_SELECTOR
 * @param {string} ignoreSel   IGNORED_CLIP_SELECTOR
 * @param {number} tol         FRAME_TOLERANCE
 * @returns {number[]} the 1-based indices of the slides whose tables were held
 */
function holdUnfitReflow(doc, probe, clipSel, ignoreSel, tol) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  const root = doc.documentElement;
  if (root && root.getAttribute('data-lattice-flow') === 'continuous') return [];
  const HELD = 'lat-reflow-held';
  const held = [];
  const sections = [...doc.querySelectorAll('section[data-lattice-slide]')];
  sections.forEach((s, i) => {
    // Only a table whose narrow layout is ACTIVE: its first body row no longer lays out as a row.
    const switched = [...s.querySelectorAll('table.lat-reflow-cards, table.lat-reflow-pairs')].filter((t) => {
      if (t.classList.contains(HELD)) return false;
      const row = t.tBodies && t.tBodies[0] && t.tBodies[0].rows[0];
      return !!row && getComputedStyle(row).display !== 'table-row';
    });
    if (!switched.length) return;
    const verdict = probe(s, clipSel, tol, ignoreSel);
    if (!verdict || !verdict.over) return;
    for (const t of switched) t.classList.add(HELD);
    held.push(i + 1);
  });
  return held;
}

const HOLD_UNFIT_REFLOW_SRC = holdUnfitReflow.toString();

module.exports = { HELD_CLASS, holdUnfitReflow, HOLD_UNFIT_REFLOW_SRC };
