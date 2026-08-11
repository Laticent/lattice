/**
 * fit-sweep — WHEN the overflow/legibility probes run, and over WHICH slides.
 *
 * `overflow-probe.js` answers "does this slide overflow?". This module answers the
 * two questions wrapped around it, which used to have no owner at all: what should
 * TRIGGER a measurement, and which sections should a triggered measurement touch.
 * Both were previously implicit in one line of `lib/runtime/index.js` —
 * `schedulePostMutation(check)` — and that line is what this file replaces.
 *
 * ── WHAT WAS WRONG ──────────────────────────────────────────────────────────
 *
 * The watcher registered its full-document scan on a MutationObserver bound to
 * `document.body` with `subtree`, `childList`, `characterData` AND `attributes`
 * all on, coalesced to one run per animation frame. Two consequences, and the
 * second is the expensive one:
 *
 *   · THE OBSERVER WATCHED THE WATCHER'S OWN WRITES. Every class toggle and
 *     attribute stamp the scan performs is itself a mutation the same observer
 *     sees, so the only thing standing between the watcher and a permanent
 *     60fps loop was a hand-written idempotency guard at every single write
 *     site. One omission is a hang, and that is not hypothetical: the Fix-Me
 *     overlay shipped exactly that loop (destroy + rebuild every frame, for as
 *     long as an overflowing slide stayed in view) until a signature guard was
 *     added. A design whose correctness rests on never forgetting a guard will
 *     eventually forget one.
 *
 *   · IT MEASURED THE WHOLE DECK, INCLUDING SLIDES NOBODY CAN SEE. The
 *     filmstrip previewers (`docs/src/playground/deck-preview.js`) mount every
 *     slide and let the browser skip off-screen layout with
 *     `content-visibility: auto`. Probing an off-screen section reads its
 *     descendants' rects and scroll dims, which forces exactly the layout the
 *     virtualization was there to avoid — so the watcher paid for the whole
 *     deck, every frame, and canceled an optimization the preview had already
 *     bought. Measured on the 40-slide all-overflowing stress deck with the
 *     filmstrip's own styling applied: 12.6ms to sweep all 40 against 0.7ms to
 *     sweep the 3 in view. The gap grows with deck length while the visible
 *     work stays constant.
 *
 * ── THE MODEL ───────────────────────────────────────────────────────────────
 *
 * A GENERATION is one settled render. It is bumped by the things that can
 * actually change a verdict — a content pass, fonts settling, diagrams landing,
 * a resize — and NOT by the watcher's own DOM writes, which is what breaks the
 * feedback cycle at the root instead of guarding each write.
 *
 * Within a generation each section is measured AT MOST ONCE, and only while it
 * sits in the SWEEP BAND (the viewport plus a margin either side). A section
 * that scrolls into view carries a stale generation, so it is measured then —
 * once — and a scroll back and forth costs nothing. The section's own box is
 * part of the cache key, so a slide whose box changed is re-measured even
 * inside one generation (a lazily-loaded image resizing its own frame).
 *
 * WHY A RECT TEST AND NOT AN IntersectionObserver. The band test reads
 * `getBoundingClientRect()` on the SECTION, which under `contain-intrinsic-size`
 * is answered from the placeholder size without laying the subtree out — so the
 * filter itself is cheap and, critically, does not de-virtualize the thing it is
 * deciding whether to probe. Measured at 0.1ms for 117 sections. An
 * IntersectionObserver would cost about the same and add an async seeding
 * problem the synchronous boot sweep does not have (its first callback lands a
 * frame late, so the first paint would carry no ring), plus an observer
 * lifecycle to tear down. The rect test has neither.
 *
 * SKIPPED WORK IS COUNTED, NOT SILENT (HARD RULE #25). `planFitSweep` returns
 * why each section was passed over, so a caller — the bench scenario, a debug
 * overlay — can say "37 off-band, 78 already current this generation" rather
 * than implying the sweep covered the deck.
 *
 * Pure, DOM-free and dependency-free: it takes accessor functions rather than
 * elements, so the scheduling policy is unit-testable in Node with no browser
 * and no jsdom. See test/unit/core/fit-sweep.test.js.
 */

// How far outside the viewport a slide still counts as "in play", as a multiple
// of viewport height. One full viewport either side: enough that a slide is
// already measured by the time a normal scroll brings it into view, so the ring
// is never seen arriving late, and small enough that a 117-slide filmstrip
// measures a handful rather than all of them.
//
// NOT zero, and the reason is worth stating: at zero the measurement would race
// the paint of the slide that triggered it, and the author would watch rings
// appear one slide at a time as they scrolled. The margin buys the verdict
// before the slide is looked at.
const SWEEP_BAND_RATIO = 1;

// The band is an INTERACTIVE optimization, and on its own it is not a coverage
// policy. `COMPLETE` is the band that includes everything, and a sweep at this
// width is what keeps the register's actual promise: no slide goes permanently
// unmeasured.
//
// THIS EXISTS BECAUSE THE BAND ALONE WAS SILENT, measured on the real bundle —
// 12 stacked slides, every one overflowing, viewport 1200x800:
//
//   loaded, never scrolled            3 / 12 marked
//   after page.pdf() (print/marp-cli) 3 / 12 marked
//   during a continuous scroll        no new coverage at all
//   after everything settled         11 / 12 — one slide fell in the gap between
//                                     two sampled bands and was never measured
//
// The first two are whole classes of render target, not corner cases: a printed
// document and an Export-to-Marp bundle (which renders THROUGH this runtime
// inside marp-cli, where it is the only marker producer) are never scrolled by
// anyone, so a band-scoped sweep measures the first viewport and stops. That is
// exactly the silent clip `2026-07-30-overflow-marker-register.md` made `reader`
// the export default to prevent, reintroduced one layer down.
//
// The resolution is not to drop the band — it is what makes an edit cheap — but
// to stop it being the LAST word. Interactive sweeps use the band; a backstop
// sweep at COMPLETE runs on a longer idle. The backstop is nearly free in the
// steady state and that is the whole reason this shape works: it runs at the
// CURRENT generation, so every slide already measured is skipped by the cache
// and only the never-measured ones cost a probe. On a settled deck it is a rect
// read per section (0.1ms across 117) and no probes at all.
const COMPLETE = Infinity;

/**
 * Is this rect inside the sweep band?
 *
 * `rect` is in the same coordinate space `getBoundingClientRect()` returns —
 * relative to the viewport, so "0" is the top edge of what the reader sees.
 *
 * A DEGENERATE rect (all zeros) counts as IN BAND, deliberately. That is what a
 * section reports in jsdom, in a `display: none` host, and before first layout —
 * and in all three the honest answer is "I cannot tell", which must fail toward
 * measuring rather than toward silence. A watcher that goes quiet whenever it
 * cannot see is the failure mode this whole register exists to prevent (#1299).
 */
function inSweepBand(rect, viewportH, bandRatio = SWEEP_BAND_RATIO) {
  if (!rect) return true;
  // The completeness backstop, and any caller that asks for everything.
  if (!(bandRatio < COMPLETE)) return true;
  const h = typeof viewportH === 'number' && viewportH > 0 ? viewportH : 0;
  // No viewport to speak of (jsdom, a detached document): measure everything.
  if (!h) return true;
  const margin = h * bandRatio;
  const top = typeof rect.top === 'number' ? rect.top : 0;
  const bottom = typeof rect.bottom === 'number' ? rect.bottom : 0;
  if (top === 0 && bottom === 0) return true;
  return bottom > -margin && top < h + margin;
}

/**
 * Has this section already been measured for this generation, at this box?
 *
 * The box is part of the key because a generation is a claim about the DOCUMENT
 * settling, not about one section's geometry: a lazily-decoded image or a
 * late-arriving chart can resize a single slide without anything bumping the
 * generation, and that slide's verdict is then stale while every other slide's
 * is fine.
 */
function fitStateIsCurrent(state, generation, w, h) {
  return !!state && state.gen === generation && state.w === w && state.h === h;
}

/**
 * Decide which sections a triggered sweep should actually probe.
 *
 * Accessors rather than DOM so this stays pure:
 *   · `rectOf(section)`  → a viewport-relative rect, or null if unmeasurable
 *   · `boxOf(section)`   → `{ w, h }`, the section's own layout box
 *   · `stateOf(section)` → the `{ gen, w, h }` recorded by the last sweep, or undefined
 *
 * Returns the list to measure plus a census of what was passed over and why.
 * The caller is expected to record `{ gen: generation, w, h }` for everything in
 * `measure` — this function records nothing itself, so it can be called twice
 * with the same answer (which is what makes it testable).
 */
function planFitSweep({
  sections,
  generation,
  viewportH,
  rectOf,
  boxOf,
  stateOf,
  bandRatio = SWEEP_BAND_RATIO,
}) {
  const measure = [];
  let offBand = 0;
  let current = 0;
  for (const s of sections) {
    if (!inSweepBand(rectOf(s), viewportH, bandRatio)) {
      offBand++;
      continue;
    }
    const box = boxOf(s) || { w: 0, h: 0 };
    if (fitStateIsCurrent(stateOf(s), generation, box.w, box.h)) {
      current++;
      continue;
    }
    measure.push({ section: s, w: box.w, h: box.h });
  }
  return { measure, skipped: { offBand, current }, total: sections.length };
}

module.exports = {
  SWEEP_BAND_RATIO,
  COMPLETE,
  inSweepBand,
  fitStateIsCurrent,
  planFitSweep,
};
