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
 * A hold that does not bring the table form back (a component that stacks on its own terms, as
 * glossary does on the mobile canvas) is removed again, so the form a slide had before stands.
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
 * Hold, in its authored form, every switched reflow table or card list on a slide that overflows.
 *
 * @param {Document} doc
 * @param {Function} probe     probeSectionOverflow(section, clipSel, tol, ignoreSel) → { over }
 * @param {string} clipSel     CLIP_CELL_SELECTOR
 * @param {string} ignoreSel   IGNORED_CLIP_SELECTOR
 * @param {number} tol         FRAME_TOLERANCE
 * @param {Set<Element>} [only] judge only these sections (a resize re-judges the slides it changed)
 * @returns {number[]} the 1-based indices of the slides whose tables were held
 */
function holdUnfitReflow(doc, probe, clipSel, ignoreSel, tol, only) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  const root = doc.documentElement;
  if (root && root.getAttribute('data-lattice-flow') === 'continuous') return [];
  const HELD = 'lat-reflow-held';
  const held = [];
  const sections = [...doc.querySelectorAll('section[data-lattice-slide]')];
  sections.forEach((s, i) => {
    // `only` (a Set of sections) limits the pass to slides whose box changed; the slide number
    // reported stays the slide's place in the whole deck.
    if (only && !only.has(s)) return;
    // Only an element whose narrow layout is ACTIVE.
    //  - A table that names a narrow layout (the engine's `lat-reflow-cards` / `-pairs`, or one a
    //    component declares, as glossary does): its first body row no longer lays out as a row.
    //  - A list of cards (lib/base/base.card-reflow.css): its column rule sets `--lat-narrow: 1`.
    //  - A content area that stacks its own grid (redline): its width rule sets the same.
    const active = (el) => {
      if (el.tagName === 'TABLE') {
        const row = el.tBodies && el.tBodies[0] && el.tBodies[0].rows[0];
        return !!row && getComputedStyle(row).display !== 'table-row';
      }
      // Declared on the element itself, not inherited: a stacked redline stage sets the marker and
      // its rationale list would otherwise count as a second narrow layout of its own.
      const on = (node) => !!node && getComputedStyle(node).getPropertyValue('--lat-narrow').trim() === '1';
      return on(el) && !on(el.parentElement);
    };
    const candidates = [
      ...s.querySelectorAll('table[data-lat-reflow]:not([data-lat-reflow="none"])'),
      ...s.querySelectorAll('.cell-stage > :is(ul, ol, div)'),
      // A grid that IS the content area: redline's `.split` / `.three-col` stack the stage itself.
      ...s.querySelectorAll('.cell-stage'),
    ];
    const switched = candidates.filter((el) => !el.classList.contains(HELD) && active(el));
    if (!switched.length) return;
    const verdict = probe(s, clipSel, tol, ignoreSel);
    if (!verdict || !verdict.over) return;
    for (const el of switched) el.classList.add(HELD);
    // Keep a hold only where it brought the authored form back. A component rule that stacks
    // regardless of the hold (glossary's mobile `strip` rule, whose two columns are the worse
    // form on a phone) is left as it was, and its slide is not reported as held.
    let restored = 0;
    for (const el of switched) {
      if (active(el)) el.classList.remove(HELD);
      else restored++;
    }
    if (restored) held.push(i + 1);
  });
  return held;
}

const HOLD_UNFIT_REFLOW_SRC = holdUnfitReflow.toString();

module.exports = { HELD_CLASS, holdUnfitReflow, HOLD_UNFIT_REFLOW_SRC };
