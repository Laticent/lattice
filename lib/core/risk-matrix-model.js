/**
 * risk-matrix-model — the ONE reading of a risk matrix's scale (HARD RULE #1): the
 * names of the five likelihood and impact steps, the severity bands, and how a point
 * record becomes a cell. The kernel
 * (lib/components/chart/risk-matrix/risk-matrix.transform.js) draws from it and the
 * narrator (`narrateRiskMatrix`, chart-narration.js) speaks from it, so a risk the
 * chart leaves out is one the narration leaves out, and the band a cell is shaded is
 * the band that is said.
 *
 * Pure: no fs, no DOM.
 */

const { readPoint } = require('./chart-point');

const N = 5;
const LIKELIHOOD = Object.freeze(['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain']);
const IMPACT = Object.freeze(['Minor', 'Moderate', 'Major', 'Severe', 'Critical']);
// score = likelihood × impact, the convention most risk registers use.
const BANDS = Object.freeze([
  Object.freeze({ key: 'low', label: 'Low', max: 4 }),
  Object.freeze({ key: 'medium', label: 'Medium', max: 9 }),
  Object.freeze({ key: 'high', label: 'High', max: 14 }),
  Object.freeze({ key: 'critical', label: 'Critical', max: 25 }),
]);

/** The band a likelihood × impact score falls in. */
function bandOf(score) {
  return BANDS.find((b) => score <= b.max);
}

/** A point record as a grid cell `{ l, i }`, or null when it is not two whole numbers in 1..5. */
function cellOf(pill) {
  const pt = pill ? readPoint(pill) : null;
  if (!pt) return null;
  const ok = (v) => Number.isInteger(v) && v >= 1 && v <= N;
  return ok(pt.x) && ok(pt.y) ? { l: pt.x, i: pt.y } : null;
}

module.exports = { N, LIKELIHOOD, IMPACT, BANDS, bandOf, cellOf };
