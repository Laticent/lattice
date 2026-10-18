/**
 * lib/core/meta-record.mjs
 *
 * THE ONE READER AND WRITER of slide metadata that lives in an HTML comment. It is what
 * `scanMetaSource` / `readMeta` / `writeMeta` of the design note
 * (engineering/decisions/2026-10-17-meta-record.md §5.2, step 1) name, built over the comment
 * grammar the tree has today (`<!-- _key: value -->`, lib/core/comment-directive.mjs). It adds
 * no syntax: step 1 of that note is the consolidation that every later syntax stands on.
 *
 * WHY ONE MODULE. Forty-two modules each re-spelled a comment reader for their own key
 * (`_class`, `_pane`, `_focusSteps`, `_lens`, `_track`, the notes, the Studio's edits), and five kept
 * their own list of which keys exist. A reader that re-spells the grammar re-spells the half it
 * noticed: the class scan's regex never saw the running global form, and a quoted example in prose
 * took the directive's place (engineering/decisions/2026-08-05-one-class-directive-reader.md).
 * This module is the home those readers move onto:
 *
 *   · the VOCABULARY (which keys exist, which are bare-able, deck-only, applied) is
 *     lib/core/meta-keys.mjs, derived from the `meta` plugin's manifest;
 *   · the GRAMMAR (how one comment parses) is lib/core/comment-directive.mjs;
 *   · WHERE a slide begins is lib/core/slide-boundaries.mjs, which asks the engine's own parser;
 *   · THIS module adds the walk (fences, comment blocks, containers, slide ends), the per-slide
 *     resolution (a spot key replaces the running global of the same key, per key), the
 *     classification a notes extractor needs (directive, marker, or note). The structured edit the
 *     Studio drawer uses is lib/core/meta-edit.mjs, a separate module so the linter's browser bundle,
 *     which only reads, does not carry it (docs/route-budget.json `lintCoreGz`).
 *
 * A LINE SCAN FOR THE COMMENTS, THE PARSER FOR THE BOUNDARIES: the scan in
 * lib/core/class-directive-scan.mjs became this walk, generalized from one key to all of them, and
 * that module is now a thin view over it. Its corpus gate (274 of 276 decks, 0 disagreements)
 * holds for every key here: test/unit/core/meta-record-corpus.test.js.
 *
 * Pure, fs-free and dependency-free past its siblings (HARD RULE #7), so the linter, the editor's
 * completion and the Node render path all run it. ESM so the editor imports it as source.
 */

import { readDirectiveComment } from './comment-directive.mjs';
import { DIRECTIVE_VOCAB, FLAG_KEYS, KNOWN_KEYS, MARKER_NAMES } from './meta-keys.mjs';
import { chunkBoundaryLines, normalizeSourceText } from './slide-boundaries.mjs';

// ── Reading one comment ─────────────────────────────────────────────────────

/**
 * Parse ONE whole `<!-- … -->` comment as a directive.
 * @param {string} raw  the comment including its delimiters.
 * @param {{known: Set<string>, flags?: Set<string>}} [vocab]  defaults to the whole vocabulary.
 * @returns {{spot: boolean, key: string, value: string} | null}
 */
export function readMeta(raw, vocab = DIRECTIVE_VOCAB) {
  return readDirectiveComment(raw, vocab);
}

/** The marker a whole comment names (`<!-- stress-slide -->`), or null. */
export function readMarker(raw) {
  const text = String(raw ?? '').trim();
  if (!text.startsWith('<!--') || !text.endsWith('-->')) return null;
  const name = text.slice(4, -3).trim();
  return MARKER_NAMES.has(name) ? name : null;
}

/** True when `text` carries the marker `name` as a comment of its own, outside a code fence. */
export function hasMarker(text, name) {
  if (!MARKER_NAMES.has(name)) return false;
  return comments(text).some((c) => c.body.trim() === name);
}

/**
 * A record-shaped comment: the first thing after `<!--` is `{` or `@meta{`. The typed record
 * (design note §4) is read by a later step; step 1 only RECOGNIZES the shape, so the linter can
 * flag a record in a position no step will read. The notes extractor does not yet treat one as tooling (a
 * record comment is a speaker note until step 2 reads it).
 */
export function isRecordBody(body) {
  const t = String(body ?? '').trimStart();
  return t.startsWith('{') || t.startsWith('@meta{');
}

/**
 * The key of a comment body's FIRST directive line (leading `_` stripped), or '' when the body
 * opens with prose. A key alone with no colon counts only for a bare-able (flag) key, so
 * `<!-- remember … -->` is never read as `remember`.
 * @param {string} body
 * @returns {string}
 */
export function directiveKey(body) {
  const t = String(body ?? '').trim();
  const m = /^_?([A-Za-z][\w-]*)\s*(:|$)/.exec(t);
  if (!m) return '';
  const key = m[1];
  if (!m[2] && !FLAG_KEYS.has(key)) return '';
  return KNOWN_KEYS.has(key) ? key : '';
}

// ── Fences and comments inside one chunk of text ────────────────────────────

/** The column a line's leading whitespace reaches; a tab advances to the next multiple of four. */
function indentWidth(ws) {
  let col = 0;
  for (const ch of ws) col = ch === '\t' ? col + 4 - (col % 4) : col + 1;
  return col;
}

/**
 * Char ranges `[start, end)` covered by fenced code blocks (``` / ~~~). An unterminated fence masks
 * to the end of the string, as a renderer reads it. A CLOSER may be indented at most three columns
 * past the container the fence sits in (CommonMark §4.5), so it is bounded at the opener's column
 * plus three: exact at top level, never too tight inside a list item.
 * @param {string} text
 * @returns {Array<[number, number]>}
 */
export function fenceRanges(text) {
  const ranges = [];
  const src = String(text ?? '');
  let pos = 0;
  let open = null;
  for (const line of src.split('\n')) {
    const lineStart = pos;
    const lineEnd = pos + line.length;
    const fm = line.match(/^([ \t]*)(`{3,}|~{3,})(.*)$/);
    if (fm) {
      const indent = indentWidth(fm[1]);
      const char = fm[2][0];
      const len = fm[2].length;
      if (!open) open = { char, len, start: lineStart, maxCloseIndent: indent + 3 };
      else if (open.char === char && len >= open.len && fm[3].trim() === '' && indent <= open.maxCloseIndent) {
        ranges.push([open.start, lineEnd]);
        open = null;
      }
    }
    pos = lineEnd + 1; // + the '\n'
  }
  if (open) ranges.push([open.start, src.length]);
  return ranges;
}


/**
 * Every HTML comment in `chunk` that is NOT inside a fenced code block, in order.
 * @param {string} chunk
 * @returns {Array<{start: number, end: number, body: string, bodyStart: number}>}
 */
export function comments(chunk) {
  const text = String(chunk ?? '');
  const fences = fenceRanges(text);
  const out = [];
  // LINEAR: pair each opener with the first `-->` after it by indexOf, and stop when none is left.
  // The lazy regex this replaced (`/<!--([\s\S]*?)-->/g`) rescans to the end for every opener that
  // has no close, so 100 KB of `<!--` ran 0.8s and 250 KB ran 5.4s, on untrusted text in the Studio.
  let at = text.indexOf('<!--');
  let f = 0; // both lists are sorted, so one advancing pointer replaces a scan of every fence per comment
  while (at !== -1) {
    const close = text.indexOf('-->', at + 4);
    if (close === -1) break;
    while (f < fences.length && fences[f][1] <= at) f++;
    const fenced = f < fences.length && at >= fences[f][0];
    if (!fenced) out.push({ start: at, end: close + 3, body: text.slice(at + 4, close), bodyStart: at + 4 });
    at = text.indexOf('<!--', close + 3);
  }
  return out;
}

// ── The walk: every comment that can be a directive, per slide ──────────────

/** A fence opener, allowing CommonMark's up-to-3-space indent. */
const FENCE_OPEN = /^\s{0,3}(`{3,}|~{3,})/;
const FENCE_CLOSE = /^\s{0,3}(`{3,}|~{3,})\s*$/;

/**
 * A comment that OPENS its line's content, the only shape that can be a directive.
 *
 * markdown-it opens an `html_block` for a comment only when `<!--` begins the line (after at most
 * three spaces), and the engine reads directives off that token. A comment that starts mid-sentence
 * is a `code_inline` or `text` child and is PROSE, which is what makes a quoted example in a bullet
 * harmless. Container prefixes still count as the beginning, because markdown-it opens the
 * `html_block` INSIDE the container (`> <!-- … -->`, `- <!-- … -->`, `1. <!-- … -->` all render).
 * `[ ]{0,3}` rather than `\s{0,3}`: a TAB-indented line is an indented code block.
 */
const COMMENT_OPEN = /^[ ]{0,3}(?:>[ \t]*|(?:[-*+]|\d{1,9}[.)])[ \t]+)*<!--/;

/** The block runs to the line that closes it, by `-->` only: markdown-it does not end at `--!>`. */
const commentCloses = (line) => line.includes('-->');

/**
 * Walk lines and report each comment that can be a directive, plus where each slide ends.
 *
 * @param {(n: number) => string} getLine  1-based line accessor (the editor adapts CodeMirror's
 *   doc; `scanMetaSource` adapts a string).
 * @param {number} lineCount  how many lines to walk. The editor walks to the CURSOR, not the end:
 *   "the directive above the cursor" is the contract completion has always had.
 * @param {(n: number) => boolean} isBoundary  is 1-based line `n` a slide boundary? Supplied by the
 *   caller because the ONE answer is `chunkBoundaryLines` (the engine's own parser).
 * @param {{
 *   vocab?: {known: Set<string>, flags?: Set<string>},
 *   onComment?: (c: {line: number, endLine: number, raw: string, indent: string, prefixed: boolean,
 *     dir: {spot: boolean, key: string, value: string} | null, marker: string | null, record: boolean,
 *     bareOpener: boolean}) => void,
 *   onSlideEnd?: () => void,
 * }} hooks
 */
export function walkComments(getLine, lineCount, isBoundary, { vocab = DIRECTIVE_VOCAB, onComment, onSlideEnd } = {}) {
  let inFence = false;
  // The CLOSE pattern is built once when a fence OPENS, not per line inside it: an unterminated
  // fence in an untrusted deck cost ~136ms per keystroke on a 200k-line body when it was per line.
  let fenceClose = null;
  // An opener that found no `-->` before EOF means no later line holds one either, so every later
  // opener is unterminated too: skip them instead of rescanning to EOF each time (100 KB of
  // `<!-- open` lines took 3.3 s).
  let exhausted = false;

  for (let n = 1; n <= lineCount; n++) {
    const start = n;
    const line = getLine(n) ?? '';
    // THE BOUNDARY CHECK COMES FIRST. markdown-it naming a TOP-LEVEL `hr` at this line is itself
    // proof that no fenced block and no `html_block` is open here, so it outranks this walk's
    // approximate block tracking.
    if (isBoundary(n)) {
      if (onSlideEnd) onSlideEnd();
      continue;
    }
    if (inFence) {
      const close = FENCE_CLOSE.exec(line);
      if (close && close[1][0] === fenceClose.char && close[1].length >= fenceClose.length) {
        inFence = false;
        fenceClose = null;
      }
      continue;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) {
      inFence = true;
      fenceClose = { char: open[1][0], length: open[1].length };
      continue;
    }
    if (exhausted || !COMMENT_OPEN.test(line)) continue;
    // A comment may span lines (`<!--\n_class: kpi\n-->`); the engine reads one html_block token.
    // Test the NEW line for the close, never the accumulated buffer: re-scanning it is O(n²) and an
    // unterminated `<!--` in a 32k-line deck took 8s against 5ms clean.
    const at = line.indexOf('<!--');
    const opener = line.slice(at);
    const lead = line.slice(0, at);
    let raw = opener;
    let close = n;
    let closed = commentCloses(opener);
    while (!closed && close < lineCount) {
      close += 1;
      const next = getLine(close) ?? '';
      raw += `\n${next}`;
      closed = commentCloses(next);
    }
    if (!closed) { exhausted = true; continue; } // unterminated: markdown-it runs it to EOF; no directive
    // The consumed lines are still put to the boundary oracle: a `---` inside a multi-line comment
    // (commenting out a run of slides) is not a boundary, and the oracle says so.
    for (let k = start + 1; k <= close; k++) if (isBoundary(k) && onSlideEnd) onSlideEnd();
    n = close;
    if (!onComment) continue;
    const text = raw.trim();
    const inner = text.slice(4, -3);
    onComment({
      line: start,
      endLine: close,
      raw: text,
      indent: lead,
      // Anything before `<!--` other than up to three spaces is a container prefix (`> `, `- `).
      prefixed: !/^ {0,3}$/.test(lead),
      dir: readDirectiveComment(text, vocab),
      marker: readMarker(text),
      record: isRecordBody(inner),
      // `<!--` alone, the record on the NEXT line: not a record (design note §5.3). A record has a
      // `name=value` pair, so a note whose second line merely starts with a brace (`{pause} …`) is not one.
      bareOpener: /^\s*\n\s*(?:\{[^}\n]*=|@meta\{)/.test(inner),
    });
  }
}

/**
 * @typedef {object} MetaComment
 * @property {number} line      1-based line the comment opens on
 * @property {number} endLine   1-based line it closes on
 * @property {string} raw       the comment, delimiters included
 * @property {'directive'|'marker'|'record'|'note'} kind
 * @property {string} [key]     a directive's key
 * @property {boolean} [spot]   a directive written with the `_` (this slide only)
 * @property {string} [value]   a directive's value, quotes stripped
 * @property {string} [marker]  a marker's name
 * @property {boolean} prefixed inside a list item or blockquote
 * @property {boolean} bareOpener a bare `<!--` with the record on the next line
 */

/**
 * @typedef {object} MetaEntry  the directive that wins for one key on one slide
 * @property {string} value
 * @property {string} text      the winning comment, verbatim: what a lint finding quotes back
 * @property {number} line      its 1-based document line
 * @property {boolean} spot
 */

/**
 * Every comment of the source that can be a directive, indexed EXACTLY as `splitTopLevel(source)`
 * indexes its chunks (front-matter chunks included), and the per-key resolution of each slide.
 *
 * RESOLUTION IS THE ENGINE'S RULE, per key: a spot (`_key`) replaces the running global (`key`),
 * the LAST spot on a slide wins, a global applies from its own slide onward, and a spot lasts one
 * slide (`lib/engine/slides.js`: `{ ...runningGlobal, ...slideLocal }`).
 *
 * @param {string} source
 * @param {{vocab?: {known: Set<string>, flags?: Set<string>}}} [opts]
 * @returns {{slides: Array<{comments: MetaComment[], resolved: Map<string, MetaEntry>}>}}
 */
export function scanMetaSource(source, { vocab = DIRECTIVE_VOCAB } = {}) {
  // THE ENGINE'S LINE GEOMETRY, because the boundary line numbers are counted in it: `\r\n` and a
  // lone `\r` fold to `\n`, a BOM is dropped, and U+2028 / U+2029 are NOT terminators.
  const lines = normalizeSourceText(String(source ?? '')).split('\n');
  const boundaries = new Set(chunkBoundaryLines(source).map((ln) => ln + 1));
  return { slides: walkSlides((n) => lines[n - 1], lines.length, (n) => boundaries.has(n), vocab) };
}

/** The walk plus the resolution, shared by `scanMetaSource` and `metaAt` (lib/core/class-directive-scan.mjs). */
export function walkSlides(getLine, lineCount, isBoundary, vocab) {
  const slides = [];
  const globals = new Map();
  let spots = new Map();
  let list = [];
  const resolveNow = () => {
    const out = new Map(globals);
    for (const [k, v] of spots) out.set(k, v);
    return out;
  };
  const endSlide = () => {
    slides.push({ comments: list, resolved: resolveNow() });
    spots = new Map();
    list = [];
  };
  walkComments(getLine, lineCount, isBoundary, {
    vocab,
    onSlideEnd: endSlide,
    onComment: (c) => {
      const base = { line: c.line, endLine: c.endLine, raw: c.raw, prefixed: c.prefixed, bareOpener: c.bareOpener };
      if (c.dir) {
        list.push({ ...base, kind: 'directive', key: c.dir.key, spot: c.dir.spot, value: c.dir.value });
        const entry = { value: c.dir.value, text: c.raw, line: c.line, spot: c.dir.spot };
        // LAST spot on a slide wins; a global lands on its own slide too unless a spot names the key.
        (c.dir.spot ? spots : globals).set(c.dir.key, entry);
      } else if (c.marker) {
        list.push({ ...base, kind: 'marker', marker: c.marker });
      } else {
        list.push({ ...base, kind: c.record ? 'record' : 'note' });
      }
    },
  });
  endSlide();
  return slides;
}

export default { scanMetaSource, walkComments, walkSlides, readMeta, readMarker, hasMarker, directiveKey, comments, fenceRanges };
