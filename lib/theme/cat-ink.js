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
 * MEASURED OVER THE SHIPPED PALETTES — and that scope is load-bearing now that this
 * module has a second caller. There, the guard takes solve-induced separation loss
 * from 272 pairs to 18 (of 4224); every one of the 18 keeps 71-97% of its marks'
 * separation, the tightest lands at 0.0119 — wider than the 0.0105 that `indaco`'s
 * own CURATED dark cycle ships — and `checkCatContrast`'s collapse arm holds the
 * floor beneath them.
 *
 * NEITHER of those sentences carries to the DERIVED path, and pretending otherwise
 * would be the more comfortable lie. `checkCatContrast` scans `themes/`, the one
 * population a Studio theme never joins, so nothing gates collapse there. And a
 * `brand-mono` ramp is the hard case by construction — one hue, separation carried
 * entirely by lightness, which is the only lever this guard has. Sampled over 2,000
 * derived themes, 4 keep an ink pair below the collapse floor (worst ΔE 0.0032,
 * `brand-mono`, light) that a hand-authored palette would be failed for. That is a
 * known, measured limit of a lightness-only guard on a single-hue ramp, not
 * something this module quietly handles.
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
        `Re-running the generator cannot fix this: widen the gap between the two ` +
        `canvas surfaces, or re-hue the mark.`;
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
    let prevHex = null;
    let prevN = null;
    let prevI = null;
    let prevU = -Infinity;
    for (const slot of slots) {
      // MONOTONE IN u. Comparing each slot only against its immediate predecessor
      // is not enough: a slot left at its solved position can clear the pushed slot
      // before it while still coinciding with the one two back, so the walk
      // alternates push / don't-push and half the arm stays collapsed (measured on
      // a11y dark: six slots left on one value). Never stepping backwards makes the
      // placed sequence strictly increasing, which gives all-pairs separation from
      // the adjacent test alone.
      let u = Math.max(slot.u, prevU);
      const need = prevN === null ? 0 : separationTarget(marks[slot.i], marks[prevI]);
      if (prevHex !== null) {
        // Walk +u (always further from the canvas, so always still legible) until
        // this slot reads as its own color. A pair that differs in hue satisfies
        // the test at its solved position and never moves.
        while (u <= uMax && oklabDistance(withLightness(marks[slot.i], dir * u), prevHex) < need) {
          u += Math.max(need, 1e-3) / 8;
        }
        if (u > uMax + 1e-9) {
          const message =
            `${label}: the ${arm} ink arm cannot hold ${marks.length} distinguishable slots — ` +
            `after clearing ${AA}:1 there is not ${need.toFixed(4)} of perceptual room left ` +
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
      prevN = slot.n;
      prevI = slot.i;
      prevHex = inks[slot.i];
    }
  }
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
      `--bg ${bg} and --bg-alt ${bgAlt} are close enough in lightness that no shade of ` +
      `--cat-${i + 1}-mark (${mark}) clears ${AA}:1 against both. Widen the gap between the two ` +
      `surfaces — this is a palette fact the generator cannot solve around.`;
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
};
