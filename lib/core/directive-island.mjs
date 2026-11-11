/**
 * lib/core/directive-island.mjs
 *
 * THE DIRECTIVE ISLAND: S3 of the Segno deck pipeline for HTML comments
 * (engineering/decisions/2026-10-22-segno-deck-pipeline.md §The design, §P3 landed). The deck model's block pass
 * (S1) already records every comment `html_block` as a line range (`model.directives`), with markdown-it's own
 * block rules deciding where a comment is a block: not inside a fence, an indented code block or another HTML
 * block, and ending at the first line holding `-->` or at the end of its container. This module reads each of
 * those ranges as an island: its text, once, and the directive grammar (lib/core/comment-directive.mjs) over it,
 * memoized by the island's text.
 *
 * WHAT IT REPLACES. `walkComments` (lib/core/meta-record.mjs) found the same comments with a line walk of its
 * own: a fence regex, a comment-opener regex and a scan for `-->`. That walk approximated block structure, so
 * it reported a comment the engine never reads (a `<!--` line inside a `<div>` block, one under a blockquote
 * whose container had ended) and went blind after an unclosed `<!--` inside a list item, which the engine ends
 * at the item's end. Reading the model's ranges makes "which comments are blocks" the engine's answer.
 *
 * TWO TEXTS, ON PURPOSE. An island's `raw` is its first line from `<!--` onward plus its later lines whole, as the
 * walk built it, so every lint finding that quotes a comment back quotes the same bytes. Its `content` is what the
 * grammar reads, and it is the engine's: markdown-it's token content drops a container's prefix (`> `, a list
 * item's indent) from a block's later lines, so `> <!--` / `> _class: kpi` / `> -->` is a directive to the engine.
 * The walk read `raw` and missed it. S1 records that content when it pushes a multi-line comment block inside a
 * container (`model.blockContent`, markdown-it's `getLines` over the parse's own line marks), so it is exact.
 *
 * Pure, fs-free and dependency-free past its siblings (HARD RULE #7). ESM so the editor imports it as source.
 */

import { readDirectiveEntries } from './comment-directive.mjs';
import { readRecord } from './meta-door.mjs';
import { DIRECTIVE_VOCAB, MARKER_NAMES } from './meta-keys.mjs';

/**
 * @typedef {object} DirectiveIsland  one comment `html_block`, read
 * @property {number} fromLine  first body line (0-based, the model's numbering)
 * @property {number} toLine    one past its last line
 * @property {number} level     markdown-it's `token.level`: 0 at a slide's top, deeper in a list or quote
 * @property {number} slide     the authored slide it sits in (index into `model.slides`)
 * @property {string} raw       the comment from `<!--` to the end of its last line, trimmed: what a finding quotes
 * @property {string} content   `raw` with a container's prefix taken off its later lines: what the grammar reads,
 *                              markdown-it's token content as S1 recorded it, trimmed
 * @property {string} indent    what precedes `<!--` on its first line
 * @property {boolean} closed   whether its last line holds `-->`; an unclosed comment is never a directive
 */

/**
 * The comment that opens on body line `from` at `<!--` and ends on line `last`: its text from `<!--` to the end
 * of `last` (`raw`, trimmed), what precedes `<!--` (`indent`), and its later lines on their own (`tail`).
 */
function span(model, from, last) {
  const body = model.body;
  const first = body.slice(model.lineStart(from), model.lineEnd(from));
  const at = first.indexOf('<!--');
  const tail = last > from ? body.slice(model.lineStart(from + 1), model.lineEnd(last)) : null;
  return { head: first.slice(at), tail, indent: first.slice(0, at), raw: (tail === null ? first.slice(at) : `${first.slice(at)}\n${tail}`).trim() };
}

/** Islands per model, so every reader of one parse reads its comments once. */
const islandsMemo = new WeakMap();

/**
 * Every comment block of `model` as an island, in source order.
 * @param {import('@laticent/segno-markdown').DeckModel} model
 * @returns {DirectiveIsland[]}
 */
export function directiveIslands(model) {
  let out = islandsMemo.get(model);
  if (out) return out;
  out = [];
  for (const r of model.directives) {
    const last = r.toLine - 1;
    const { head, tail, indent, raw } = span(model, r.fromLine, last);
    // What the engine's grammar reads: markdown-it's token content, which drops the container's prefix from the
    // block's later lines. Only a block inside a container that spans lines can differ from `raw`, and S1 records
    // that content when it pushes the block (`blockContent`), from the parse's own line marks.
    const recorded = tail !== null ? model.blockContent(r) : null;
    const content = recorded === null ? raw : recorded.trim();
    const closed = (tail === null ? head : model.body.slice(model.lineStart(last), model.lineEnd(last))).includes('-->');
    out.push({ fromLine: r.fromLine, toLine: r.toLine, level: r.level, raw, content, indent, closed });
  }
  islandsMemo.set(model, out);
  return out;
}

/**
 * The directive grammar over one island: the directive it is (or null), the marker it names (or null), and the
 * two record shapes the linter tells apart.
 *
 * NOT MEMOIZED, on purpose. A memo keyed by the island's text keeps every key alive, and a key sliced from the deck
 * body keeps the whole body alive with it: the red team measured 528 MB retained after 3,000 keystrokes in a short
 * note on a 180 KB deck. The read itself costs about 60 µs for every comment of the gallery, so there is nothing to
 * save. The islands of one model are kept (`directiveIslands`), and they hold only their own slices of that model.
 *
 * @param {DirectiveIsland} island
 * @param {{known: Set<string>, flags?: Set<string>}} [vocab]
 * @returns {{dirs: Array<{spot: boolean, key: string, value: string}>, marker: string | null, record: boolean, bareOpener: boolean}}
 *   `dirs` holds EVERY field the vocabulary knows, in order: one for a directive comment, one per field for a record
 *   or the internal form (`{layout=cards, footer="Q3"}` sets both `class` and `footer`).
 */
export function readIsland(island, vocab = DIRECTIVE_VOCAB) {
  const text = island.content;
  const inner = text.slice(4, -3);
  const name = text.startsWith('<!--') && text.endsWith('-->') ? inner.trim() : '';
  const lead = inner.trimStart();
  const record = lead.startsWith('{') || lead.startsWith('@meta{');
  return {
    // A record resolves exactly where the engine applies one (D1, §5.3): a top-level block of its own, 0 to 3 spaces in.
    // One in a list item, a blockquote or folded into another block is classified (`record`) and applies nothing, so the linter can name it and the
    // editor's answer is the engine's.
    // An authored `lat-meta:` comment is a forgery the door blanks (lib/plugins/meta/meta.source.mjs, `meta/forged`), so
    // it resolves nothing here either: only the door writes that form, and nothing reads this scan after the door.
    dirs: (record && (island.folded || island.level !== 0 || island.indent.replace(/\t/g, '    ').length > 3)) || lead.slice(0, 8).toLowerCase() === 'lat-meta' ? [] : readDirectiveEntries(text, vocab),
    // A marker in either spelling: the bare comment (`<!-- stress-slide -->`) or a record that names it
    // (`<!-- {stress-slide} -->`, what `lattice migrate meta` writes, record note §4.2).
    marker: MARKER_NAMES.has(name) ? name : record ? (readRecord(inner)?.markers?.[0] ?? null) : null,
    record,
    // `<!--` alone, the record on the NEXT line: not a record (design note §5.3). A record has a
    // `name=value` pair, so a note whose second line merely starts with a brace (`{pause} …`) is not one.
    bareOpener: /^\s*\n\s*(?:\{[^}]*=|@meta\{)/.test(inner),
  };
}

// ── The comments an author wrote, the ones the engine folds included ────────

/**
 * A comment that opens its line's content: the shape an author writes metadata in. Container prefixes count as
 * the beginning (`> <!--`, `- <!--`). Used only INSIDE a block the model says is not a comment block, to find the
 * comments the engine folds into it.
 */
const COMMENT_OPEN = /^[ ]{0,3}(?:>[ \t]*|(?:[-*+]|\d{1,9}[.)])[ \t]+)*<!--/;

/** Folded comments per model, as `directiveIslands` keeps its islands. */
const authoredMemo = new WeakMap();

/**
 * Every comment an author wrote as one, in source order: the model's comment blocks (`directiveIslands`), and the
 * comments the engine never reads as blocks, each marked `folded: true`. The linter reads both, because its job on
 * the second kind is to say why the engine will not read it. Directive RESOLUTION reads only the first kind.
 *
 * Folded comments are of two shapes, the two the line walk this replaced reported and the engine does not read:
 *
 *   · a line-opening `<!--` INSIDE another HTML block or a plugin block (`<img>` / `<div>` / `<pre>` above it,
 *     `$$`): the engine reads that block's text as one token, so the comment is part of it. Bounded by the block:
 *     one that does not close inside it is not listed.
 *   · a comment block in a list item or quote that its CONTAINER ends before `-->` (a blank line inside it): the
 *     engine's block stops there, unclosed. It is listed from its opener to the first line holding `-->`, as the
 *     author wrote it, unless a comment block the engine reads starts before that line: the engine applies that
 *     one, so the span is not the author's comment and nothing is listed for the opener.
 *
 * Each entry is an island (`raw`, `content`, lines, `indent`) plus `folded`. A folded entry's `content` is its `raw`.
 *
 * @param {import('@laticent/segno-markdown').DeckModel} model
 * @returns {Array<DirectiveIsland & {folded: boolean}>}
 */
export function authoredComments(model) {
  let out = authoredMemo.get(model);
  if (out) return out;
  const line = (n) => model.body.slice(model.lineStart(n), model.lineEnd(n));
  // A comment from line `from` to the first line at or after `n` that holds `-->`, scanning no further than `stop`.
  const folded = (from, n, stop, level) => {
    while (n < stop && !line(n).includes('-->')) n++;
    if (n >= stop) return null; // no `-->` of its own: no comment an author closed
    const { raw, indent } = span(model, from, n);
    return { fromLine: from, toLine: n + 1, level, raw, content: raw, indent, closed: true, folded: true };
  };
  const inBlocks = [];
  for (const r of [...model.html, ...model.plugins]) {
    for (let n = r.fromLine; n < r.toLine; n++) {
      if (!COMMENT_OPEN.test(line(n))) continue;
      // Bounded by its block: one no later line of the block closes means none after it does either.
      const c = folded(n, n, r.toLine, r.level);
      if (!c) break;
      inBlocks.push(c);
      n = c.toLine - 1;
    }
  }
  inBlocks.sort((a, b) => a.fromLine - b.fromLine);
  out = [];
  let f = 0;
  const islands = directiveIslands(model);
  for (let i = 0; i < islands.length; i++) {
    const island = islands[i];
    while (f < inBlocks.length && inBlocks[f].fromLine < island.fromLine) out.push(inBlocks[f++]);
    if (island.closed || island.level === 0) {
      out.push({ ...island, folded: false });
      continue;
    }
    // The `-->` must come before the next comment block the engine reads: that block is the engine's, and an
    // extension that swallowed it would hide a directive the render applies. Bounded by that block, the lines
    // scanned are disjoint from one island to the next, so a run of unclosed comments costs one pass.
    const c = folded(island.fromLine, island.toLine, i + 1 < islands.length ? islands[i + 1].fromLine : model.lines, island.level);
    if (!c) continue;
    out.push(c);
    while (f < inBlocks.length && inBlocks[f].fromLine < c.toLine) f++;
  }
  while (f < inBlocks.length) out.push(inBlocks[f++]);
  authoredMemo.set(model, out);
  return out;
}
