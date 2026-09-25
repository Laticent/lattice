/**
 * gantt's TIME vocabulary — what a span or point token in a gantt's Markdown means.
 *
 * ── WHY IT LIVES IN lib/core ──────────────────────────────────────────────────
 *
 * It was `gantt.transform.js`'s, and the transform still reads it from here. It moved down one
 * layer for the reason `chart-values.js` and `chart-status.js` did: NARRATION needs the identical
 * answer, and `lib/core` never reaches into `lib/components`. The first narrator for gantt
 * carried its own point regex and it disagreed with this one on three shapes a real deck types —
 * `2026Q2` (drawn as a milestone, said "not yet scheduled"), `2026-03` and `Sept` (said as
 * milestones, drawn unscheduled). One parser, two layers, no copy (HARD RULE #1).
 *
 * A time POINT is an ISO date (2026-03-15), a quarter (Q1, or year-qualified 2026 Q1), or a
 * month (Jan, 2026 Jan). `..` is the ONE span delimiter. 2026-06-21-gantt-component-redesign.md.
 */

const GANTT_MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const GANTT_MONTHS_FULL = ['january','february','march','april','may','june','july','august','september','october','november','december'];

// Classify + parse one time point. Returns null when unrecognized.
//   { kind: 'date', day }            — ISO date → epoch days
//   { kind: 'q',   year|null, idx }  — quarter (idx 0..3)
//   { kind: 'm',   year|null, idx }  — month   (idx 0..11)
function parseTimePoint(raw) {
  const s = String(raw == null ? '' : raw).trim();
  if (!s) return null;
  const d = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (d) {
    const y = +d[1], mo = +d[2] - 1, dd = +d[3];
    const t = Date.UTC(y, mo, dd);
    const dt = new Date(t);
    // Date.UTC never returns NaN for overflow (2026-13-01 → 2027), so reject a
    // value that didn't round-trip — a malformed date is null, not a silent roll.
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo || dt.getUTCDate() !== dd) return null;
    return { kind: 'date', day: Math.round(t / 86400000) };
  }
  const q = s.match(/^(?:(\d{4})\s*)?Q([1-4])$/i);
  if (q) return { kind: 'q', year: q[1] ? +q[1] : null, idx: +q[2] - 1 };
  // Month — an EXACT 3-letter abbrev or full name only, never a prefix, so a
  // label word ("Marketing", "Decision", "September") can't masquerade as one.
  const m = s.match(/^(?:(\d{4})\s*)?([A-Za-z]+)$/);
  if (m) {
    const w = m[2].toLowerCase();
    let mi = w.length === 3 ? GANTT_MONTHS.indexOf(w) : -1;
    if (mi < 0) mi = GANTT_MONTHS_FULL.indexOf(w);
    if (mi >= 0) return { kind: 'm', year: m[1] ? +m[1] : null, idx: mi };
  }
  return null;
}

// Split a span token on `..` → { startRaw, endRaw } (a bar) or { pointRaw } (a
// single point → milestone). Tolerant of optional surrounding whitespace.
function parseSpanToken(tok) {
  const parts = String(tok || '').split('..');
  if (parts.length >= 2) return { startRaw: parts[0].trim(), endRaw: parts.slice(1).join('..').trim() };
  return { pointRaw: String(tok || '').trim() };
}

module.exports = { parseTimePoint, parseSpanToken, GANTT_MONTHS, GANTT_MONTHS_FULL };
