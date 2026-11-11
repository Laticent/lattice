/**
 * lib/core/meta-internal.mjs
 *
 * The engine's INTERNAL metadata comment, `<!-- lat-meta: {…} -->`: what the door (lib/core/meta-door.mjs) writes in
 * place of each authored record, and what every reader after the door reads. A leaf with no parser in it, so the
 * render pipeline's token rule (lib/engine/slides.js `lattice_meta_expand`) and the source readers that only meet
 * the door's output (plugin admission, the background-image lift) read it without carrying Segno.
 * Design: engineering/decisions/2026-10-17-meta-record.md §5.1.
 *
 * Pure and dependency-free past the vocabulary (HARD RULE #7).
 */

import { FLAG_KEYS, GLOBAL_ONLY_KEYS, KNOWN_KEYS, MARKER_NAMES, STRUCTURE_KEYS } from './meta-keys.mjs';

/** The note channels a record carries (§4.4). `note` is the speaker note; the rest are their own channels. */
export const NOTE_FIELDS = Object.freeze(['note', 'reader', 'say', 'describe']);

/**
 * The keys a SLIDE record may set: every directive key but the deck-only ones (`theme`, `lang`, `size`, `marp`,
 * §4.3), which pick the bundle before any slide is read. Front matter is their one home (D10).
 */
export const SLIDE_KEYS = new Set([...KNOWN_KEYS].filter((k) => !GLOBAL_ONLY_KEYS.has(k)));

// Control characters (but tab and newline) and the bidi overrides U+202A–202E, U+2066–2069 never reach a value (§5.7).
// biome-ignore lint/suspicious/noControlCharactersInRegex: the point of the pattern is to find them
export const UNSAFE_CHARS = /[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g;

/** The internal comment, recognized whole (the door's own output, padded to the record's line count). */
export const INTERNAL_META_RE = /^<!--\s*lat-meta:\s*(\{[\s\S]*\})\s*-->$/;

/**
 * Write the internal comment for one read record. `<` and `>` in any value are `\u003c` and `\u003e`, so no value
 * can end the comment (`-->` or `--!>`) or open markup; `lines` pads it to the record's own line count.
 */
export function writeInternal(rec, lines = 1) {
  const payload = { carry: Boolean(rec.carry), d: rec.d ?? {} };
  for (const k of NOTE_FIELDS) if (rec.notes?.[k]?.length) payload[k] = rec.notes[k];
  if (rec.markers?.length) payload.markers = rec.markers;
  const json = JSON.stringify(payload).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
  return `<!-- lat-meta: ${json}${'\n'.repeat(Math.max(0, lines - 1))} -->`;
}

/**
 * Read an internal comment back, validating every value by type REGARDLESS of where the comment came from: string
 * values only, keys from the slide vocabulary only, deck-only keys refused (§5.1 item 4). Null for anything else.
 * @returns {null | {carry: boolean, d: Record<string,string>, notes: Record<string,string[]>, markers: string[]}}
 */
export function readInternal(raw) {
  const m = INTERNAL_META_RE.exec(String(raw ?? '').trim());
  if (!m) return null;
  let p;
  try {
    p = JSON.parse(m[1]);
  } catch {
    return null;
  }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
  const d = {};
  if (p.d && typeof p.d === 'object' && !Array.isArray(p.d)) {
    for (const [k, v] of Object.entries(p.d)) {
      // Single-line, and never a comment terminator: the value is re-wrapped in a comment (`expandInternal`).
      if (typeof v !== 'string' || /[\r\n]/.test(v) || /--!?>/.test(v)) continue;
      if (SLIDE_KEYS.has(k) || STRUCTURE_KEYS.has(k)) d[k] = v.replace(UNSAFE_CHARS, '');
    }
  }
  const notes = {};
  for (const k of NOTE_FIELDS) {
    if (Array.isArray(p[k])) notes[k] = p[k].filter((s) => typeof s === 'string');
  }
  const markers = Array.isArray(p.markers) ? p.markers.filter((s) => MARKER_NAMES.has(s)) : [];
  return { carry: p.carry === true, d, notes, markers };
}

/**
 * The directive entries of one internal comment, `{spot, key, value}` each, in the shape `readDirectiveComment`
 * returns, filtered to `vocab` when one is given. Pane structure keys come back too (`pane`, `panes`).
 */
export function internalEntries(raw, vocab) {
  const rec = readInternal(raw);
  if (!rec) return [];
  return Object.entries(rec.d)
    .filter(([k]) => !vocab?.known || vocab.known.has(k))
    .map(([key, value]) => ({ spot: !rec.carry, key, value }));
}

// ── The carrier escape (§10) ────────────────────────────────────────────────

/**
 * A comment cannot hold `-->`, and a browser also ends one at `--!>`. The escape is applied at the CARRIER, before
 * the Segno parse, because Segno keeps `\>` verbatim: `--\>` is `-->`, `--!\>` is `--!>`, and each further
 * backslash is a literal one (`--\\>` is `--\>`). `encodeCommentText` is its inverse, for a producer writing text
 * back into a comment.
 */
export function decodeCommentText(text) {
  return String(text ?? '').replace(/--(!?)(\\+)>/g, (_, bang, slashes) => `--${bang}${slashes.slice(1)}>`);
}

/** Text → a form that can sit inside `<!-- … -->` and come back unchanged through `decodeCommentText`. */
export function encodeCommentText(text) {
  return String(text ?? '').replace(/--(!?)(\\*)>/g, (_, bang, slashes) => `--${bang}\\${slashes}>`);
}

/**
 * One internal comment as the directive comments every token rule after it reads (lib/engine/slides.js
 * `lattice_meta_expand`): one block per key, `_key: value` for a spot record and `key: value` for a `carry` one, in
 * the record's order, then its markers, its pane structure, and its note channels. Each `text` is a whole comment.
 * A `note` is a `lat-note:` comment, the speaker note in the engine's own form; `noteOnly` marks it too. Null when `raw` is not an
 * internal comment.
 * @returns {null | Array<{text: string, noteOnly: boolean}>}
 */
export function expandInternal(raw) {
  const rec = readInternal(raw);
  if (!rec) return null;
  const out = [];
  const one = (text, noteOnly = false) => out.push({ text, noteOnly });
  for (const [key, value] of Object.entries(rec.d)) {
    if (key === 'pane') one(`<!-- _pane: ${value} -->`);
    else if (key === 'panes') one(`<!-- panes: ${value} -->`);
    // An empty value is written `""`, which the reader strips to the empty value (`{header=""}` clears the slide's
    // header, as `<!-- _header: '' -->` does); only a flag key (`{build}`) is written bare.
    else one(`<!-- ${rec.carry ? '' : '_'}${key}${value === '' && FLAG_KEYS.has(key) ? '' : `: ${value === '' ? '""' : quoteIfQuoted(value)}`} -->`);
  }
  for (const m of rec.markers) one(`<!-- ${m} -->`);
  for (const t of rec.notes.say ?? []) one(`<!-- say: ${encodeCommentText(oneLine(t))} -->`);
  for (const t of rec.notes.describe ?? []) one(`<!-- describe: ${encodeCommentText(t)} -->`);
  // A record's note is written in the engine's own note form, `lat-note:`, which no reader can take for anything else: a
  // plain comment reading `_pane: bar` was a pane marker to the carve, and `reader: …` moved the note into the reader
  // channel (the red team, 2026-11-10). The notes extractor reads it back as the speaker note (lib/authoring/notes-core.js).
  for (const t of rec.notes.note ?? []) if (t.trim()) one(`<!-- lat-note: ${encodeCommentText(t)} -->`, true);
  for (const t of rec.notes.reader ?? []) if (t.trim()) one(`<!-- reader: ${encodeCommentText(t)} -->`);
  return out;
}

/** The directive reader strips ONE layer of matching quotes; a value that is itself quoted keeps its own. */
function quoteIfQuoted(v) {
  const q = v[0];
  return v.length >= 2 && (q === '"' || q === "'") && v[v.length - 1] === q ? `"${v}"` : v;
}

/** `say:` is a one-line channel; a `|` block's lines join with a space. */
function oneLine(t) {
  return String(t).split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
}

/** A value Segno reads back unchanged with no quotes: words, numbers and a few safe marks, no edge spaces. */
const BARE = /^[\p{L}\p{N}#][\p{L}\p{N} ._\-/%#:'·]*$/u;

/** A record value: bare when it round-trips, else quoted with `\` and `"` escaped. Shared by the migration and the
 * structured edit (lib/core/meta-migrate.mjs, meta-edit.mjs), here so the editor does not ship the migration. */
export function recordValue(v) {
  const s = String(v ?? '');
  if (BARE.test(s) && !s.endsWith(' ')) return s;
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}
