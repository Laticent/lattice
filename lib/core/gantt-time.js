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

const { readTime } = require('@laticent/segno/values');

const GANTT_MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
const GANTT_MONTHS_FULL = ['january','february','march','april','may','june','july','august','september','october','november','december'];

// Classify + parse one time point. Returns null when unrecognized.
//   { kind: 'date', day }            — ISO date → epoch days
//   { kind: 'q',   year|null, idx }  — quarter (idx 0..3)
//   { kind: 'm',   year|null, idx }  — month   (idx 0..11)
// Read by Segno's time type (`@laticent/segno/values`, Segno phase 2): the one time reader every
// directive's slot binds with. Its rules are this file's old ones — an ISO date must round-trip
// (2026-13-01 is not a date), a month is an EXACT 3-letter abbreviation or full name, never a
// prefix, so a label word ("Marketing", "Decision") cannot masquerade as one.
function parseTimePoint(raw) {
  return readTime(String(raw == null ? '' : raw)) || null;
}

// Split a span token on `..` → { startRaw, endRaw } (a bar) or { pointRaw } (a
// single point → milestone). Tolerant of optional surrounding whitespace.
function parseSpanToken(tok) {
  const parts = String(tok || '').split('..');
  if (parts.length >= 2) return { startRaw: parts[0].trim(), endRaw: parts.slice(1).join('..').trim() };
  return { pointRaw: String(tok || '').trim() };
}

module.exports = { parseTimePoint, parseSpanToken, GANTT_MONTHS, GANTT_MONTHS_FULL };
