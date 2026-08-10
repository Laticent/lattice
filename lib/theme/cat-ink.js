/**
 * The categorical ON-CANVAS INK solve — pure, fs-free, ONE source for two
 * callers that used to be one.
 *
 * `--cat-N-ink` is the categorical hue rendered as TEXT on `--bg` / `--bg-alt`:
 * the mark's hue and chroma held exactly, lightness moved by binary search until
 * it clears AA on BOTH slide surfaces. Why it is solved rather than mixed in CSS
 * — and why the anti-collapse guard has the shape it does — is the long comment
 * at the head of `tools/derive-cat-ink.js`; that reasoning is not repeated here.
 *
 * WHY THIS MODULE EXISTS. The recipe had exactly one caller (the committed
 * per-theme generator, which runs under `npm run build` over `themes/*.css`) and
 * therefore lived inside it. #1457 gave it a second: `lib/theme/derive.js`, the
 * Studio's browser-bundled generator, which emits a whole theme from ten
 * essentials and shipped WITHOUT this tier — so every Studio theme fell back to
 * `var(--cat-N-ink, var(--cat-N-mark))` and painted labels in a mark curated to
 * the 3:1 graphical floor. Copying 150 lines of two-pole OKLCH search into the
 * second caller is what HARD RULE #1 exists to stop, so the recipe moved here
 * and both callers import it. `tools/derive-cat-ink.js` re-exports `solveInk`
 * so its own tests keep their import path.
 *
 * FAILURE POLICY IS THE CALLER'S, and that is the one real difference between
 * them (the same seam `lib/core/mermaid-theme-map.js` documents for its token
 * reader):
 *
 *   strict: true   the committed generator. An unsolvable palette is a fact
 *                  about tracked source that a human must fix, so it THROWS
 *                  and names the theme, the slot and the two surfaces.
 *   strict: false  the Studio. `deriveTheme` runs in a browser on a color a
 *                  user just picked and has never thrown for a valid essential
 *                  set; a modal stack trace mid-edit is a worse answer than a
 *                  best-effort ink the audit then reports.
 *
 * WHAT ACTUALLY SURFACES A DEGRADATION, since "it degrades and reports" is only
 * true if something reads the report. `deriveTheme` returns a flat token map and
 * deliberately does not thread a side-channel through it, so it drops `degraded[]`
 * — the user-facing signal is `lib/theme/contrast.js`, whose `contractPairs()`
 * carries a `categorical-ink` row per slot per surface (#1457). A degraded ink is a
 * contrast failure, and that is what the Studio's meter shows. `degraded[]` carries
 * the REASON and is there for a caller that wants to explain rather than measure;
 * nothing in-tree reads it yet, and that is stated rather than implied.
 *
 * No `fs`, no repo imports beyond `./color.js` — it bundles for the browser
 * exactly like the rest of `lib/theme/`.
 */

const { hexToOklch, withLightness, contrastRatio, oklabDistance, AA } = require('./color.js');

/** Solve to 4.65:1 so a later rounding/regeneration cannot land under the floor. */
const MARGIN = 0.15;

/**
 * The separation an ink pair is held to, in OKLab ΔE — but only ever as much as
 * the MARK pair already had (see `separationTarget`). This is a ceiling on what
 * the guard will try to restore, not a standard imposed on the palette.
 *
 * WHY IT IS RELATIVE TO THE MARKS, and not an absolute floor. Measured across the
 * shipped palettes, the minimum ink separation runs continuously from 0.0013
 * (`concrete` dark) through 0.0065 (`cuoio` dark) and 0.0105 (`indaco`/`carta`
 * dark) up to 0.055 (`carbone`). There is no gap to put a floor in: any threshold
 * that catches concrete's near-identical dark arm also rewrites cuoio's and
 * indaco's CURATED cycles — and those values are the designer's, inherited
 * unchanged from marks that are themselves that close. A generator that "improves"
 * a hand-curated spacing is committing the same off-brand sin as the color-mix
 * this tier replaced.
 *
 * So the guard's question is not "are these far enough apart?" but "did the SOLVE
 * lose separation the palette had?". concrete dark inherits its 0.0013 from its own
 * marks and is left exactly alone; the a11y grayscale ramp, whose distinguishable
 * marks all solve onto ONE lightness, is restored to the marks' own spacing.
 */
const MIN_DIST = 0.035;

/**
 * How far apart this pair of inks must sit: the marks' own separation, capped at
 * MIN_DIST. Never asks for more distinction than the palette itself carries.
 */
function separationTarget(markA, markB) {
  return Math.min(MIN_DIST, oklabDistance(markA, markB));
}

/**
 * The mark, moved in lightness only, until it clears `AA + MARGIN` on both
 * surfaces. Returns the mark unchanged when it already clears — an ink that does
 * not need repair should not be repainted. `null` when NEITHER lightness pole
 * clears, which is a fact about the canvas pair, not about the hue.
 */
function solveInk(mark, bg, bgAlt) {
  const clears = (hex) => Math.min(contrastRatio(hex, bg), contrastRatio(hex, bgAlt)) >= AA + MARGIN;
  if (clears(mark)) return mark;
  const { L } = hexToOklch(mark);
  // TRY BOTH POLES. Guessing the direction from the surfaces' average lightness is
  // wrong whenever the mark sits between --bg and --bg-alt, or above a mid-tone
  // canvas: `concrete`'s light surfaces average L=0.827, so any mark lighter than
  // that was sent toward WHITE and returned a 1.47:1 value the generator then wrote
  // into tracked source (the black pole would have given 10.56:1). Solve toward each
  // pole, keep whichever clears with the smaller move.
  const solveToward = (target) => {
    if (!clears(withLightness(mark, target))) return null;
    let near = L;      // known NOT to clear
    let far = target;  // known to clear
    for (let i = 0; i < 40 && Math.abs(far - near) > 1e-4; i += 1) {
      const mid = (near + far) / 2;
      if (clears(withLightness(mark, mid))) far = mid;
      else near = mid;
    }
    return { L: far, hex: withLightness(mark, far) };
  };
  const candidates = [solveToward(0), solveToward(1)].filter(Boolean);
  if (!candidates.length) return null; // neither pole works — the caller must say so
  candidates.sort((a, b) => Math.abs(a.L - L) - Math.abs(b.L - L));
  return candidates[0].hex;
}

/**
 * The most legible shade of `mark` when NOTHING clears AA on both surfaces —
 * whichever lightness pole maximizes the WORSE of the two ratios. Only reached
 * on the non-strict path, where returning something readable-as-possible beats
 * returning the raw mark (which is what a bare `var(--cat-N-ink)` miss would
 * have painted anyway) and beats throwing.
 */
function bestEffortInk(mark, bg, bgAlt) {
  const worst = (hex) => Math.min(contrastRatio(hex, bg), contrastRatio(hex, bgAlt));
  return [mark, withLightness(mark, 0), withLightness(mark, 1)]
    .sort((a, b) => worst(b) - worst(a))[0];
}

/**
 * The lightness interval, for one mark, over which the ink clears AA on BOTH
 * surfaces — as `{ dir, bound }`.
 *
 * Contrast against a fixed surface is monotone in L (falling against a light
 * surface, rising against a dark one), so the feasible set for a hue is always
 * ONE-SIDED: either `[0, bound]` (safety lies toward black, `dir: -1`) or
 * `[bound, 1]` (toward white, `dir: +1`). Never both — clearing 4.5:1 against a
 * light AND a dark surface simultaneously has no solution for any real canvas
 * pair. `null` when neither pole clears, which is the same condition that makes
 * `solveInk` return null.
 */
function feasibleRange(mark, bg, bgAlt) {
  const clears = (L) => {
    const hex = withLightness(mark, L);
    return Math.min(contrastRatio(hex, bg), contrastRatio(hex, bgAlt)) >= AA + MARGIN;
  };
  const dir = clears(0) ? -1 : clears(1) ? 1 : null;
  if (dir === null) return null;
  // Bisect for the far edge of the feasible interval.
  let inside = dir === -1 ? 0 : 1;      // known to clear
  let outside = dir === -1 ? 1 : 0;     // known not to
  for (let i = 0; i < 40 && Math.abs(outside - inside) > 1e-4; i += 1) {
    const mid = (inside + outside) / 2;
    if (clears(mid)) inside = mid; else outside = mid;
  }
  return { dir, bound: inside, clears };
}

/**
 * True when the SOLVE cost this arm separation its marks had — i.e. some pair of
 * inks now reads as one category where the corresponding marks read as two.
 * Perceptual (OKLab), not hex identity: `new Set(hexes).size === 12` calls
 * concrete's dark arm, twelve values spanning two units out of 255, a distinct
 * cycle — true only to a string comparator.
 *
 * `inks` and `marks` are parallel arrays; slot N is index N-1.
 */
function armCollapsed(inks, marks) {
  for (let i = 0; i < inks.length; i += 1) {
    for (let j = i + 1; j < inks.length; j += 1) {
      const a = inks[i], b = inks[j];
      if (!a || !b) continue;
      if (oklabDistance(a, b) < separationTarget(marks[i], marks[j]) - 1e-9) return true;
    }
  }
  return false;
}

/**
 * Push apart only the slots of `inks` that are not already separated. Mutates
 * `inks` in place.
 *
 * Works in "safety" coordinates: `u = dir * L`, so larger u is always further
 * from the canvas and therefore always still legal. Slots are visited in
 * increasing u — i.e. from the least-safe end — and each is either left exactly
 * where `solveInk` put it (when it already sits its target gap beyond its
 * predecessor) or pushed the minimum distance to reach that gap. Pushing along
 * +u can never break AA, because the feasible interval is one-sided and
 * unbounded in that direction up to the pole; the only way to fail is to run out
 * of axis.
 *
 * Slots whose feasible direction differs (possible on a mixed palette where some
 * marks are lighter and some darker than the canvas) are separated independently
 * within their own direction group — two inks on opposite sides of the canvas are
 * already far apart in lightness and cannot be the pair that collided.
 *
 * WHAT THIS DOES NOT FIX, stated rather than hidden. The only lever here is
 * lightness, so two marks of DIFFERENT hue that the solve pushed to the same
 * lightness cannot be pulled fully back apart: moving either one further only
 * trades their separation for a bigger move off the curated value.
 *
 * MEASURED, on the shipped palettes and re-derived for this walk rather than
 * carried over: the unguarded solve loses separation the marks had on 83 of 1,980
 * pairs; after the guard, 0 of 1,980. The previous ADJACENT-ONLY walk left 18 of
 * those standing and its comment presented them as an accepted floor ("different
 * hues, not repeats"). They were not a floor — they were the same defect this
 * walk fixes, one order of magnitude milder than the derived case that exposed it.
 * Regenerating moved 24 declarations across 7 palettes.
 *
 * The DERIVED path is the harder population and is measured separately: over 2,000
 * themes from the sampler published in
 * engineering/decisions/2026-08-10-no-safe-default-token-contract.md, the
 * adjacent-only walk left 21 themes with an ink pair below `checkCatContrast`'s
 * 0.010 collapse floor — worst ΔE 0.0000, i.e. byte-identical label colors, all on
 * `brand-mono`, where a single-hue cycle carries all its separation in lightness.
 * With this walk: 0 of 2,000. (An earlier note here said "4 … worst 0.0032", which
 * was measured on a distribution that was never written down and does not
 * reproduce. A figure nobody can re-run is not evidence — the sampler is published
 * now, and both of these numbers come out of it.)
 */
function separateArm({ inks, marks, bg, bgAlt, label, arm, strict, degraded }) {
  const groups = new Map(); // dir → [{ n, u, uBound }]
  for (let i = 0; i < marks.length; i += 1) {
    const n = i + 1;
    const range = feasibleRange(marks[i], bg, bgAlt);
    if (!range) {
      const message =
        `${label}: --cat-${n}-mark has no legible lightness on the ${arm} canvas — ` +
        `no shade of its hue clears ${AA}:1 against both --bg and --bg-alt. ` +
        `Re-running the generator cannot fix this. ${surfaceDiagnosis(bg, bgAlt)}`;
      if (strict) throw new Error(message);
      // Non-strict: this slot has no legal interval to be pushed along, so leave
      // it exactly where the (already best-effort) solve put it and separate the
      // rest. Recorded, never silent.
      degraded.push(message);
      continue;
    }
    const { dir, bound } = range;
    if (!groups.has(dir)) groups.set(dir, []);
    groups.get(dir).push({ n, i, u: dir * hexToOklch(inks[i]).L, uBound: dir * bound });
  }
  for (const [dir, slots] of groups) {
    slots.sort((a, b) => a.u - b.u);
    // uMax is the far pole in safety coordinates: 0 for dir -1, 1 for dir +1.
    const uMax = dir === -1 ? 0 : 1;
    const placed = []; // { i, hex } — every slot already positioned in this group
    let prevU = -Infinity;
    for (const slot of slots) {
      // ALL PAIRS, NOT JUST THE PREDECESSOR. The first cut compared each slot only
      // against the one before it, on the argument that a monotone walk in u "gives
      // all-pairs separation from the adjacent test alone". THAT IS FALSE, and it
      // shipped: `need` varies per pair (it is capped at the MARKS' own separation),
      // and ΔE is not monotone in lightness once two slots differ in chroma, so a
      // slot pushed to clear its predecessor can land on one two positions back —
      // which has not been visited yet, so nothing ever checks it. Measured on a
      // derived `brand-mono` palette: --cat-7-ink and --cat-9-ink came out
      // BYTE-IDENTICAL (#5a5b00) from marks 0.0274 apart, and 8/12 landed 0.0004
      // apart from marks 0.0530 apart. Both slots had needed no repair at all.
      let u = Math.max(slot.u, prevU);
      const clearsPlaced = (cand) =>
        placed.every((p) => oklabDistance(cand, p.hex) >= separationTarget(marks[slot.i], marks[p.i]));
      if (placed.length) {
        // Step by the LARGEST outstanding target so the walk terminates promptly;
        // +u is always further from the canvas, so it is always still legible.
        const step = Math.max(...placed.map((p) => separationTarget(marks[slot.i], marks[p.i])), 1e-3) / 8;
        while (u <= uMax && !clearsPlaced(withLightness(marks[slot.i], dir * u))) u += step;
        if (u > uMax + 1e-9) {
          const message =
            `${label}: the ${arm} ink arm cannot hold ${marks.length} distinguishable slots — ` +
            `after clearing ${AA}:1 there is not enough perceptual room left ` +
            `between every pair (ran out at --cat-${slot.n}-ink). This is a property ` +
            `of the palette, not of the generator: re-running it will reproduce it. ` +
            `Widen the categorical marks' lightness range, or raise the contrast ` +
            `between --bg and --bg-alt.`;
          if (strict) throw new Error(message);
          // Non-strict: park this slot AT the pole. It is the furthest-separated
          // value the axis has left, it is still AA-legal (the pole is inside the
          // feasible interval by construction), and the pair it collides with is
          // reported rather than pretended away.
          degraded.push(message);
          u = uMax;
        }
      }
      if (u !== slot.u) inks[slot.i] = withLightness(marks[slot.i], dir * u);
      prevU = u;
      placed.push({ i: slot.i, hex: inks[slot.i] });
    }
  }
}

/**
 * Why no shade of any hue clears AA on BOTH surfaces — and the advice differs by
 * cause, so it has to be diagnosed rather than assumed.
 *
 * The original message said the surfaces were "close enough in lightness" and told
 * the author to widen the gap between them. That is right for ONE of the two causes
 * and exactly backwards for the other — and the other is the dominant one: on random
 * canvas pairs it is a STRADDLE (one surface wants a dark ink, the other a light
 * one) that fails, not a pair that is too close. Telling an author to widen a gap
 * that is already too wide is worse than saying nothing.
 */
function surfaceDiagnosis(bg, bgAlt) {
  return contrastRatio(bg, bgAlt) >= 3
    ? 'The two surfaces STRADDLE the legible range: one is light enough to need a dark ink and the other ' +
      'dark enough to need a light one, so no single value can serve both. Bring --bg and --bg-alt onto ' +
      'the same side of the canvas — this is a palette fact the generator cannot solve around.'
    : 'The two surfaces are close enough in lightness that no shade of any hue clears the floor against ' +
      'both. Widen the gap between --bg and --bg-alt — this is a palette fact the generator cannot ' +
      'solve around.';
}

/**
 * Solve one arm's worth of on-canvas inks: `marks` (parallel to the returned
 * `inks`) against the two surfaces of ONE canvas mode.
 *
 * @param {object}   o
 * @param {string[]} o.marks    the arm's `--cat-N-mark` hexes, slot order
 * @param {string}   o.bg       that mode's `--bg`
 * @param {string}   o.bgAlt    that mode's `--bg-alt`
 * @param {boolean} [o.strict]  throw on an unsolvable palette (see the header)
 * @param {string}  [o.label]   what to name in a message — a theme name
 * @param {string}  [o.arm]     'light' | 'dark', for messages
 * @returns {{ inks: string[], collapsed: boolean, degraded: string[] }}
 */
function solveInkArm({ marks, bg, bgAlt, strict = false, label = 'theme', arm = 'light' }) {
  const degraded = [];
  const inks = marks.map((mark, i) => {
    const ink = solveInk(mark, bg, bgAlt);
    if (ink) return ink;
    // solveInk returns null when NEITHER pole clears — the canvas pair is too
    // close together for any shade of any hue to reach AA against both (e.g.
    // --bg and --bg-alt both mid-gray). Say that here, naming the theme, the
    // slot and the two surfaces. Letting the null travel produces `not a hex
    // color: null` from deep inside lib/theme/color.js, which names nothing.
    const message =
      `${label}: no legible --cat-${i + 1}-ink exists on the ${arm} canvas. ` +
      `No shade of --cat-${i + 1}-mark (${mark}) clears ${AA}:1 against both --bg ${bg} and ` +
      `--bg-alt ${bgAlt}. ${surfaceDiagnosis(bg, bgAlt)}`;
    if (strict) throw new Error(message);
    degraded.push(message);
    return bestEffortInk(mark, bg, bgAlt);
  });

  // ANTI-COLLAPSE, BY SEPARATING ONLY WHAT COLLIDES. Solving each slot for the
  // least move that clears AA is right while the slots stay tellable apart. On a
  // ramp that differs only in lightness — the a11y grayscale cycle, or any
  // `brand-mono` derivation — every slot fails in the same direction and
  // converges on the same solved lightness: 12 slots, 1 color.
  const collapsed = armCollapsed(inks, marks);
  if (collapsed) separateArm({ inks, marks, bg, bgAlt, label, arm, strict, degraded });
  return { inks, collapsed, degraded };
}

module.exports = {
  AA,
  MARGIN,
  MIN_DIST,
  separationTarget,
  solveInk,
  bestEffortInk,
  feasibleRange,
  armCollapsed,
  separateArm,
  solveInkArm,
  surfaceDiagnosis,
};
