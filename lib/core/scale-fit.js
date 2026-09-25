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
 * STEP renders that slide at the DESIGNED size, 1x, instead. It never goes below 1:
 * the designed size is the floor the Fit Spine already names (2026-06-22-the-fit-spine.md
 * §3, move 4), so this is the author's own enlargement being declined on one slide, not
 * a shrink past the floor. It is the same thing typography.md §7 already told an author
 * to do by hand ("step the scale back down").
 *
 * TWO SIZES AT MOST, NOT A LADDER (owner ruling 2026-09-25, fit-policy.md fork 2). The
 * first cut walked 1.5 → 1.3 → 1.15 → 1 and stopped at the first size that fit, which
 * put THREE type sizes in one scale-xl deck (40 slides at 1.3x, 11 at 1.15x, 13 at 1x on
 * the repro deck). A deck is read as a set; two sizes — the one asked for, and the
 * designed one — is the most variation the owner will accept for the readability it buys.
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
 *   6. `fit: report` TURNS IT OFF. A section carrying `fit-report` (the deck's
 *      `fit: report`, or a slide's own `_class: fit-report`) is never stepped — the
 *      engine only flags. See lib/core/resolve-guards.js.
 *
 * The step is recorded on the section as `data-lattice-scale-step="<requested>><landed>"`
 * (e.g. `1.3>1`), which is what the emulator's SCALE line counts. The value it writes
 * is an inline `--fs-scale`, because the twelve `--fs-*` tokens are declared on
 * `section` and re-resolve against the section's own multiplier (typography.md §7
 * "Why the calc lives on `:root, section`").
 *
 * INJECTED, NOT REQUIRED, IN TWO OF ITS THREE CALLERS. The emulator's `page.evaluate`
 * pass and the watcher embedded in every exported `.html` receive this function's
 * SOURCE (`SCALE_FIT_SRC`), so everything it needs travels inside it and the probes
 * arrive as arguments.
 */

/** The size STEP falls back to — the designed type scale, and the floor. */
const SCALE_FLOOR = 1;
const SCALE_STEP_ATTR = 'data-lattice-scale-step';

/**
 * Render `s` at the designed size when it does not fit at its projection scale.
 *
 * @param {Element} s  a slide section
 * @param {{probeSectionOverflow: Function, probeContentClipped: Function}} deps
 * @param {{clipSel: string, ignoreSel: string, bearerSel: string, tol: number}} opts
 * @returns {null | {from: number, to: number|null}}  null when nothing was asked of
 *   it (designed size, `fit: report`, a specimen, or it fits); `to: null` when even
 *   the designed size does not fit (rule 2).
 */
function fitScaleStep(s, deps, opts) {
  const FLOOR = 1;
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
  if (!(requested > FLOOR)) return null;
  // Rule 6 — `fit: report`: the engine only flags.
  if (s.classList?.contains('fit-report')) return null;
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
  s.style.setProperty('--fs-scale', String(FLOOR));
  if (!clips()) {
    s.setAttribute(ATTR, `${requested}>${FLOOR}`);
    if (inline) s.setAttribute(PRIOR, inline);
    return { from: requested, to: FLOOR };
  }
  // Rule 2 — the designed size does not fit either: put the requested scale back.
  if (inline) s.style.setProperty('--fs-scale', inline);
  else s.style.removeProperty('--fs-scale');
  return { from: requested, to: null };
}

module.exports = {
  SCALE_FLOOR,
  SCALE_STEP_ATTR,
  fitScaleStep,
  // Function source for verbatim injection into the emulator's page.evaluate and the
  // watcher embedded in the exported .html (HARD RULE #1 — one kernel, three callers).
  SCALE_FIT_SRC: fitScaleStep.toString(),
};
