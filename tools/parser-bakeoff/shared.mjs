/**
 * parser-bakeoff shared POLICY — the tables and post-parse rules every candidate calls,
 * so a divergence in the tables is a difference in how a grammar READS the string, never in
 * what the reading means. Each helper is the incumbent's own code, imported, not re-typed.
 *
 * What is deliberately NOT here: anything structural. Where a quote opens, which `-` is an
 * arrow, what `..` splits — that is the grammar's job and each candidate does it itself.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { unquote } = require('../../lib/core/bracket-list.js');
const { signedValue } = require('../../lib/core/chart-values.js');
const { GANTT_MONTHS, GANTT_MONTHS_FULL } = require('../../lib/core/gantt-time.js');
const { resolveMods, RESERVED_MARKERS, isLabel } = require('../segno-legacy/inline-pills.js');

/** `\s` / String#trim's set, as a predicate and as a character class body. */
export const WS_CLASS = '\\t-\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff';
export const WS_RE = new RegExp(`[${WS_CLASS}]`);
export const isWsCh = (ch) => WS_RE.test(ch);

/** axis: one part's value from its raw (trimmed) text. Empty \u2192 dropped by the caller. */
export function partValue(raw, quoted) {
  return quoted || WS_RE.test(raw) ? unquote(raw) : raw;
}

/** axis: position holds for empty members, trailing blanks trim, all-empty is null. */
export function finalizeMembers(members) {
  let end = members.length;
  while (end > 0 && members[end - 1].length === 0) end--;
  return end ? members.slice(0, end) : null;
}

/** gantt: a calendar date that round-trips, else null. */
export function date(y, mo, d) {
  const t = Date.UTC(y, mo - 1, d);
  const dt = new Date(t);
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { kind: 'date', day: Math.round(t / 86400000) };
}

/** gantt: an exact month word (3-letter or full), else null. */
export function month(year, word) {
  const w = word.toLowerCase();
  let mi = w.length === 3 ? GANTT_MONTHS.indexOf(w) : -1;
  if (mi < 0) mi = GANTT_MONTHS_FULL.indexOf(w);
  return mi >= 0 ? { kind: 'm', year, idx: mi } : null;
}

export const quarter = (year, q) => ({ kind: 'q', year, idx: Number(q) - 1 });

/** value: the number a RECOGNIZED pill carries — the incumbent's policy, unchanged. */
export function numberOf(s) {
  const v = signedValue(s);
  return Number.isFinite(v.value) ? v : null;
}

/** inline: a pill from its value and modifier words, or null. */
export function pill(value, mods) {
  if (RESERVED_MARKERS.has(value) || !isLabel(value)) return null;
  const axes = resolveMods(mods);
  return axes ? { kind: 'pill', value, ...axes } : null;
}

// The kernel's own marker set, never retyped: state-marks.test.js fails on a private copy.
const { MARKERS, MARKER_CLASS } = require('../../lib/core/state-marks.js');
export const STATE_MARKERS = MARKERS.join('');
export { MARKER_CLASS };

/** flow: the incumbent's escapable set and its `&` placeholder. */
export const ASCII_PUNCT = '!"#$%&\'()*+,-./:;<=>?@[\\]^_`{|}~';
export const ESC_AMP = '\u0001';
export const LABEL_MAX = 60;
export const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r';
