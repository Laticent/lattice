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
 *   2. FIT OR CHANGE NOTHING — on its own. When even 1 does not fit, STEP puts the
 *      requested scale back and the slide clips as authored, so the ring and the
 *      export's OVERFLOW line report it. It does not drag the deck down with it:
 *      size cannot fix that slide, so LEVEL leaves it out of the shared rung and
 *      renders it at that rung like its neighbors (rule 7).
 *   3. "FITS" MEANS WHAT THE RING MEANS, plus a cut the ring cannot see. The
 *      geometry probe's `over`, or a clip box cutting readable text — `code` never
 *      wraps, so a line past the pane's right edge is cut by the pane's own
 *      `overflow: hidden` and the geometry probe reads that as the box doing its
 *      job. A cut confined to the footer band (`chromeOnly`) does not count; that
 *      footer ellipsizes at every scale.
 *   4. IDEMPOTENT. Every call first undoes its own previous step and LEVEL's, so the
 *      live runtime can re-run it on each sweep and an edit that makes a slide
 *      shorter gets its full scale back.
 *   5. A SPECIMEN IS LEFT ALONE. `<!-- stress-slide -->` means "this overflows on
 *      purpose", and the splitter already honors it (lib/core/auto-split.js).
 *   6. `fit: report` TURNS IT OFF. A section carrying `fit-report` (the deck's
 *      `fit: report`, or a slide's own `_class: fit-report`) is never stepped and never
 *      levelled — the engine only flags. See lib/core/resolve-guards.js.
 *   7. ONE SIZE PER ASK (LEVEL, `levelScaleSteps`). Every slide that asked for the
 *      same scale renders at the SAME rung: the highest one all of them fit. A deck
 *      whose slides land on different sizes pulses as you click through — the
 *      running header, the eyebrow and the page dots change size with the body —
 *      and a viewer reads that as broken (2026-09-26 amendment of the design note).
 *      The shared rung may be an in-between one (1.15x in a 1.3x deck): that supersedes
 *      the 2026-09-25 "two sizes at most" ruling (fit-policy.md fork 2), whose only job
 *      was to cap how many sizes a deck shows — at one size there is nothing to cap, and
 *      landing on 1x would throw away legibility the deck can hold (owner, 2026-09-26).
 *      A deck-wide `class: scale-xl` or `venue:` is one ask; a spot
 *      `<!-- _class: scale-xl -->` on two slides is another, levelled on its own.
 *      The slides that set the rung are the BINDING slides, and the export names
 *      them so the author knows what to trim to get the larger size back. A host that
 *      shows one slide per document (the Studio's preview and Present) measures the
 *      whole deck in a hidden frame and passes the shared rung as a cap on the document
 *      element (`data-lattice-scale-cap`, docs/src/lib/scale-cap.ts).
 *
 * STEP measures one slide; LEVEL reads what STEP recorded across the deck and writes
 * the shared rung. Measuring stays per slide, which the live runtime needs (it sweeps
 * the slides in view), and LEVEL never measures, so it is cheap to run over every
 * section after each sweep.
 *
 * The rung a slide renders at is recorded as `data-lattice-scale-step="<requested>><landed>"`
 * (e.g. `1.3>1.15`), which is what the emulator's SCALE line counts; the rung the slide
 * fits by itself, when that is below its request, is `data-lattice-scale-fit`. The value
 * written is an inline `--fs-scale`, because the twelve `--fs-*` tokens are declared on
 * `section` and re-resolve against the section's own multiplier (typography.md §7
 * "Why the calc lives on `:root, section`").
 *
 * INJECTED, NOT REQUIRED, IN TWO OF ITS THREE CALLERS. The emulator's `page.evaluate`
 * pass and the watcher embedded in every exported `.html` receive these functions'
 * SOURCE (`SCALE_FIT_SRC`, `SCALE_LEVEL_SRC`), so everything they need travels inside
 * them: the ladder is a literal here rather than a module constant, and the probes
 * arrive as arguments. `test/unit/core/scale-fit.test.js` pins the literal to
 * `SCALE_STEPS` and to the modifier CSS, so the three cannot drift.
 */

/** The rungs, top to bottom. Pinned against base.modifiers.css by the unit test. */
const SCALE_STEPS = Object.freeze([1.5, 1.3, 1.15, 1]);
/** The designed type scale — the floor STEP and LEVEL never go below. */
const SCALE_FLOOR = 1;
const SCALE_STEP_ATTR = 'data-lattice-scale-step';
const SCALE_FIT_ATTR = 'data-lattice-scale-fit';
/** On the document element: the shared rung per ask, from a host that measured the deck. */
const SCALE_CAP_ATTR = 'data-lattice-scale-cap';

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
  const FIT = 'data-lattice-scale-fit';
  // Rule 4 — undo our own previous step (and LEVEL's), restoring any inline value
  // the author had.
  if (s.hasAttribute(ATTR)) {
    const prior = s.getAttribute(PRIOR);
    if (prior) s.style.setProperty('--fs-scale', prior);
    else s.style.removeProperty('--fs-scale');
    s.removeAttribute(ATTR);
    s.removeAttribute(PRIOR);
  }
  if (s.hasAttribute(FIT)) s.removeAttribute(FIT);
  const requested = parseFloat(getComputedStyle(s).getPropertyValue('--fs-scale'));
  // Rule 1 — the designed size is never touched.
  if (!(requested > 1)) return null;
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
  for (const step of STEPS) {
    if (step >= requested) continue;
    s.style.setProperty('--fs-scale', String(step));
    if (!clips()) {
      s.setAttribute(ATTR, `${requested}>${step}`);
      s.setAttribute(FIT, String(step));
      if (inline) s.setAttribute(PRIOR, inline);
      return { from: requested, to: step };
    }
  }
  // Rule 2 — no rung fits: put the requested scale back, and record that no size saves
  // this slide, so LEVEL leaves it out of the shared rung and the report can name it.
  if (inline) s.style.setProperty('--fs-scale', inline);
  else s.style.removeProperty('--fs-scale');
  s.setAttribute(FIT, 'none');
  return { from: requested, to: null };
}

/**
 * LEVEL (rule 7): put every slide that asked for the same scale on one rung — the
 * highest one all of them fit. Reads only what `fitScaleStep` recorded plus one
 * computed value per section; never measures.
 *
 * A section with no record either fits at its request or has not been measured
 * yet (the live runtime sweeps the slides in view), and counts as fitting at its
 * request. A slide that fits at no rung (rule 2) is left out of the minimum, since
 * no size fixes it, and renders at the shared rung like its neighbors.
 *
 * @param {Element[]} sections  every slide section in the deck
 * @returns {{changed: Element[], groups: Array<{from: number, to: number, size: number,
 *   binding: Array<{index: number, fit: number}>, unfit: number[]}>}}  `changed` are the
 *   sections whose rendered rung moved; `binding` are the slides (0-based position in
 *   `sections`) whose own fit set a rung below the request; `unfit` are the slides no
 *   rung fits, which clip at the shared rung.
 */
function levelScaleSteps(sections) {
  const ATTR = 'data-lattice-scale-step';
  const PRIOR = 'data-lattice-scale-prior';
  const FIT = 'data-lattice-scale-fit';
  const byAsk = new Map();
  sections.forEach((s, index) => {
    const stepped = s.getAttribute(ATTR);
    const requested = stepped
      ? parseFloat(stepped.split('>')[0])
      : parseFloat(getComputedStyle(s).getPropertyValue('--fs-scale'));
    if (!(requested > 1)) return;
    // Rule 6 — `fit: report`: never moved.
    if (s.classList?.contains('fit-report')) return;
    const notes = s.querySelector('aside.lattice-notes');
    if (notes && /\bstress-slide\b/.test(notes.textContent || '')) return;
    const fitAttr = s.getAttribute(FIT);
    // 'none' (rule 2): no size fits it, so it does not set the rung.
    const unfit = fitAttr === 'none';
    const fit = fitAttr && !unfit ? parseFloat(fitAttr) : requested;
    const current = stepped ? parseFloat(stepped.split('>')[1]) : requested;
    if (!byAsk.has(requested)) byAsk.set(requested, []);
    byAsk.get(requested).push({ s, index, fit, current, unfit });
  });
  // A HOST CAP. A host that shows ONE slide per document (the Studio's preview and Present)
  // cannot level a deck it never holds, so it measures the whole deck elsewhere and passes
  // the shared rung per ask on the document element — `data-lattice-scale-cap="1.3>1.15"`.
  // LEVEL never lands above it. Absent everywhere else, so the export and the player are
  // unchanged.
  const root = sections[0]?.ownerDocument?.documentElement;
  const capText = root?.getAttribute ? root.getAttribute('data-lattice-scale-cap') : null;
  const cap = new Map();
  if (capText) {
    for (const pair of capText.trim().split(/\s+/)) {
      const [ask, rung] = pair.split('>').map(parseFloat);
      if (ask > 1 && rung >= 1) cap.set(ask, rung);
    }
  }
  const changed = [];
  const groups = [];
  for (const [requested, members] of byAsk) {
    const own = Math.min(...members.map((m) => m.fit));
    const to = cap.has(requested) ? Math.min(own, cap.get(requested)) : own;
    for (const m of members) {
      if (m.current === to) continue;
      const s = m.s;
      if (to >= requested) {
        // Back to the request: undo the step, restoring an inline value the author had.
        const prior = s.getAttribute(PRIOR);
        if (prior) s.style.setProperty('--fs-scale', prior);
        else s.style.removeProperty('--fs-scale');
        s.removeAttribute(ATTR);
        s.removeAttribute(PRIOR);
      } else {
        if (!s.hasAttribute(ATTR)) {
          const inline = s.style.getPropertyValue('--fs-scale');
          if (inline) s.setAttribute(PRIOR, inline);
        }
        s.style.setProperty('--fs-scale', String(to));
        s.setAttribute(ATTR, `${requested}>${to}`);
      }
      changed.push(s);
    }
    groups.push({
      from: requested,
      to,
      size: members.length,
      binding: members.filter((m) => m.fit < requested).map((m) => ({ index: m.index, fit: m.fit })),
      unfit: members.filter((m) => m.unfit).map((m) => m.index),
    });
  }
  return { changed, groups };
}

const pageList = (pages) => `page${pages.length > 1 ? 's' : ''} ${pages.join(', ')}`;

/**
 * The export's `↓ SCALE` lines for LEVEL's groups — Node-side, so it is tested here
 * rather than inside a page.evaluate. Silent when every ask renders at its request.
 * Not a warning about the render: every slide named FITS. It is printed because the
 * author asked for a size and the deck did not get it, and a silent shrink is the
 * one thing the Fit Spine rules out (2026-06-22-the-fit-spine.md §3). It names the
 * slides to trim for each rung above the one the deck landed on, which is the only
 * way to get the size back.
 *
 * @param {Array<{from: number, to: number, size: number, binding: Array<{index: number, fit: number}>}>} groups
 * @returns {string[]}
 */
function scaleLevelReport(groups) {
  const lines = [];
  for (const g of groups) {
    if (!(g.to < g.from)) continue;
    const who = g.size > 1
      ? `all ${g.size} slides that asked for it render at ${g.to}x, so they stay one size`
      : `the one slide that asked for it renders at ${g.to}x`;
    lines.push(`  \u2193 SCALE — ${g.from}x was asked for and ${who}.`);
    const rungs = SCALE_STEPS.filter((r) => r > g.to && r <= g.from).sort((a, b) => a - b);
    const steps = rungs.map((r) => {
      const pages = g.binding.filter((b) => b.fit < r).map((b) => b.index + 1).sort((a, b) => a - b);
      return `for ${r}x, trim ${pageList(pages)}`;
    });
    const unfit = (g.unfit || []).map((i) => i + 1).sort((a, b) => a - b);
    const clip = unfit.length
      ? `${pageList(unfit).replace(/^p/, 'P')} clip${unfit.length > 1 ? '' : 's'} at every size (the OVERFLOW line reports ${unfit.length > 1 ? 'them' : 'it'}); stepping the scale clips nothing else.`
      : 'Stepping the scale clips nothing.';
    lines.push(`    ${clip} To get the size back: ${steps.join('; ')}. \`lint:deck\` names what is over budget on each.`);
  }
  return lines;
}

module.exports = {
  SCALE_STEPS,
  SCALE_FLOOR,
  SCALE_STEP_ATTR,
  SCALE_FIT_ATTR,
  SCALE_CAP_ATTR,
  fitScaleStep,
  levelScaleSteps,
  scaleLevelReport,
  // Function source for verbatim injection into the emulator's page.evaluate and the
  // watcher embedded in the exported .html (HARD RULE #1 — one kernel, three callers).
  SCALE_FIT_SRC: fitScaleStep.toString(),
  SCALE_LEVEL_SRC: levelScaleSteps.toString(),
};
