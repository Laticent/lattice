/**
 * The FACTS a bullet row carries, derived once for both surfaces that need them.
 *
 * ── WHY THIS IS A KERNEL AND NOT A SECOND COPY ────────────────────────────────
 *
 * `bullet.transform.js` already derived every number below, inline, for the SVG
 * `<desc>` — and its docblock says exactly why it bothered: "this `<desc>` is the
 * ONLY route a screen reader has to the chart. It therefore carries the
 * RELATIONSHIP the chart is for — attainment against target — and not merely the
 * two numbers: a bullet graph exists to say whether the bar cleared the tick."
 *
 * The VOICE needs the same relationship and could not reach it. Narration runs off
 * Markdown and never sees the rendered SVG, so `narrateDataSeries` read the two
 * pills in authored order — "New ARR, four point two million, five million" — and
 * a listener got the inputs to a judgment nobody made for them. Re-deriving the
 * arithmetic inside the narrator would have put `(measure - floor) / (target - floor)`
 * in two files free to drift, which is what HARD RULE #1 exists to stop. So the
 * derivation moved HERE and both callers read it:
 *
 *   bullet.transform.js  →  the <desc> a screen reader hears
 *   chart-narration.js   →  the caption track a listener hears
 *
 * The transform's output is byte-identical across this move; `golden-diff` is the
 * proof, and the move is worthless if it is not.
 *
 * ── WHAT THIS MODULE WILL NOT DO ──────────────────────────────────────────────
 *
 * It computes; it does not phrase. Every function here returns numbers and flags,
 * never a sentence. The two callers word the same fact differently on purpose —
 * a `<desc>` is read by a screen reader that the user can re-read at will, a
 * caption cue is heard once and cannot be scrubbed back to — and a kernel that
 * returned prose would force one register on both.
 *
 * It also states no VERDICT beyond the one the chart draws. `measure >= target`
 * is a fact the tick makes visible. "The quarter turns on ARR alone" is not, and
 * the slide's own heading is where it belongs: `bullet.docs.md`'s `title` slot
 * instructs the author to "name the verdict ('Three of five are behind plan'),
 * not the chart type".
 */

// The DERIVED qualitative range, as fractions of target — the INTERNAL cut
// points, so two of them make three zones. An author who types only a measure
// and a target still gets a real bullet graph, because the range a board
// actually means is "short of plan / nearly there / at or past plan", and 0.60
// and 0.85 are its conventional cut points.
//
// There is deliberately NO top cut point. The last zone runs to the top of the
// row's scale, which is Few's own spec and is also what keeps the track from
// stopping short of the plot edge and reading as a rail that ran out.
const BAND_FRACTIONS = Object.freeze([0.6, 0.85]);

// Past four zones a qualitative range stops being qualitative — it is a
// gradient, and a reader cannot name which zone a bar ended in.
const MAX_ZONES = 4;

// The names the DERIVED three-zone range carries, and only it. `bullet.docs.md`
// calls them "short / close / there"; the transform's own comment calls them
// "short of plan / nearly there / at or past plan". Both describe the SAME three
// zones, because both describe the 60/85 split.
//
// AUTHORED bands get no names, and that is the point rather than a gap. An SLO
// scale authored `50 · 70 · 85 · 90 · 93` has four zones whose meaning lives in
// the author's head; calling the third of them "nearly there" would invent a
// grade the slide never claims. A caller that wants to say something about an
// authored zone has `index` and `count` and nothing else, which is honest.
const DERIVED_ZONE_NAMES = Object.freeze(['short of plan', 'nearly there', 'at or past plan']);

function round6(n) {
  return Number(n.toFixed(6));
}

/**
 * The INTERNAL cut points of a row's qualitative range, ascending.
 *
 * N cuts make N+1 zones, because the last zone runs to the top of the row's
 * scale rather than stopping at a cut of its own. That is Few's spec, and it is
 * also what stops the range reading as a rail that ran out: a track whose
 * shading stops two thirds of the way across looks like a rendering fault, not
 * like a scale.
 *
 * Lifted verbatim from `bullet.transform.js`'s `cutsFor`, comments included —
 * the two block comments below record defects this function's exact shape fixed,
 * and a paraphrase of a defect note is worth nothing.
 */
function zoneCuts(r) {
  const derived =
    Number.isFinite(r.target) && r.target > r.floor
      ? BAND_FRACTIONS.map((f) => round6(r.floor + f * (r.target - r.floor)))
      : [];
  const authored = (r.bands || []).filter((b) => b > r.floor);
  // A `Band` at or below the floor is off this row's scale and cannot be drawn.
  // When EVERY authored band is, the row used to lose its qualitative range
  // altogether — a bare track, where the same row without the band renders
  // three zones, so adding context deleted the chart's defining mark. Fall back
  // to the derived cuts instead.
  const inner = authored.length ? authored : derived;
  // The cuts kept are the ones NEAREST THE TARGET, not the lowest. An SLO scale
  // authored `50 · 70 · 85 · 90 · 93` had `90` and `93` — the two thresholds the
  // slide is about — silently discarded, and they land nowhere else: the parser
  // consumed them as structural, so they are not in the detail, the note or the
  // description either.
  return inner.slice(-(MAX_ZONES - 1));
}

/** Were this row's cuts derived from the target, or authored as `Band` bullets? */
function cutsAreDerived(r) {
  return !(r.bands || []).some((b) => b > r.floor);
}

/**
 * Attainment against target, or `null` when the chart draws no tick to attain.
 *
 * ATTAINMENT IS MEASURED FROM THE FLOOR, because that is what the bar is drawn
 * from. `Floor` exists precisely because the raw ratio is misleading at a high
 * baseline: uptime 99.4% against a 99.9% target on a 99.0% floor draws a bar 44%
 * of the way to the tick and used to be read out as "99% of target" — a sighted
 * reader saw clearly short, a listener heard a rounding error away.
 *
 * The `null` guard is THE SAME GUARD THE TARGET TICK USES. The tick is drawn only
 * when the target clears the floor; guarding on `target > 0` instead told a
 * screen-reader user about a mark that is not on the slide (a row with `Target 5`
 * under `Floor 10`). The voice inherits that guard by construction now, rather
 * than by a second author remembering it.
 */
function attainment(r) {
  if (!Number.isFinite(r.target) || !Number.isFinite(r.measure) || r.target <= r.floor) return null;
  const span = r.target - r.floor;
  return {
    pct: Math.round(((r.measure - r.floor) / span) * 100),
    // `>=` — exactly at plan has cleared it. Note this is deliberately NOT the
    // same test as the transform's `over` flag, which is strict `>` because it
    // decides whether to paint an overshoot. At-plan is "cleared" and is not an
    // overshoot; conflating the two would either lose a row from the cleared
    // count or paint a mark the chart does not draw.
    cleared: r.measure >= r.target,
    over: r.measure > r.target,
    under: Number.isFinite(r.floor) && r.measure < r.floor,
    // The absolute distance to the tick, in the row's own units — the "0.8M gap"
    // half of the read. Signed toward the target, so a cleared row reports the
    // overshoot as a positive number too and the caller picks the word.
    gap: Math.abs(r.target - r.measure),
  };
}

/**
 * WHICH ZONE the measure landed in — the one fact on this chart that neither the
 * picture's `<desc>` nor the Markdown states, and the reason this kernel is worth
 * more than a move.
 *
 * The transform tiles the track and stamps `data-zone` on each band RECT, but
 * nothing anywhere compares the measure against the cuts. A sighted reader gets
 * it for free: the bar tip stops inside a shaded band. A listener was told the
 * percentage and left to place it.
 *
 * Returns `{ index, count, name }` where `name` is null for authored bands (see
 * DERIVED_ZONE_NAMES). `index` counts from 0 at the bottom of the scale.
 */
function zoneOf(r, cuts) {
  const c = cuts || zoneCuts(r);
  if (!c.length || !Number.isFinite(r.measure)) return null;
  let index = 0;
  while (index < c.length && r.measure >= c[index]) index++;
  const count = c.length + 1;
  const derived = cutsAreDerived(r);
  return {
    index,
    count,
    // Named ONLY for the derived 60/85 split, and only when it really is three
    // zones. A derived range is always three today, but the guard costs one
    // comparison and stops a future BAND_FRACTIONS edit from silently handing
    // out the wrong name.
    name: derived && count === DERIVED_ZONE_NAMES.length ? DERIVED_ZONE_NAMES[index] : null,
  };
}

/**
 * The CHART-level shape: how many rows there are and how many cleared their tick.
 *
 * `cleared` counts only rows that HAVE a tick — a row with one pill draws a bare
 * bar with no marker and no range (`bullet.docs.md`), so it is neither cleared
 * nor short, and folding it into either count would misreport the chart. `scored`
 * is therefore the honest denominator, and it is not always `rows.length`.
 */
function summarizeRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const scored = list.filter((r) => attainment(r) != null);
  const cleared = scored.filter((r) => attainment(r).cleared);
  return {
    total: list.length,
    scored: scored.length,
    cleared: cleared.length,
    short: scored.length - cleared.length,
    // Every row must be higher-is-better — `bullet.manifest.json`'s anti-patterns
    // make it a hard guarantee ("A KPI where lower is better … beating the target
    // reads as missing it"). So `cleared` is unambiguously good news and a caller
    // may say so without reading the author's mind.
    floored: list.some((r) => Number.isFinite(r.floor) && r.floor !== 0),
  };
}

module.exports = {
  BAND_FRACTIONS,
  MAX_ZONES,
  DERIVED_ZONE_NAMES,
  round6,
  zoneCuts,
  cutsAreDerived,
  attainment,
  zoneOf,
  summarizeRows,
};
