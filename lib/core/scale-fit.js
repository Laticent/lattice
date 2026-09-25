/**
 * scale-fit — STEP, the Fit-Ladder move that absorbs the projection font scale.
 *
 * `scale-l` / `scale-xl` / `scale-2xl` (lib/base/base.modifiers.css) raise
 * `--fs-scale` to 1.15 / 1.3 / 1.5, and every readable size on the slide grows with
 * it. The box does not. Prose grows on BOTH axes — the glyphs are taller AND fewer
 * of them fit on a line — so a wrapped paragraph needs about s² of its designed
 * height: 1.69x at scale-xl. A slide authored to its component's capacity at the
 * designed size cannot hold that, and on the repro deck 25 of 64 slides clipped at
 * scale-xl. The design record is
 * `engineering/decisions/2026-09-25-font-scale-fit.md`.
 *
 * STEP takes that slide back down the SAME ladder the author picks from — 1.5,
 * 1.3, 1.15, 1 — one rung at a time, and stops at the first rung that fits. It
 * never goes below 1: the designed size is the floor the Fit Spine already names
 * (2026-06-22-the-fit-spine.md §3, move 4), so this is the author's own
 * enlargement being declined on one slide, not a shrink past the floor. It is the
 * same thing typography.md §7 already tells an author to do by hand ("step the
 * scale back down"), and the rendered slide is the one a hand-written
 * `_class: scale-l` produces, chrome included.
 *
 * THE RULES
 *
 *   1. NOTHING HAPPENS AT THE DESIGNED SIZE. A section whose resolved `--fs-scale`
 *      is not above 1 is read once and never written. A deck without a scale
 *      class renders byte-identically, which is what lets this ship to every
 *      render path without a golden moving.
 *   2. FIT OR CHANGE NOTHING. When even 1 does not fit, the requested scale is put
 *      back and the slide clips exactly as it did before, so the ring and the
 *      export's OVERFLOW line report the slide as authored. Stepping a slide that
 *      still clips would change what the author sees and fix nothing.
 *   3. "FITS" MEANS WHAT THE RING MEANS, plus a cut the ring cannot see. The
 *      geometry probe's `over`, or a clip box cutting readable text — `code` never
 *      wraps, so a line past the pane's right edge is cut by the pane's own
 *      `overflow: hidden` and the geometry probe reads that as the box doing its
 *      job. A cut confined to the footer band (`chromeOnly`) does not count; that
 *      footer ellipsizes at every scale.
 *   4. IDEMPOTENT. Every call first undoes its own previous step, so the live
 *      runtime can re-run it on each sweep and an edit that makes a slide shorter
 *      gets its full scale back.
 *   5. A SPECIMEN IS LEFT ALONE. `<!-- stress-slide -->` means "this overflows on
 *      purpose", and the splitter already honors it (lib/core/auto-split.js).
 *
 * The step is recorded on the section as `data-lattice-scale-step="<requested>><landed>"`
 * (e.g. `1.3>1.15`), which is what the emulator's SCALE line counts. The value it
 * writes is an inline `--fs-scale`, because the twelve `--fs-*` tokens are declared
 * on `section` and re-resolve against the section's own multiplier (typography.md
 * §7 "Why the calc lives on `:root, section`").
 *
 * INJECTED, NOT REQUIRED, IN TWO OF ITS THREE CALLERS. The emulator's `page.evaluate`
 * pass and the watcher embedded in every exported `.html` receive this function's
 * SOURCE (`SCALE_FIT_SRC`), so everything it needs travels inside it: the ladder is a
 * literal here rather than a module constant, and the probes arrive as arguments.
 * `test/unit/core/scale-fit.test.js` pins the literal to `SCALE_STEPS` and to the
 * modifier CSS, so the three cannot drift.
 */

/** The rungs, top to bottom. Pinned against base.modifiers.css by the unit test. */
const SCALE_STEPS = Object.freeze([1.5, 1.3, 1.15, 1]);
const SCALE_STEP_ATTR = 'data-lattice-scale-step';

/**
 * Step `s` down the projection scale until it fits.
 *
 * @param {Element} s  a slide section
 * @param {{probeSectionOverflow: Function, probeContentClipped: Function}} deps
 * @param {{clipSel: string, ignoreSel: string, bearerSel: string, tol: number}} opts
 * @returns {null | {from: number, to: number|null}}  null when nothing was asked of
 *   it (designed size, or it fits); `to: null` when no rung fits (rule 2).
 */
function fitScaleStep(s, deps, opts) {
  const STEPS = [1.5, 1.3, 1.15, 1];
  const ATTR = 'data-lattice-scale-step';
  const PRIOR = 'data-lattice-scale-prior';
  // Rule 4 — undo our own previous step, restoring any inline value the author had.
  if (s.hasAttribute(ATTR)) {
    const prior = s.getAttribute(PRIOR);
    if (prior) s.style.setProperty('--fs-scale', prior);
    else s.style.removeProperty('--fs-scale');
    s.removeAttribute(ATTR);
    s.removeAttribute(PRIOR);
  }
  const requested = parseFloat(getComputedStyle(s).getPropertyValue('--fs-scale'));
  // Rule 1 — the designed size is never touched.
  if (!(requested > 1)) return null;
  // Rule 5 — a specimen overflows on purpose. Same spelling auto-split reads.
  const notes = s.querySelector('aside.lattice-notes');
  if (notes && /\bstress-slide\b/.test(notes.textContent || '')) return null;
  // Rule 3 — what "does not fit" means.
  const clips = () => {
    const p = deps.probeSectionOverflow(s, opts.clipSel, opts.tol, opts.ignoreSel);
    if (p.over) return true;
    if (!p.clipSuspect) return false;
    const c = deps.probeContentClipped(s, opts.ignoreSel, opts.tol, opts.bearerSel);
    return !!(c?.cut && !c.chromeOnly);
  };
  if (!clips()) return null;
  const inline = s.style.getPropertyValue('--fs-scale');
  for (const step of STEPS) {
    if (step >= requested) continue;
    s.style.setProperty('--fs-scale', String(step));
    if (!clips()) {
      s.setAttribute(ATTR, `${requested}>${step}`);
      if (inline) s.setAttribute(PRIOR, inline);
      return { from: requested, to: step };
    }
  }
  // Rule 2 — no rung fits: put the requested scale back.
  if (inline) s.style.setProperty('--fs-scale', inline);
  else s.style.removeProperty('--fs-scale');
  return { from: requested, to: null };
}

module.exports = {
  SCALE_STEPS,
  SCALE_STEP_ATTR,
  fitScaleStep,
  // Function source for verbatim injection into the emulator's page.evaluate and the
  // watcher embedded in the exported .html (HARD RULE #1 — one kernel, three callers).
  SCALE_FIT_SRC: fitScaleStep.toString(),
};
