// FINDINGS FROM A DECK READ WITH ITS PHOTOS SKIPPED, PUT BACK ON THE REAL TEXT. lint-core and review-core read a photo
// deck through lib/core/payload-elision.js, which hands the rules a short stand-in for each base64 payload. Their findings
// then quote stand-ins, and a `col` past one counts the stand-in's characters, not the payload's. This puts every
// payload back and moves each such `col`, so a squiggle, a quick fix and "Fix all" land where the whole text puts them.
// It lives here, not in the kernel, because only lint and review need it: the engine bundle every docs page loads
// carries the kernel and would carry this for nothing (route budget, PR #3153).
'use strict';

const { MARK } = require('../core/payload-elision.js');

/**
 * How far a `col` on a line holding stand-ins moves: the characters lost by every stand-in that sits before the
 * finding's span. `line` is the finding's (trimmed) line and `col` indexes the untrimmed one, so the span is placed on
 * the trimmed line at the occurrence closest to `col` from the left (the indent is the only difference between the two).
 * @param {string} line @param {unknown} span @param {number} col @param {number[]} lost
 */
function shiftBefore(line, span, col, lost) {
  let at = col;
  if (typeof span === 'string' && span) {
    let best = -1;
    for (let i = line.indexOf(span); i >= 0 && i <= col; i = line.indexOf(span, i + 1)) best = i;
    if (best >= 0) at = best;
  }
  let shift = 0;
  for (const m of line.matchAll(new RegExp(`${MARK}(\\d+)x`, 'g'))) if (m.index < at) shift += lost[Number(m[1])] ?? 0;
  return shift;
}

/** Any string, array or plain object, with every stand-in in it replaced by its payload. */
function restoreValue(v, restoreText) {
  if (typeof v === 'string') return restoreText(v);
  if (Array.isArray(v)) return v.map((x) => restoreValue(x, restoreText));
  if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, x] of Object.entries(v)) out[k] = restoreValue(x, restoreText);
    return out;
  }
  return v;
}

/**
 * The findings with every stand-in replaced by its payload, and each `col` moved past the stand-ins before it.
 * @template T
 * @param {{ lost: number[], restoreText: (s: string) => string }} cut what `elidePayloads` returned
 * @param {T[]} findings
 * @returns {T[]}
 */
function restoreFindings(cut, findings) {
  return findings.map((f) => {
    if (!f || typeof f !== 'object') return f;
    const out = restoreValue(f, cut.restoreText);
    const { col, line, span } = /** @type {{ col?: unknown, line?: unknown, span?: unknown }} */ (f);
    if (Number.isInteger(col) && typeof line === 'string' && line.includes(MARK)) {
      /** @type {{ col: number }} */ (out).col = /** @type {number} */ (col) + shiftBefore(line, span, /** @type {number} */ (col), cut.lost);
    }
    return out;
  });
}

module.exports = { restoreFindings, restoreValue };
