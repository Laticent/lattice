/**
 * arrowhead — the family's filled direction head, as path data.
 *
 * The idiom is state-chart's `arrowhead()`: a filled isosceles triangle, tip first,
 * whose base sits on the line it terminates. It is lifted here as geometry only, for
 * members that compute their own connectors in the kernel (`hub-spoke`). State-chart's
 * copy stays where it is: it runs inside `installStateChartLayout`, a function that is
 * serialized with `.toString()` into the preview frame, so it cannot `require` anything
 * and must not be refactored as a side effect of adding a member.
 *
 * Pure: numbers in, a path string out. The caller owns class, color and placement.
 */

const f2 = (v) => Number(Number(v).toFixed(2));
const P = (x, y) => `${f2(x)},${f2(y)}`;

/**
 * @param {object} o
 * @param {number} o.tipX  where the point of the head lands (user units)
 * @param {number} o.tipY
 * @param {number} o.ux    unit vector the head POINTS along (toward the tip)
 * @param {number} o.uy
 * @param {number} o.length  tip-to-base distance
 * @param {number} o.base    width of the base
 * @returns {string} SVG path data for a closed triangle
 */
function arrowheadPath({ tipX, tipY, ux, uy, length, base }) {
  const bx = tipX - ux * length;
  const by = tipY - uy * length;
  const hx = -uy * (base / 2);
  const hy = ux * (base / 2);
  return `M${P(tipX, tipY)}L${P(bx + hx, by + hy)}L${P(bx - hx, by - hy)}Z`;
}

module.exports = { arrowheadPath };
