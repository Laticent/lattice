/**
 * lib/core/note-grammar.mjs
 *
 * The one grammar for a slide's four notes. A note is an HTML comment whose whole body is `@name{…}`, with `name` one
 * of `note`, `say`, `alt`, `handout`:
 *
 *   <!-- @note{Open on the drop.} -->        speaker notes: Present, the PPTX notes field, the PDF note annotation
 *   <!-- @say{The pipeline holds…} -->       the voice and the captions: TTS, read-along, the `.vtt` sidecar
 *   <!-- @alt{Funnel chart: 12,000…} -->     alt text: screen readers, PPTX alt text, `aria-describedby`
 *   <!-- @handout{Measured over 30 days.} --> the handout and the player's read view
 *
 * Any other comment is NOT a note: it reaches no rendered, spoken or annotated surface. Every reader of a note (the
 * notes extractor, the privacy scrubs, lint, the Studio) asks this module, so there is one answer to "is this a note,
 * and which one". Design: engineering/decisions/2026-11-20-four-notes.md.
 *
 * Pure and fs-free (HARD RULE #7). The names come from the `meta` plugin's manifest (`notes`), through the vocabulary.
 */

import { NOTE_NAMES } from './meta-keys.mjs';

export { NOTE_NAMES };

const NAME_SET = new Set(NOTE_NAMES);

// `@word{` at the start of the trimmed body. The word is matched in ANY case so a near miss (`@Say{`) can be named by
// lint; only an exact lowercase name is a note.
const OPENER = /^@([A-Za-z][\w-]*)\{/;

/** `\{` and `\}` are literal braces in a body; nothing else is an escape, so a path like `C:\Users` reads as written. */
const unescapeBraces = (s) => s.replace(/\\([{}])/g, '$1');

/** A comment cannot hold `-->` or `--!>`, so a body writes `--\>` (`--!\>`), each further backslash a literal one;
 *  reading removes one backslash (the escape lib/core/meta-internal.mjs `decodeCommentText` reads for a record). */
const decodeArrows = (s) => s.replace(/--(!?)(\\+)>/g, (_, bang, slashes) => `--${bang}${slashes.slice(1)}>`);

/** True when every brace in `s` closes in order, so it can be written without escapes. */
function balanced(s) {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && (s[i + 1] === '{' || s[i + 1] === '}')) return false; // a written escape must itself be escaped
    if (s[i] === '{') depth++;
    else if (s[i] === '}' && --depth < 0) return false;
  }
  return depth === 0;
}

/**
 * Where the brace that opens at `open` closes, counting nested braces; -1 when it never does.
 * @param {string} s
 * @param {number} open index of the `{`
 * @returns {number}
 */
function matchingBrace(s, open) {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    const c = s[i];
    if (c === '\\' && (s[i + 1] === '{' || s[i + 1] === '}')) i++; // an escaped brace is text
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return i;
  }
  return -1;
}

/**
 * Strip the indentation every non-blank line shares, so a note written indented inside its comment reads flush.
 * @param {string} s
 * @returns {string}
 */
function dedent(s) {
  const lines = s.replace(/\r\n?/g, '\n').split('\n');
  let min = Infinity;
  for (const l of lines) if (l.trim()) min = Math.min(min, /^[ \t]*/.exec(l)[0].length);
  return min === Infinity || min === 0 ? lines.join('\n') : lines.map((l) => l.slice(Math.min(min, /^[ \t]*/.exec(l)[0].length))).join('\n');
}

/**
 * The SHAPE of a comment body, for readers that must tell a note from a near miss:
 *
 * - `{ kind: 'note', name, text }` — a note. `text` is the body between the braces, dedented, trimmed and decoded
 *   (`\{` → `{`, `--\>` → `-->`): the words as the author meant them.
 * - `{ kind: 'unknown', name }` — `@word{…}` whose word is not a note name (`@speaker{…}`, `@Say{…}`). Not a note.
 * - `{ kind: 'unbalanced', name }` — a note name whose braces never close. Not a note.
 * - `{ kind: 'trailing', name }` — a note name with text after its closing brace. Not a note.
 * - `null` — not `@word{` at all: a plain comment, a directive, a record.
 *
 * `@meta{…}` is the record's long form (lib/core/meta-door.mjs), never a note, and reads as `null` here.
 *
 * @param {string} raw comment body (between `<!--` and `-->`), trimmed or not
 * @returns {null | {kind: 'note', name: string, text: string} | {kind: 'unknown'|'unbalanced'|'trailing', name: string}}
 */
export function noteShape(raw) {
  const t = String(raw ?? '').trim();
  const m = OPENER.exec(t);
  if (!m || m[1] === 'meta') return null;
  const name = m[1];
  if (!NAME_SET.has(name)) return { kind: 'unknown', name };
  const close = matchingBrace(t, m[0].length - 1);
  if (close < 0) return { kind: 'unbalanced', name };
  if (close !== t.length - 1) return { kind: 'trailing', name };
  return { kind: 'note', name, text: decodeArrows(unescapeBraces(dedent(t.slice(m[0].length, close)).trim())) };
}

/**
 * The note a comment body holds, or null when it holds none.
 * @param {string} raw comment body
 * @returns {null | {name: 'note'|'say'|'alt'|'handout', text: string}}
 */
export function readNote(raw) {
  const s = noteShape(raw);
  return s && s.kind === 'note' ? { name: s.name, text: s.text } : null;
}

/**
 * Write one note as the comment an author would type. A body that holds `-->` or `--!>` is escaped (`--\>`), the
 * escape the readers undo (lib/authoring/notes-core.js `decodeNoteText`). A body whose braces do not balance has every
 * brace escaped (`\{`, `\}`), and one that ends in a backslash gets a space before the closing brace, so any text
 * round-trips through `readNote`.
 * @param {'note'|'say'|'alt'|'handout'} name
 * @param {string} text
 * @returns {string}
 */
export function writeNote(name, text) {
  if (!NAME_SET.has(name)) throw new TypeError(`writeNote: "${name}" is not a note name (${NOTE_NAMES.join(', ')})`);
  let body = String(text ?? '').trim();
  if (!balanced(body)) body = body.replace(/[{}]/g, '\\$&');
  body = body.replace(/--(!?)(\\*)>/g, (_, bang, slashes) => `--${bang}\\${slashes}>`);
  // A body that ENDS in a backslash would escape the note's own closing brace (`@note{C:\}` never closes). One space
  // before the brace keeps it a brace; the reader trims the space away.
  if (body.endsWith('\\')) body += ' ';
  return `<!-- @${name}{${body}} -->`;
}
