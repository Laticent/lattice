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
 *   · WHICH COMMENTS ARE BLOCKS is the deck model's (lib/core/directive-island.mjs reads its comment ranges
 *     as islands, Segno P3);
 *   · THE SCAN, in lib/core/meta-scan.mjs and re-exported here, adds the per-slide resolution (a spot key replaces
 *     the running global of the same key, per key) and the classification a notes extractor needs (directive,
 *     marker, or note);
 *   · THIS module keeps the readers of one comment and of one chunk's comments, which the editors use. The structured edit the
 *     Studio drawer uses is lib/core/meta-edit.mjs, a separate module so the linter's browser bundle,
 *     which only reads, does not carry it (docs/route-budget.json `lintCoreGz`).
 *
 * ONE PARSE FOR THE COMMENTS AND THE BOUNDARIES. This used to be a line scan for the comments (its own fence and
 * opener regexes) beside the parser for the boundaries; the scan approximated block structure and the parser
 * decided it. Both now read one deck model, from the memo `slideBoundaries` keeps
 * (engineering/decisions/2026-10-22-segno-deck-pipeline.md §P3 landed). The corpus gate (every key, 0
 * disagreements) is test/unit/core/meta-record-corpus.test.js; the engine differential is
 * test/unit/core/directive-island.test.js.
 *
 * Pure, fs-free and dependency-free past its siblings (HARD RULE #7), so the linter, the editor's
 * completion and the Node render path all run it. ESM so the editor imports it as source.
 */

import { readDirectiveComment } from './comment-directive.mjs';
import { deckModel } from './deck-model.mjs';
import { directiveIslands } from './directive-island.mjs';
import { DIRECTIVE_VOCAB, MARKER_NAMES } from './meta-keys.mjs';

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
 * Every HTML comment in `chunk` that is NOT inside a fenced code block, in order, inline ones included.
 *
 * This is the NOTES channel's reader (the speaker note, `describe:`, `say:`): the engine's notes reader takes a
 * comment from an inline `html_inline` token as well as from a block (lib/authoring/notes-core.js
 * `liveCommentOpeners`), so a note may sit mid-line. A DIRECTIVE is read only off a comment block, so the directive
 * editors read `commentBlocks`, the deck model's answer.
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

/**
 * The positions in `text` of each character of its S0 text (BOM dropped, `\r\n` and `\r` folded to `\n`), one past
 * the end included; null when S0 changes nothing, so offsets carry over as they are.
 */
function s0Offsets(text, s0) {
  if (s0 === text) return null;
  const at = new Int32Array(s0.length + 1);
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  for (let k = 0; k < s0.length; k++, i++) {
    at[k] = i;
    if (text.charCodeAt(i) === 0x0d && text.charCodeAt(i + 1) === 0x0a) i++;
  }
  at[s0.length] = text.length;
  return at;
}

/**
 * Every HTML comment in `chunk` that the engine reads a DIRECTIVE from, in order: the comments inside the deck
 * model's comment blocks (lib/core/directive-island.mjs), so never one in a fence, an indented code block, another
 * HTML block (`<div>` / `<!-- _class: kpi -->` / `</div>` folds the comment into the `<div>` block), a paragraph's
 * line, or a comment block its list item ended before `-->`. The front matter is split as the engine splits it.
 *
 * The Studio's directive editors read this (the class editor's `getClassTokens` / `setClassTokens` through
 * `readMetaField`, lib/core/meta-edit.mjs; the asset rename). A block counts only when its content is one whole
 * comment, because the engine reads a directive off the whole block (`<!-- _class: kpi --> tail` is none). `comments`
 * is the notes channel's reader, which also counts inline comments. Offsets index `chunk` as given.
 *
 * NOT YET EXACT for one shape: a multi-line comment inside a blockquote (`> <!--` / `> _class: kpi` / `> -->`) is a
 * directive to the engine, but its `body` here still carries the `> ` prefixes, so `readMetaField`'s key probe misses
 * it and the editor shows no class. The old text scan missed it the same way.
 * @param {string} chunk
 * @returns {Array<{start: number, end: number, body: string, bodyStart: number}>}
 */
export function commentBlocks(chunk) {
  const text = String(chunk ?? '');
  if (!text.includes('<!--')) return [];
  const model = deckModel(text);
  const map = s0Offsets(text, model.text);
  const src = model.text;
  const out = [];
  for (const island of directiveIslands(model)) {
    // The engine reads a directive off the block's WHOLE content, so a block is one only when it is one comment and
    // nothing else: `<!-- _class: kpi --> tail` or `<!-- a --> <!-- b -->` is read as no directive at all.
    const whole = island.content;
    if (!island.closed || !whole.startsWith('<!--') || whole.indexOf('-->', 4) !== whole.length - 3) continue;
    const from = model.bodyStart + model.lineStart(island.fromLine) + island.indent.length;
    const to = model.bodyStart + model.lineEnd(island.toLine - 1);
    for (let at = src.indexOf('<!--', from); at !== -1 && at < to; ) {
      const close = src.indexOf('-->', at + 4);
      if (close === -1 || close + 3 > to) break;
      const start = map ? map[at] : at;
      const end = map ? map[close + 3] : close + 3;
      const bodyStart = start + 4;
      out.push({ start, end, body: text.slice(bodyStart, map ? map[close] : close), bodyStart });
      at = src.indexOf('<!--', close + 3);
    }
  }
  return out;
}

// ── The per-slide scan, from lib/core/meta-scan.mjs ──────────────────────────

// The scan the linter reads lives in its own module, so the linter's browser bundle carries the scan and not this
// module's editing helpers (`comments`, `fenceRanges`), which the Studio's editors use (docs/route-budget.json
// `lintCoreGz`). Re-exported here so every caller of this module is unchanged.
export { directiveKey, hasMarker, scanMetaSource } from './meta-scan.mjs';
