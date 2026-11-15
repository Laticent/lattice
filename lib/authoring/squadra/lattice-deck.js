// `lattice-deck`, Lattice's deck language for Squadra (engineering/decisions/2026-11-13-squadra-replaces-lint-core.md
// §3.1). It extends the reference Markdown language (`@laticent/squadra/markdown`) with what a Lattice deck means, so
// every deck rule reads nodes and no rule re-parses text.
//
// THE MODEL is the engine's: `deckModel` (lib/core/deck-model.mjs), the Segno deck model configured with the
// plugin block rules the engine runs, front matter split as the engine splits it (`ENGINE_FRONT_MATTER`). One parse
// per source text and plugin-rule generation (§3.5): the last model is kept, keyed on both (everything `deckParser`
// depends on), so a plugin switch never reads a stale tree. It is the one module-level memo, and it holds the parse,
// never a lint answer.
//
// THE TREE
//   deck → front-matter, slide, break        the reference language's
//   slide → heading, paragraph, list → item, quote, table → row, fence, code-block, html-block, plugin-block
//   comment                                  a comment block. attrs: closed, folded, record, marker, and authoredTo
//                                            when the author's comment runs past the block the engine read
//     → directive                            one per field the directive grammar reads from it
//                                            (lib/core/directive-island.mjs `readIsland`, the engine's reading).
//                                            attrs: key, spot, value, folded, record. parts: key, value, when the
//                                            authored text names them (a record's `layout=` sets `class` and has
//                                            no `class` part); the node's span covers the two, or the comment
//     → note                                 a comment that is neither a directive, a marker nor a record: its text
//                                            between the delimiters, trimmed. Inert, like fenced code
//   A comment the engine FOLDS into another block (`authoredComments`: a `<!--` line inside an HTML or plugin block,
//   or a comment its list item or quote ends before `-->`) is a `comment` with `attrs.folded`, and so are its
//   directives: the engine applies none of them, and a rule's job is to say so. One inside an HTML or plugin block
//   sits under that block.
//
// FACTS
//   slide.number      a slide node's number as every lint finding counts it: 1-based, front matter excluded, and
//                     the empty chunk before a leading break dropped, as the engine drops it. `locate` reports it.
//   slide.directives  the directives in force on a slide: Map key → directive node, by the engine's rule (a spot
//                     replaces the running global, the last spot wins, `header`/`footer` are spots in either
//                     spelling, `paginate` resolves nothing). Front-matter globals join with the front-matter
//                     island (§5, step 3 of the work plan).
//   slide.classes     the slide's `class` in force, split on whitespace.
//
// Pure and fs-free, because the Studio bundles it.

const { markdownLanguage } = require('@laticent/squadra/markdown');
const { boundaryRulesGeneration } = require('../../core/boundary-parser.mjs');
const { deckModel } = require('../../core/deck-model.mjs');
const { authoredComments, readIsland } = require('../../core/directive-island.mjs');
const { SLIDE_ONLY_KEYS } = require('../../core/meta-keys.mjs');

const ID = 'lattice-deck';
const VERSION = '1';

// One model per source text and plugin-rule generation: a parse is shared by every rule and fact of one lint.
let memo = { text: null, gen: -1, model: null };
function modelOf(text) {
  const gen = boundaryRulesGeneration();
  if (memo.text !== text || memo.gen !== gen) memo = { text, gen, model: deckModel(text) };
  return memo.model;
}

const markdown = markdownLanguage({ model: modelOf, id: 'markdown' });

/** Where `needle` sits in `hay` at or after `from`, as a span relative to `hay`, or null. */
function find(hay, needle, from) {
  if (!needle) return null;
  const i = hay.indexOf(needle, from);
  return i < 0 ? null : { from: i, to: i + needle.length };
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Where a field named `key` (or `_key`) is written at or after `from`: at a key boundary (the start, a line start,
 * after whitespace, `{` or `,`) and followed by `:` or `=`, so `class` is never found inside `classic-cards`.
 */
function findKey(hay, key, from) {
  const re = new RegExp(`(^|[\\s{,])(_?${escapeRe(key)})\\s*[:=]|(^|[\\s{,])(_?${escapeRe(key)})\\s*(?=-->|$)`, 'g');
  re.lastIndex = from;
  const m = re.exec(hay);
  if (!m) return null;
  const name = m[2] ?? m[4];
  const at = m.index + (m[1] ?? m[3]).length;
  return { from: at, to: at + name.length };
}

/**
 * The directive and note nodes of one authored comment, `base` being the source offset of its `<!--`. The parts
 * search walks the comment left to right, so a second field never claims the first one's text.
 */
function commentKids(c, info, base, at) {
  const raw = c.raw;
  const abs = (s) => ({ from: at(base + s.from), to: at(base + s.to, true) });
  if (info.dirs.length) {
    const out = [];
    let cursor = 4;
    for (const d of info.dirs) {
      const key = findKey(raw, d.key, cursor);
      const value = key && d.value ? find(raw, d.value, key.to) : null;
      const parts = {};
      if (key) parts.key = abs(key);
      if (value) parts.value = abs(value);
      if (key) cursor = (value ?? key).to;
      const span = key ? { from: parts.key.from, to: (parts.value ?? parts.key).to } : abs({ from: 0, to: raw.length });
      out.push({ kind: 'directive', ...span, kids: [], attrs: { key: d.key, spot: !!d.spot, value: d.value ?? '', folded: !!c.folded, record: !!info.record }, parts });
    }
    return out;
  }
  if (info.marker || info.record) return [];
  // A note: the text between the delimiters, trimmed. An unclosed comment runs to its end.
  const end = c.closed && raw.endsWith('-->') ? raw.length - 3 : raw.length;
  let from = 4;
  let to = end;
  while (from < to && /\s/.test(raw[from])) from++;
  while (to > from && /\s/.test(raw[to - 1])) to--;
  return to > from ? [{ kind: 'note', ...abs({ from, to }), kids: [], attrs: { folded: !!c.folded } }] : [];
}

/** The innermost node under `parent` whose span holds `span` and that can take a comment (a block that folds one). */
function holder(parent, span) {
  for (const k of parent.kids) {
    if (k.from <= span.from && span.to <= k.to && k.kind !== 'comment' && k.kind !== 'paragraph' && k.kind !== 'heading') return holder(k, span);
  }
  return parent;
}

/** Add the directive island to the reference tree: directives, notes and folded comments, and notes inert. */
function addComments(tree) {
  const model = tree.model;
  const base = model.bodyStart;
  const at = tree.at;
  const byFrom = new Map();
  const walk = (n) => {
    for (const k of n.kids) {
      if (k.kind === 'comment') byFrom.set(k.from, k);
      walk(k);
    }
  };
  walk(tree);
  const notes = [];
  for (const c of authoredComments(model)) {
    const lineStart = base + model.lineStart(c.fromLine);
    const open = lineStart + c.indent.length;
    const info = readIsland(c);
    let kids = commentKids(c, info, open, at);
    const attrs = { closed: !!c.closed, folded: !!c.folded, record: !!info.record, ...(info.marker ? { marker: info.marker } : {}) };
    const block = byFrom.get(at(lineStart));
    if (block) {
      // A comment its list item or quote ends before `-->` runs, as the author wrote it, past the block the engine
      // read: into the paragraph after it, outside its container. Its node keeps the block's span, so the tree stays
      // nested; what lies past the block is the engine's text, so a directive there is dropped and a note is clipped
      // (an inert note over live text would hide it from every rule). `authoredTo` says where the author's comment ends.
      const authoredTo = at(open + c.raw.length, true);
      if (authoredTo > block.to) {
        attrs.authoredTo = authoredTo;
        kids = kids.filter((k) => k.from < block.to).map((k) => (k.to > block.to ? { ...k, to: block.to } : k)).filter((k) => k.kind === 'note' || k.to <= block.to);
      }
      for (const k of kids) if (k.kind === 'note') notes.push({ from: k.from, to: k.to });
      block.kids = kids;
      block.attrs = { ...block.attrs, ...attrs };
      continue;
    }
    for (const k of kids) if (k.kind === 'note') notes.push({ from: k.from, to: k.to });
    // A comment the engine folds into an HTML or plugin block: a node of its own, under that block.
    const node = { kind: 'comment', from: at(open), to: at(open + c.raw.length, true), kids, attrs: { level: c.level, ...attrs } };
    const slide = tree.slideNodes[slideIndexOf(tree, node.from)];
    if (!slide) continue;
    const parent = holder(slide, node);
    parent.kids = [...parent.kids, node].sort((a, b) => a.from - b.from || b.to - a.to);
  }
  if (notes.length) tree.inertSpans = [...tree.inertSpans, ...notes].sort((a, b) => a.from - b.from);
  return tree;
}

function slideIndexOf(tree, offset) {
  const s = tree.slideNodes;
  let lo = 0;
  let hi = s.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (s[mid].from <= offset) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** A slide node's number as lint findings count it, from its index among the authored chunks. */
function numberOf(tree, index) {
  return index + 1 - (tree.model.leadingEmpty && tree.slideNodes.length > 1 ? 1 : 0);
}

const resolvedMemo = new WeakMap();
/** The directives in force on every slide, by the engine's rule (lib/core/meta-scan.mjs `resolveSlides`). */
function resolved(tree) {
  let out = resolvedMemo.get(tree);
  if (out) return out;
  out = [];
  const globals = new Map();
  for (const slide of tree.slideNodes) {
    const spots = new Map();
    const visit = (n) => {
      for (const k of n.kids) {
        if (k.kind === 'directive' && !k.attrs.folded && k.attrs.key !== 'paginate') (k.attrs.spot || SLIDE_ONLY_KEYS.has(k.attrs.key) ? spots : globals).set(k.attrs.key, k);
        visit(k);
      }
    };
    visit(slide);
    const now = new Map(globals);
    for (const [k, v] of spots) now.set(k, v);
    out.push(now);
  }
  resolvedMemo.set(tree, out);
  return out;
}

const KINDS = [...markdown.kinds, 'directive', 'note'];

const latticeDeck = {
  ...markdown,
  id: ID,
  version: VERSION,
  kinds: KINDS,
  extends: markdown,
  parse(source) {
    const out = markdown.parse(source);
    return { tree: addComments(out.tree), errors: out.errors };
  },
  facts: {
    'slide.number': (tree, _source, node) => (node?.kind === 'slide' ? numberOf(tree, node.attrs.index) : 0),
    'slide.directives': (tree, _source, node) => (node?.kind === 'slide' ? resolved(tree)[node.attrs.index] : new Map()),
    'slide.classes': (tree, _source, node) => {
      if (node?.kind !== 'slide') return [];
      const d = resolved(tree)[node.attrs.index].get('class');
      return d ? d.attrs.value.split(/\s+/).filter(Boolean) : [];
    },
  },
  locate(tree, span) {
    if (tree.header && span.from < tree.header.to) return { slide: 0 };
    if (!tree.slideNodes.length) return { slide: 0 };
    return { slide: numberOf(tree, slideIndexOf(tree, span.from)) };
  },
};

module.exports = { latticeDeck, LANGUAGE: ID };
