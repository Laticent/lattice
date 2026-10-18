/**
 * histogram-model.js — what one histogram row MEANS, shared by the kernel that
 * draws it (lib/components/chart/histogram/) and the narrator that says it
 * (lib/core/chart-narration.js § narrateHistogram), so the two can never keep
 * different rows (HARD RULE #1).
 *
 *   - $1M to $10M `$1M..$10M` `55%`     a named band
 *   - `$10M..$50M` `30%`                 a band named by its own range
 *
 * A row is a BAND, written as a Segno range (`a..b`, the only range delimiter —
 * chart-family.docs.md § How a chart is written), and a VALUE, any number Segno
 * reads (`55%`, `120`, `$4.2M`). The two are told apart by type, so their order
 * is free. A row without both, or whose band does not climb (`$10M..$1M`), is
 * not a band, and the chart and the narrator both leave it out.
 *
 * Pure: strings in, plain data out. No DOM, no fs.
 */

const { range, number } = require('@laticent/segno/read');

const RANGE = range(number());
const NUMBER = number();

/** A band pill, `$1M..$10M`: its ends as numbers and as written, or null. */
function readBand(pill) {
  const text = String(pill ?? '').trim();
  const r = RANGE.read(text, false);
  if (!r) return null;
  const from = r.from.value;
  const to = r.to.value;
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(to > from)) return null;
  const at = text.indexOf('..');
  return { from, to, fromRaw: text.slice(0, at).trim(), toRaw: text.slice(at + 2).trim() };
}

/** A value pill, `55%`: the number and its text, or null. A range is never a value. */
function readValue(pill) {
  const text = String(pill ?? '').trim();
  if (text.includes('..')) return null;
  const n = NUMBER.read(text, false);
  return n && Number.isFinite(n.value) ? { value: n.value, raw: text } : null;
}

/**
 * One row's pills, as plain text, to a band and a value: the first pill that reads
 * as a band and the first other pill that reads as a value. Null without both.
 */
function readRow(pills) {
  let band = null;
  let value = null;
  for (const p of pills || []) {
    if (!band) {
      const b = readBand(p);
      if (b) { band = b; continue; }
    }
    if (!value) value = readValue(p);
  }
  return band && value ? { ...band, value: value.value, valueRaw: value.raw } : null;
}

/** The label a band shows when the author gave it none: its own range, in words. */
const bandName = (b) => `${b.fromRaw} to ${b.toRaw}`;

/**
 * Where neighboring bands do not meet: `gap` (space between them) or `overlap`
 * (one runs into the next), by index of the LATER band. Bands are compared in the
 * order written, so bands written out of order read as overlaps, which they draw as.
 */
function joins(bands) {
  const out = [];
  for (let k = 1; k < bands.length; k++) {
    const prev = bands[k - 1].to;
    const next = bands[k].from;
    const tol = Math.max(Math.abs(prev), Math.abs(next)) * 1e-9;
    if (next > prev + tol) out.push({ at: k, kind: 'gap' });
    else if (next < prev - tol) out.push({ at: k, kind: 'overlap' });
  }
  return out;
}

/**
 * The x domain the chart draws: the bands' own span, widened by an axis domain.
 * Shared so the kernel, the narrator and the linter agree on whether `log` holds.
 */
function domainOf(bands, axis) {
  const lo = Math.min(...bands.map((b) => b.from));
  const hi = Math.max(...bands.map((b) => b.to));
  return axis && axis.range ? [Math.min(axis.range.min, lo), Math.max(axis.range.max, hi)] : [lo, hi];
}

/** Whether the axis draws log: `log` was asked for AND the whole domain is above zero. */
function isLogDrawn(bands, axis) {
  return !!axis && axis.scale === 'log' && bands.length > 0 && domainOf(bands, axis)[0] > 0;
}

module.exports = { readBand, readValue, readRow, bandName, joins, domainOf, isLogDrawn };
