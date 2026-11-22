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

import { boundaryParser } from './boundary-parser.mjs';
import { readDirectiveComment } from './comment-directive.mjs';
import { deckModel, deckParser } from './deck-model.mjs';
import { directiveIslands } from './directive-island.mjs';
import { fenceRanges } from './fence-ranges.mjs';
import { DIRECTIVE_VOCAB, MARKER_NAMES } from './meta-keys.mjs';

export { fenceRanges };

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

/**
 * Every HTML comment in `chunk` the engine renders as a comment, in order, inline ones included.
 *
 * This is the NOTES channel's reader (the speaker note, `describe:`, `say:`): the engine's notes reader takes a
 * comment from an inline `html_inline` token as well as from a block (lib/authoring/notes-core.js
 * `liveCommentOpeners`), so a note may sit mid-line. A DIRECTIVE is read only off a comment block, so the directive
 * editors read `commentBlocks`.
 *
 * WHERE A COMMENT IS LIVE comes from the deck model's block ranges (Segno P3), not from a fence scan of its own:
 *   · an opener inside an HTML block (a comment block, or a `<div>` block the comment folds into) pairs with the first
 *     `-->` after it, as the block renders raw;
 *   · an opener inside a leaf (a paragraph, a heading, a table row) pairs with the first `-->` inside that same leaf,
 *     because markdown-it's `html_inline` reads only the leaf's own text, so a closer two paragraphs down closes nothing;
 *   · an opener anywhere else is text: a fenced or indented code block, a plugin block (math's `$$`), the front matter,
 *     a link reference definition.
 * Inside a leaf, inline structure is S2's (P4): an opener in a code span still counts here, as it did before the move.
 * Offsets index `chunk` as given (a BOM and `\r\n` are mapped back through S0).
 * @param {string} chunk
 * @param {{ steps: number }} [work]  a test's step counter (HARD RULE #32); callers pass nothing
 * @returns {Array<{start: number, end: number, body: string, bodyStart: number}>}
 */
export function comments(chunk, work) {
  const text = String(chunk ?? '');
  if (!text.includes('<!--')) return [];
  if (work) return readComments(deckModel(text), text, work);
  return remembered('comments', text, readComments);
}

/** Per body line, what kind of block holds it: 0 text, 1 an HTML block, 2 a leaf; and where that block's last line ends. */
function liveLines(model) {
  const kind = new Uint8Array(model.lines + 1);
  const end = new Int32Array(model.lines + 1);
  const mark = (ranges, k) => {
    for (const r of ranges) {
      const to = model.lineEnd(r.toLine - 1);
      for (let L = r.fromLine; L < r.toLine; L++) {
        kind[L] = k;
        end[L] = to;
      }
    }
  };
  mark(model.directives, 1);
  mark(model.html, 1);
  mark(model.leaves, 2);
  // A table cell's inline text has no line range of its own (markdown-it maps none), and where a cell ends is the table
  // rule's split (escaped pipes, cells past the header's count dropped), so a row's comments are markdown-it's answer.
  mark(model.containers.filter((r) => r.type === 'tr'), 3);
  return { kind, end };
}

function readComments(model, text, work) {
  const src = model.text;
  const map = s0Offsets(text, model.text);
  const base = model.bodyStart;
  const out = [];
  let at = src.indexOf('<!--', base);
  if (at === -1) return out;
  const { kind, end } = liveLines(model);
  let inTables = null; // the openers markdown-it reads as comments in a table row, asked once, on the first such opener
  // LINEAR: openers rise, so one advancing line pointer finds each one's line, and the closer is remembered: the first
  // `-->` at or after one opener is the first at or after every later opener short of it, so no opener rescans to a far
  // closer (`'p <!--\n\n'.repeat(n)` with one `-->` at the end searched to it from every paragraph: quadratic).
  let close = -2;
  const closerFrom = (from) => {
    if (close !== -1 && close < from) close = src.indexOf('-->', from);
    return close;
  };
  let line = 0;
  while (at !== -1) {
    if (work) work.steps++;
    while (line + 1 < model.lines && base + model.lineStart(line + 1) <= at) {
      line++;
      if (work) work.steps++;
    }
    const k = kind[line];
    if (k === 0) {
      at = src.indexOf('<!--', at + 4);
      continue;
    }
    const shut = closerFrom(at + 4);
    if (shut === -1) break;
    const live = k === 1 || (k === 2 ? shut + 3 <= base + end[line] : (inTables ??= tableComments(model)).has(at - base));
    if (!live) {
      at = src.indexOf('<!--', at + 4);
      continue;
    }
    const start = map ? map[at] : at;
    const bodyStart = start + 4;
    out.push(Object.freeze({ start, end: map ? map[shut + 3] : shut + 3, body: text.slice(bodyStart, map ? map[shut] : shut), bodyStart }));
    at = src.indexOf('<!--', shut + 3);
  }
  return out;
}

/**
 * The body offsets of the openers markdown-it reads as a comment (`html_inline`) inside a table cell. Each opener is
 * tagged so its token can be traced back, and the body is parsed by the engine's own parser (boundary-parser.mjs), the
 * rule lib/authoring/notes-core.js `liveCommentOpeners` reads notes by. Only a chunk with an opener on a table row
 * pays for it.
 */
function tableComments(model) {
  const body = model.body;
  const hits = [];
  for (let at = body.indexOf('<!--'); at !== -1; at = body.indexOf('<!--', at + 1)) hits.push(at);
  // A tag no text already in the body can equal: one past the largest number written in that shape.
  let n = 0;
  for (const m of body.matchAll(/zq(\d{1,9})tc/g)) n = Math.max(n, Number(m[1]) + 1);
  const tag = `zq${n}tc`;
  let tagged = '';
  let cursor = 0;
  hits.forEach((at, i) => {
    tagged += `${body.slice(cursor, at)}<!--${tag}${i}e`;
    cursor = at + 4;
  });
  tagged += body.slice(cursor);
  const live = new Set();
  const tagRe = new RegExp(`<!--${tag}(\\d+)e`, 'g');
  let cells = 0;
  for (const tok of boundaryParser.parse(tagged, {})) {
    if (tok.type === 'table_open') cells++;
    else if (tok.type === 'table_close') cells--;
    else if (cells > 0 && tok.type === 'inline') {
      for (const child of tok.children || []) {
        if (child.type === 'html_inline') for (const m of child.content.matchAll(tagRe)) live.add(hits[Number(m[1])]);
      }
    }
  }
  return live;
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
  // REMEMBERED BY TEXT. The Studio asks for every slide's blocks several times per keystroke (the class editor's
  // `readClassDirective` per slide, per render), and a keystroke changes one slide. Unremembered, each ask parsed its
  // slide from nothing: measured in the real Studio, 59 full parses per keystroke on the 7-slide starter deck, 594 of
  // 595 from here. The answer depends only on the text and the parser's rules, so it is kept per text and dropped
  // when the rules change (`deckParser()` returns a new parser then). Callers get a fresh array of frozen records.
  // …except a slide too long to remember: a pasted data-URI photo makes a slide of about 4.5 MB. Looking it up flattened
  // and compared the whole text on every ask (the editor hands a new string each time), which cost more than the read
  // (its one comment sits ahead of the photo), and the memo, bounded only by COUNT, would have held 512 of them.
  // Measured: 1.2 s of one paste of a three-photo deck in the Studio was this lookup. The memo is also bounded by SIZE
  // (MEMO_CHARS), so slides just under the per-text cap cannot fill it either.
  return remembered('blocks', text, readCommentBlocks);
}

/** Work counter for the unit tier and the bench (HARD RULE #32: count work, never time it): the characters of slide text
 *  the readers' memo (`commentBlocks`, `comments`) holds as keys right now. */
export const blocksStats = {
  get heldChars() {
    return chunkMemo.chars;
  },
};

/** The two readers' memory: text → each reader's frozen records, least recently used first. The model behind them is
 *  kept for the LAST text only (`lastModel`), so a slide both readers ask about (the class editor and the notes editor, on
 *  the slide being typed in) is parsed once per keystroke, and the memo holds records, not tapes. */
const chunkMemo = { map: new Map(), parser: null, chars: 0 };
let lastModel = { text: null, model: null };
/** The most texts the memo holds. */
const MEMO_MAX = 512;
// The longest text the memo holds, in characters. Past a megabyte is a pasted photo, never prose: a whole deck (some callers,
// `asset-rename.ts`, pass one) and a 16k-record slide stay well under it and keep their hits.
const MEMO_KEY_MAX = 1_000_000;
// The most slide text the memo holds in all, in characters: four of the longest it keeps, or thousands of ordinary
// slides (the 7-slide starter deck is about 2,000). Without it, 512 texts just under the cap could hold 512 M.
const MEMO_CHARS = 4 * MEMO_KEY_MAX;

/** The memo's entry for `text`, made on a miss. The answer depends only on the text and the parser's rules, so a new
 *  parser empties it. */
function entryOf(text) {
  const parser = deckParser();
  if (chunkMemo.parser !== parser) {
    chunkMemo.map.clear();
    chunkMemo.chars = 0;
    chunkMemo.parser = parser;
    lastModel = { text: null, model: null };
  }
  const kept = chunkMemo.map.get(text);
  if (kept) {
    chunkMemo.map.delete(text);
    chunkMemo.map.set(text, kept);
    return kept;
  }
  while (chunkMemo.map.size > 0 && (chunkMemo.map.size >= MEMO_MAX || chunkMemo.chars + text.length > MEMO_CHARS)) {
    const oldest = chunkMemo.map.keys().next().value;
    chunkMemo.map.delete(oldest);
    chunkMemo.chars -= oldest.length;
  }
  const entry = { blocks: null, comments: null };
  chunkMemo.map.set(text, entry);
  chunkMemo.chars += text.length;
  return entry;
}

/** The model of `text`: the last one read when it is the same text, else a parse. */
function modelOf(text) {
  if (lastModel.text !== text) lastModel = { text, model: deckModel(text) };
  return lastModel.model;
}

/** `read(model, text)` for `text`, through the memo; `slot` names the reader's records on the entry. */
function remembered(slot, text, read) {
  if (text.length > MEMO_KEY_MAX) return read(deckModel(text), text);
  const entry = entryOf(text);
  entry[slot] ??= read(modelOf(text), text);
  return entry[slot].slice();
}

function readCommentBlocks(model, text) {
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
      out.push(Object.freeze({ start, end, body: text.slice(bodyStart, map ? map[close] : close), bodyStart }));
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
