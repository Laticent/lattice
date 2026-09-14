/**
 * jank-drift — does an anchor MOVE, as distinct from merely getting BIGGER?
 *
 * Split out of tools/check-jank.js so the discrimination can be tested without a browser.
 * The rig's geometry is otherwise only reachable through a real Chromium render, which is
 * why this particular defect survived: nothing could ask the question at unit speed.
 *
 * THE DEFECT THIS EXISTS TO PREVENT. Drift used to be `Math.max` over an axis's two edge
 * spreads. A box that TRANSLATES moves both edges together, so the max is the translation
 * — correct. But a box PINNED on one edge that merely grows moves only the other edge, and
 * the max reported that growth as movement.
 *
 * Measured on the engine's own page number (#2168). Dumped straight out of `check-jank`
 * over a 12-page deck — these are the columns this function actually receives:
 *
 *   L [1241 x9, 1232 x3]      R [1250 x12]
 *
 * The far edge is constant on all twelve pages; at page 10 the numeral gains a digit and
 * the near edge steps back 9px. The old measure called that `DRIFT 9.0px horizontal` and
 * exited 1 — a false verdict against the most widely shipped running mark in the engine,
 * which had never been measured at all before, because rendering it needs `paginate: true`
 * front matter the sweep deck could not carry.
 *
 * The figure is 9, not 8.99: `check-jank` rounds every coordinate to one decimal before the
 * measure sees it. 8.99 is the raw DOM inset delta read with a separate browser probe, and
 * an earlier draft of this docblock quoted it here as if this instrument had produced it.
 *
 * THE DISCRIMINATOR IS `min` OVER THREE REFERENCES, and it needs all three because a mark
 * may be pinned at either edge or centered:
 *   · a true translation moves the near edge, the far edge AND the midpoint together, so
 *     the minimum IS the translation;
 *   · growth pinned at an edge leaves that edge's spread at zero;
 *   · symmetric growth about a fixed center leaves the MIDPOINT's spread at zero.
 * A mark that both moves and grows still reports the movement: near +5 and far +15 is a
 * 5px shift plus 10px of growth, and the minimum returns the 5.
 *
 * It does NOT weaken the sideways-walk case the two-edge measure was written for: a mark
 * that ends 604px off the slide moves all three references 604px, so the minimum is 604.
 */

/** The spread (max − min) of a list of numbers. Empty or single-valued ⇒ 0. */
function spread(values) {
  if (!Array.isArray(values) || values.length < 2) return 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    // A non-finite coordinate is a measurement that did not happen. Averaging or ignoring
    // it would invent a spread; refusing is the tool's standing contract (exit 2 upstream).
    if (!Number.isFinite(v)) throw new TypeError(`jank-drift: non-finite coordinate ${String(v)}`);
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return hi - lo;
}

/**
 * Translation along one axis, given each step's near and far edge (section-relative).
 * `near`/`far` are same-length arrays: top/bottom for the block axis, left/right for the
 * inline axis. Returns 0 for a box that only changed size.
 */
function axisDrift(near, far) {
  if (!Array.isArray(near) || !Array.isArray(far) || near.length !== far.length) {
    throw new TypeError('jank-drift: near and far must be arrays of the same length');
  }
  if (near.length < 2) return 0;
  const mid = near.map((n, i) => (n + far[i]) / 2);
  return Math.min(spread(near), spread(far), spread(mid));
}

module.exports = { spread, axisDrift };
