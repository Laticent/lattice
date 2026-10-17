/**
 * tower-size — the ONE reading of a `tower` layer's size and a reinsurer's share
 * (HARD RULE #1). The kernel (lib/components/chart/tower/tower.transform.js) draws
 * from it and the narrator (`narrateTower`, chart-narration.js) speaks from it, so a
 * pill the chart drops is a pill the narration drops, and the two never disagree
 * about which band is mark N.
 *
 * Pure: no fs, no DOM.
 */

const { parseValue, isValuePill } = require('./chart-values.js');

// `xs`, `x/s` and `excess of` are the three spellings a slip carries.
const XS = /^(.+?)\s+(?:xs\.?|x\/s|excess\s+of)\s+(.+)$/i;
const XS_WORD = /(?:^|\s)(?:xs\.?|x\/s|excess(?:\s+of)?)(?:\s|$)/i;
const PERCENT = /%\s*$/;

/** One side of a size: a whole value pill, and money or a count, never a percentage. */
function sizeSide(raw) {
  const s = String(raw).trim();
  if (!s || PERCENT.test(s) || !isValuePill(s)) return null;
  const n = parseValue(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * A layer's size pill → `{ limit, attach, retention, limitRaw, attachRaw }`, or null
 * when it is not one. `$40M xs $50M` is a layer; a bare `$50M` is the retention, the
 * band from zero. A pill that carries an `xs` word but is not `limit xs attachment`
 * (`$40M xs`, `xs $50M`, `40 xs 50 xs 60`) is malformed and null, rather than read as
 * a retention of whatever number it happens to start with.
 */
function readTowerSize(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const xs = s.match(XS);
  if (!xs && XS_WORD.test(s)) return null;
  const limit = sizeSide(xs ? xs[1] : s);
  const attach = xs ? sizeSide(xs[2]) : 0;
  if (limit == null || limit <= 0 || attach == null || attach < 0) return null;
  return {
    limit, attach, top: attach + limit, retention: !xs,
    limitRaw: xs ? xs[1].trim() : s, attachRaw: xs ? xs[2].trim() : '',
  };
}

/** A share pill (`30%`, `30 %`, a bare `30`) → a positive percentage, or null. */
function readTowerShare(raw) {
  const s = String(raw || '').trim().replace(PERCENT, '').trim();
  if (!s || !isValuePill(s)) return null;
  const n = parseValue(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

module.exports = { readTowerSize, readTowerShare };
