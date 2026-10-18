/**
 * ep-curve-model.js — what one exceedance-probability point MEANS, shared by the
 * kernel that draws it (lib/components/chart/ep-curve/) and the narrator that says
 * it (lib/core/chart-narration.js § narrateEpCurve), so the two keep the same
 * points (HARD RULE #1).
 *
 *   - OEP
 *     - `{100, $410M}`      a 1-in-100 year loss of $410M
 *
 * A point is the family's point record (lib/core/chart-point.js), x first: the
 * RETURN PERIOD in years, then the LOSS. A return period below one year is not a
 * return period (it would be a probability above 1), so it is not a point.
 *
 * Pure: strings in, plain data out. No DOM, no fs.
 */

const { readPoint } = require('./chart-point');

/** A point pill to `{ rp, loss, rpRaw, lossRaw }`, or null. */
function readEpPoint(pill) {
  const p = readPoint(String(pill ?? '').trim());
  if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y) || p.x < 1) return null;
  return { rp: p.x, loss: p.y, rpRaw: p.xRaw, lossRaw: p.yRaw };
}

/**
 * `1-in-100`: how a return period is written on the axis and in the narration. A
 * whole number of four digits or more takes its thousands separator, `1-in-1,000`,
 * the way a market writes it; anything else prints as the author wrote it.
 */
function rpLabel(pt) {
  const raw = String(pt.rpRaw);
  return `1-in-${/^\d{4,}$/.test(raw) ? raw.replace(/\B(?=(\d{3})+$)/g, ',') : raw}`;
}

/** A series' points in return-period order, a repeated return period kept once (the first). */
function orderPoints(points) {
  const seen = new Set();
  return points
    .filter((p) => (seen.has(p.rp) ? false : (seen.add(p.rp), true)))
    .sort((a, b) => a.rp - b.rp);
}

module.exports = { readEpPoint, rpLabel, orderPoints };
