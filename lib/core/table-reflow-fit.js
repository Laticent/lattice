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

/**
 * FORCE a narrow layout where the table form RUNS PAST ITS WIDTH (owner, 2026-11-15; fit-everywhere-model.md §25).
 *
 * The width rules switch a table at a fixed width in `em` (base.table-reflow.css). That missed a phone square
 * (about 23em at its x1.4 type) for a three-column table, whose last column ran off the page. Raising the card
 * width to 24em fixed it, and also turned about 140 tables that fit as grids into one card per row, so it was
 * reverted. This switches only a table whose grid is measured wider than its stage, and leaves every table
 * that fits exactly as it is.
 *
 * It sets `--lat-reflow-force: 1` on the table's stage, which each narrow layout's container query also
 * accepts (`… or style(--lat-reflow-force: 1)`), so the layout rules exist once. A browser without style
 * queries (Firefox, measured 2026-11-15) ignores the second condition and keeps today's behavior.
 * `holdUnfitReflow` then judges the forced layout as it judges every switched one: cards that overflow the
 * slide are held back in their table form.
 *
 * SELF-CONTAINED, as `holdUnfitReflow` is: the CLI ships it as source. Returns, for each slide section in
 * document order, whether its stage was forced, so the CLI can write the same mark into its string.
 *
 * @param {Document} doc
 * @param {Set<Element>} [only] judge only these sections (a resize re-judges the slides it changed)
 * @returns {boolean[]} one entry per `section` in document order
 */
function forceOverflowingReflow(doc, only) {
  if (!doc || typeof doc.querySelectorAll !== 'function') return [];
  const NARROW = ['lat-reflow-cards', 'lat-reflow-pairs', 'lat-reflow-runs', 'lat-reflow-options', 'lat-reflow-ranked', 'lat-reflow-schedule', 'lat-reflow-lists'];
  const KEY = '--lat-reflow-force';
  return [...doc.querySelectorAll('section')].map((s) => {
    if (only && !only.has(s)) return false;
    const stage = s.querySelector(':scope > .cell-stage');
    if (!stage) return false;
    // Judged afresh each time: a mark from an earlier box (a phone the page was printed for, a window since
    // widened) comes off first, so a grid that fits now is a grid again.
    stage.style.removeProperty(KEY);
    const tables = [...stage.querySelectorAll(':scope > table')].filter((t) => NARROW.some((c) => t.classList.contains(c)));
    // The mark sits on the stage (a container query cannot ask about one table), so every narrow-layout table
    // in it would switch: only a stage with exactly one is forced, never a fitting table beside a wide one.
    if (tables.length !== 1) return false;
    const t = tables[0];
    if (t.classList.contains('lat-reflow-held')) return false;
    // A three-column `runs` table takes the narrowest runs step when marked (one column per block,
    // base.table-reflow.css, "runs, three columns, forced"); four or more columns take the blocks of two.
    const row = t.tBodies && t.tBodies[0] && t.tBodies[0].rows[0];
    // Already narrow (its width rule fired): nothing to force.
    if (!row || getComputedStyle(row).display !== 'table-row') return false;
    // The SLIDE's edge, which is what cuts text. A grid that runs a little past its stage into the slide's
    // side margin (7.4px on table-outer-edge.md at a phone square) reads whole, and the export's clip probe
    // does not flag it: forcing it into cards would trade a readable grid for a run of cards. A grid that
    // runs past the slide's edge (193px on video-plugin.md, 683px on media/README.md) loses its last column.
    const wide = t.getBoundingClientRect().right > s.getBoundingClientRect().right + 0.5 || t.scrollWidth > t.clientWidth + 0.5;
    if (wide) stage.style.setProperty(KEY, '1');
    return wide;
  });
}

const HOLD_UNFIT_REFLOW_SRC = holdUnfitReflow.toString();
const FORCE_OVERFLOWING_REFLOW_SRC = forceOverflowingReflow.toString();

module.exports = { HELD_CLASS, holdUnfitReflow, HOLD_UNFIT_REFLOW_SRC, forceOverflowingReflow, FORCE_OVERFLOWING_REFLOW_SRC };
