/**
 * Place the twelve categorical slots so a reader can tell them apart — by moving
 * LIGHTNESS only, and never the curated hue.
 *
 * WHY LIGHTNESS IS THE ONLY LEVER. The twelve hues per palette are the invested
 * brand colors; `2026-07-15-categorical-token-contract.md` §"Shipped" re-placed
 * their saturation and lightness and kept the hues untouched, and this keeps that
 * bargain. Lightness is also the one channel every color-vision deficiency
 * preserves, so a separation bought in L survives simulation where one bought in
 * hue does not.
 *
 * WHY THE RAMPS COLLAPSED IN THE FIRST PLACE. The 2026-07-16 recipe solved each
 * slot INDEPENDENTLY against a contrast target (light mark down until edge-vs-canvas
 * clears 3.2:1, dark fill down until label-vs-fill clears 7:1). Twelve independent
 * solves against one target converge on one lightness: `carbone`'s twelve light
 * fills land inside 0.002 of each other, `indaco`'s twelve dark fills inside 0.003.
 * At equal L the whole distance between two slots is their hue distance, so any two
 * neighbors on the wheel collapse. Solving the slots TOGETHER is the fix.
 *
 * THE TWO TIERS ARE NOT THE TWO TOKENS. `--cat-N-fill` and `--cat-N-mark` swap
 * roles by canvas — the mark carries the chroma on a light ground, the fill carries
 * it on a dark one (measured in `2026-08-31-categorical-adjacency-tier-swap.md`).
 * So callers pass a tier's resolved hexes and its floor; this file never names a
 * token, and `tierOf` derives which is which by chroma.
 *
 * THE TWO TIERS ALSO GET DIFFERENT PROMISES, and that asymmetry is the contract:
 *   - the WASH tier is held ALL-PAIRS, because the Mermaid pie paints it with no
 *     per-slot stroke, so the wash is the entire discrimination channel and a
 *     reader compares wedge 5 against wedge 10 as readily as against wedge 6;
 *   - the SATURATED tier is held ADJACENT only, because all-pairs is not reachable
 *     there: holding hue and chroma fixed, `brina` light, `burgundy` dark,
 *     `carbone` light and both `cuoio` faces cannot pairwise clear the 0.1050 floor
 *     inside their own contrast bands. Demanding it would mean re-hueing brand
 *     colors, which is a different decision than this one.
 *
 * THE DISJUNCTION IS MADE CONVEX BY FIXING SIGNS ONCE. "|L_i - L_j| >= g" is not
 * convex, so the sign of each pair is read off the SHIPPED ramp's own ordering and
 * held for the whole solve. Re-deriving signs per round lets two slots at nearly
 * equal L flip between rounds and oscillate forever, which is exactly what the
 * first cut did.
 *
 * BANDS COME FROM THE CALLER, per slot, because they are contrast facts about a
 * palette (a mark must clear its canvas and its tag ink; a fill must clear its
 * label ink) and this file holds no palette knowledge. A slot pinned to a single
 * lightness is a legitimate band; the solve then fails loudly rather than silently
 * shipping a value that breaks `checkCatContrast`.
 */

const { hexToOklab, oklabDistance, withLightness } = require('./color.js');

/**
 * The separation floor per tier, in OKLab ΔE, and the scope each is held to.
 *
 * BOTH FLOORS ARE THE REFERENCES' OWN PRE-RE-TUNE VALUES — the smallest reading
 * `indaco` and `cuoio` (and their dark faces) already reached, measured before the
 * 2026-09-01 re-tune. So the contract is still "at least as separable as Adam & Eve",
 * calibrated rather than picked.
 *
 * THEY ARE CONSTANTS AND NOT RE-DERIVED AT TEST TIME, which the first cut got wrong.
 * A floor defined as "whatever the references currently reach" moves the moment the
 * references improve — and a re-tune that lifts the whole catalog improves them. The
 * references landed at 0.0297 while palettes the solver had aimed at 0.0295 landed
 * exactly there, so five of them were suddenly two ten-thousandths short of a floor
 * that had risen underneath them. The gate still checks that the references clear
 * these numbers, which is the part of "derived" that was worth keeping.
 *
 * Shared by `tools/derive-cat-ramp.js` (which solves TO them) and
 * `test/unit/palette/cat-adjacency-floor.test.js` (which holds the catalog to them),
 * so the instrument and the gate cannot drift apart.
 */
const FLOOR = { sat: 0.1050, wash: 0.0295 };
/** Why the two tiers differ: see the header of `requiredPairs`' callers and the gate. */
const SCOPE = { sat: 'adjacent', wash: 'all-pairs' };

/**
 * Hex quantization near mid-lightness is worth about 0.003 in L, and a solve that
 * lands exactly on the floor rounds below it about half the time. Ask for this much
 * more than the floor so the committed value clears it.
 *
 * IT IS A LADDER, NOT A CONSTANT, because on a monotone ramp the margin COMPOUNDS.
 * Twelve slots chained at floor+margin need eleven margins of span, not one:
 * `a11y-base`'s wash ramp costs 0.038 of extra lightness range at the top of this
 * ladder, which is the difference between a ramp its derived ink arm can still
 * separate and one it cannot. So a solve asks for the most margin it can get and
 * gives it back a rung at a time when the band is too tight to afford it. A ramp
 * with room keeps the full margin; only a span-limited one spends it.
 */
const HEADROOM_LADDER = [0.0035, 0.002, 0.001, 0.0005, 0];

/**
 * The minimum lightness between ANY two slots, on every ramp, whatever its scope.
 *
 * WHY THIS EXISTS AND WHY IT IS ALL-PAIRS. Monochromacy keeps lightness and nothing
 * else, so under achromatopsia two slots at the same L are the same color no matter how
 * far apart their hues are. The saturated tier is held ADJACENT-only (all-pairs is
 * unreachable there), which leaves the solver free to place two NON-adjacent slots at
 * identical lightness — and it did: an audit of the first cut found three ramps with a
 * pair at ΔE exactly 0.000 under simulated achromatopsia, `carbone-dark`,
 * `crepuscolo-dark` and `magnolia` among them. That is the precise inverse of this
 * file's own argument for using lightness, and `tools/cvd-audit.js` exits 0, so nothing
 * was going to say so.
 *
 * It is deliberately SMALL — about three sRGB steps at mid-lightness, and far below the
 * 0.065 that `cvd-audit.js` treats as achromatopsia-distinct. Twelve slots cannot reach
 * that floor in one dimension (it would need more range than the axis has). This is not
 * a claim that the cycle survives monochromacy; it is the guarantee that no two slots
 * collapse ONTO each other, which is what the re-tune must not do while spending the
 * one channel monochromacy keeps.
 */
const LIGHTNESS_SPREAD_MIN = 0.012;

/**
 * A ramp whose whole lightness spread is under its own floor expresses NO order,
 * and the difference matters more than it sounds.
 *
 * `concrete`'s twelve light fills sit inside 0.005 of each other and `carbone`'s
 * inside 0.002 — differences no reader can see and no designer authored, but far
 * above any float epsilon. Read pairwise, that rounding noise looks like an intended
 * order, and honoring it spreads the ramp into a SCATTER: near-white at slot 7,
 * mid-gray at slot 9. §6 of the token contract asks these identities for a
 * luminance-spread RAMP, so where a palette expresses no order, slot order is the
 * order.
 *
 * The test has to be per-RAMP, not per-pair. A blanket per-pair tie threshold also
 * catches the close pairs inside a ramp that IS ordered — `indaco`'s dark marks span
 * 0.071 with neighbors much closer than that — and forcing slot order on those
 * over-constrains a solve that was feasible. The floor is its own threshold: a ramp
 * that cannot fit ONE adjacent step inside its entire spread never had an order to
 * respect.
 *
 * WHAT REPLACES THE MISSING ORDER DEPENDS ON THE SCOPE, and getting this wrong costs
 * a solve. Under ALL-PAIRS every slot must clear every other, which in one dimension
 * forces a total order, so slot order is both the cheapest arrangement and the ramp
 * §6 asks for. Under ADJACENT only neighbors must clear, and a two-level ZIG-ZAG
 * does that inside a range of one gap instead of eleven: `carbone`'s twelve light
 * marks need 0.089 between neighbors, which a zig-zag fits in its 0.53 band and a
 * monotone ramp would need 0.98 for — more than the band, more than the axis.
 */
function ramplessOrder(shippedL, floor) {
  return Math.max(...shippedL) - Math.min(...shippedL) < floor;
}

/** Distance between two colors in the a/b plane — everything hue and chroma carry. */
function chromaDistance(hexA, hexB) {
  const p = hexToOklab(hexA);
  const q = hexToOklab(hexB);
  return Math.hypot(p.a - q.a, p.b - q.b);
}

/**
 * Which token carries the chroma on this canvas. Ties go to `mark`, which happens
 * only on a fully achromatic identity where both tiers read the same distances.
 */
function tierOf(fillHexes, markHexes, n = 6) {
  const peak = (hexes) => Math.max(...hexes.slice(0, n).map((h) => {
    const o = hexToOklab(h);
    return Math.hypot(o.a, o.b);
  }));
  return peak(fillHexes) > peak(markHexes) ? 'fill' : 'mark';
}

/** The slot pairs a scope has to separate. */
function requiredPairs(scope, n) {
  const out = [];
  if (scope === 'all-pairs') {
    for (let i = 0; i < n; i += 1) for (let j = i + 1; j < n; j += 1) out.push([i, j]);
  } else {
    for (let i = 0; i < n - 1; i += 1) out.push([i, i + 1]);
  }
  return out;
}

/**
 * Least-movement lightness placement under fixed-sign separation constraints,
 * by cyclic projection: push the two ends of every violated pair apart equally,
 * then re-impose the bands, and repeat. Converges to a feasible point near the
 * start when one exists, and stalls against the bands when none does — which the
 * caller detects by re-measuring rather than by trusting this to report it.
 */
function placeLightness(start, constraints, lo, hi, sweeps = 6000) {
  const x = start.slice();
  for (let sweep = 0; sweep < sweeps; sweep += 1) {
    let moved = false;
    for (const { i, j, gap, sign } of constraints) {
      const have = (x[j] - x[i]) * sign;
      if (have < gap - 1e-9) {
        const push = (gap - have) / 2;
        x[i] -= push * sign;
        x[j] += push * sign;
        moved = true;
      }
    }
    for (let k = 0; k < x.length; k += 1) x[k] = Math.min(hi[k], Math.max(lo[k], x[k]));
    if (!moved) return x;
  }
  return x;
}

/**
 * Re-place one tier's twelve slots.
 *
 * @param {string[]} hexes  the shipped ramp, in slot order
 * @param {object}   opts
 * @param {number}   opts.floor  the tier's separation floor, in OKLab ΔE
 * @param {'adjacent'|'all-pairs'} opts.scope
 * @param {number[]} opts.bandLo per-slot minimum lightness the contrast contract allows
 * @param {number[]} opts.bandHi per-slot maximum
 * @returns {{hexes: string[], ok: boolean, worst: number, worstPair: string, moved: number}}
 */
/**
 * AIMING HIGHER MUST NEVER LAND LOWER, which the first cut did not guarantee.
 *
 * The projection is a heuristic, so a constraint set demanding more can settle somewhere
 * worse than one demanding less: at a 0.0400 floor `a11y-base` came back at its shipped
 * 0.0180, against the 0.0289 the same solver reaches when aimed at 0.0295. A floor that
 * can make the catalog WORSE by being raised is not a floor, it is a trap — and it makes
 * any sweep of candidate floors measure the solver rather than the palettes.
 *
 * So an unreachable target is retried down this ladder and the best result kept. The
 * outcome is then monotone in the target, and a ramp that cannot clear its floor still
 * ships the best placement it can reach instead of giving up to the shipped values.
 */
const TARGET_LADDER = [1, 0.85, 0.7, 0.55, 0.4];

function solveRamp(hexes, opts) {
  let best = null;
  for (const scale of TARGET_LADDER) {
    const attempt = solveAtFloor(hexes, { ...opts, floor: opts.floor * scale });
    // Judge every attempt against the REAL floor, not the scaled one it aimed at.
    const graded = { ...attempt, ok: +attempt.worst.toFixed(4) >= opts.floor };
    if (!best || graded.worst > best.worst) best = graded;
    if (graded.ok) return graded;
  }
  return best;
}

function solveAtFloor(hexes, { floor, scope, bandLo, bandHi, accept }) {
  const shippedL = hexes.map((h) => hexToOklab(h).L);
  // EVERY RUNG IS TRIED AND THE BEST ACCEPTED ONE WINS — not the first that clears
  // the floor. More margin does not monotonically buy more separation: it also
  // widens the ramp, and a wider ramp can lose the downstream veto. On `a11y-base`
  // the top rung reaches 0.0302 over L 0.200–0.562 and its derived dark ink arm
  // cannot separate twelve slots across that span, while the rung below reaches
  // 0.0285 over a ramp the ink arm handles. Returning the first acceptable rung
  // would have shipped 0.0272; returning the best acceptable one ships 0.0285.
  // Both directions only matter for an unordered all-pairs ramp; everywhere else the
  // shipped order decides every sign and `descend` changes nothing, so the second
  // solve is a duplicate that the movement tiebreak discards.
  const directions = scope === 'all-pairs' ? [false, true] : [false];
  const tried = [];
  for (const headroom of HEADROOM_LADDER) {
    for (const descend of directions) {
      tried.push({ ...solveAt(hexes, { floor, scope, bandLo, bandHi, headroom, descend }), headroom, descend });
    }
  }
  // `accept` is the caller's downstream veto — today, whether `derive-cat-ink` can
  // still solve a legible ink arm over this ramp. It cannot live in here (this file
  // knows nothing about canvases), so the caller supplies it.
  const allowed = accept ? tried.filter((t) => accept(t.hexes)) : tried;
  if (!allowed.length) {
    // Every rung lost the veto, so there is no re-tune to ship. Hand back the SHIPPED
    // ramp untouched: the alternative is writing a ramp we already know breaks the
    // thing the veto guards, which trades a separation defect for a legibility one.
    let worst = Infinity;
    let worstPair = '';
    for (const [i, j] of requiredPairs(scope, hexes.length)) {
      const d = oklabDistance(hexes[i], hexes[j]);
      if (d < worst) { worst = d; worstPair = `${i + 1}^${j + 1}`; }
    }
    return { hexes: hexes.slice(), ok: false, vetoed: true, worst: +worst.toFixed(4), worstPair, moved: 0 };
  }
  // CLEARING THE FLOOR IS THE CONTRACT; EXCEEDING IT IS NOT A SCORE. Among ramps that
  // clear it, the one that moved the palette least wins — buying 0.0009 of extra
  // separation is not worth re-placing twelve curated colors further than they had to
  // go. Only when nothing clears the floor does the best separation win, because then
  // the extra thousandth is the whole result.
  const drift = (t) => t.hexes.reduce((sum, h, k) => sum + Math.abs(hexToOklab(h).L - shippedL[k]), 0);
  const clearing = allowed.filter((t) => t.ok);
  if (clearing.length) return clearing.reduce((a, b) => (drift(b) < drift(a) ? b : a));
  return allowed.reduce((a, b) => (b.worst > a.worst ? b : a));
}

function solveAt(hexes, { floor, scope, bandLo, bandHi, headroom, descend = false }) {
  const n = hexes.length;
  const pairs = requiredPairs(scope, n);
  // Signs are read from the shipped ramp ONCE and held — see the header.
  const shippedL = hexes.map((h) => hexToOklab(h).L);
  const unordered = ramplessOrder(shippedL, floor);
  // Slot order for all-pairs, zig-zag for adjacent — see ramplessOrder's header.
  // `descend` flips the all-pairs direction; which way an unordered ramp should run is
  // not settled by convention (the tree's own authored ramps disagree — a11y's
  // categorical fills run light-to-dark, its chart fills run dark-to-light), so
  // solveAt is run both ways and the one that moves the palette LESS wins. On
  // `concrete` that is the difference between keeping its near-white light chips and
  // inverting them to start at mid-gray.
  const fallback = (i, j) => (scope === 'all-pairs'
    ? ((j > i) !== descend ? 1 : -1)
    : (i % 2 === 0 ? 1 : -1));
  const signOf = (i, j) => ((!unordered && Math.abs(shippedL[j] - shippedL[i]) > 1e-6)
    ? (shippedL[j] > shippedL[i] ? 1 : -1)
    : fallback(i, j));

  let current = hexes.slice();
  for (let round = 0; round < 24; round += 1) {
    const constraints = [];
    const scoped = new Set(pairs.map(([i, j]) => `${i}:${j}`));
    // EVERY pair carries the monochromacy floor; the scope's pairs additionally carry
    // whatever lightness the tier's ΔE floor still owes after hue and chroma pay in.
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const owed = scoped.has(`${i}:${j}`)
          ? Math.sqrt(Math.max(0, floor * floor - chromaDistance(current[i], current[j]) ** 2))
          : 0;
        const gap = Math.max(owed + headroom, LIGHTNESS_SPREAD_MIN);
        if (gap <= 0) continue;
        constraints.push({ i, j, gap, sign: signOf(i, j) });
      }
    }
    if (!constraints.length) break;
    const solved = placeLightness(current.map((h) => hexToOklab(h).L), constraints, bandLo, bandHi);
    const next = current.map((h, k) => withLightness(h, solved[k]));
    // Gamut clipping can move chroma, which moves the pair distances, so re-measure
    // and go again; a round that changes no byte is a fixed point.
    if (next.every((h, k) => h === current[k])) break;
    current = next;
  }

  let worst = Infinity;
  let worstPair = '';
  for (const [i, j] of pairs) {
    const d = oklabDistance(current[i], current[j]);
    if (d < worst) { worst = d; worstPair = `${i + 1}^${j + 1}`; }
  }
  return {
    hexes: current,
    // Judged at the SAME four decimal places the adjacency gate measures at
    // (`cat-adjacency-floor.test.js` rounds every reading with `toFixed(4)`), so a
    // ramp this file calls short is one the gate would also call short. Comparing
    // raw floats here made the low-margin rungs fail on a ten-thousandth the gate
    // rounds away, which left the ladder unable to descend at all.
    ok: +worst.toFixed(4) >= floor,
    worst: +worst.toFixed(4),
    worstPair,
    moved: current.filter((h, k) => h.toLowerCase() !== hexes[k].toLowerCase()).length,
  };
}

module.exports = { solveRamp, requiredPairs, tierOf, chromaDistance, HEADROOM_LADDER, LIGHTNESS_SPREAD_MIN, ramplessOrder, FLOOR, SCOPE };
