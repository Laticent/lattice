/**
 * Theme CSS → a total, ordered, selector-aware declaration record, and back.
 *
 * The inverse of `serialize.js`, and the reason it has to exist:
 * `serializeTheme` is a PROJECTION onto the `REQUIRED_TOKENS` names, not a
 * bijection. Reading a theme back through a flat token map deletes every name
 * outside that list — measured at 47 distinct custom properties across
 * `themes/`, in 19 of 32 files — and the deletions cascade, because
 * `themes/indaco.css` builds `--spectrum` (in the contract) out of three
 * `--brand-*` operands (not in it). A dropped operand makes `--spectrum`
 * resolve invalid, and it is read bare inside `background:` shorthands, so the
 * whole declaration dies at computed-value time: the white-on-white divider of
 * `engineering/decisions/2026-08-10-no-safe-default-token-contract.md`.
 *
 * So the model is a RECORD, not a map. Four things a map cannot hold, each of
 * which is a shipped theme rather than a hypothetical:
 *
 *   1. **names outside the contract** — see above;
 *   2. **non-custom-property declarations under a root selector.** `color-scheme`
 *      appears under a root-ish selector in 28 of 32 themes, and
 *      `themes/ardesia-dark.css` is, in its entirety, `@import 'ardesia';` plus
 *      `:root { color-scheme: dark; }`. Swallow that into a token map and
 *      re-serialization emits the hard-coded `color-scheme: light` in its place —
 *      opening a dark theme and saving it turns it light;
 *   3. **at-rules.** `@import` is in 32 of 32 themes and carries the ENTIRE token
 *      content in 18 of them (the 13 `*-dark` wrappers and the `a11y-*` variants
 *      declare nothing themselves). A parser that loses it makes a correct file
 *      look like ~106 missing tokens to the conformance rung;
 *   4. **the same name at two selectors.** Only `color-scheme` still does this —
 *      `themes/a11y-base.css:89` pins it at `:root:root` as well — but the record
 *      is keyed by (selector, name) so the shape is representable at all.
 *
 * ── Fidelity, and why nodes carry their source text ──────────────────────────
 *
 * Each node keeps `raw`, its exact source slice, and `before`, the exact
 * whitespace that preceded it. `serializeThemeRecord` emits `raw` for any node
 * nothing has touched, so a theme the author hand-formatted — their blank lines,
 * their alignment, their docblocks — comes back byte-identical after an edit to
 * one token somewhere else. Reformatting a 450-line palette because one value
 * moved is the kind of diff that makes a round-trip untrustworthy.
 *
 * That fidelity must not be allowed to MASK an incomplete parse, which is what
 * `{ canonical: true }` is for: it re-renders every node body from structure,
 * ignoring `raw` entirely, and the round-trip test drives BOTH modes. If the
 * structural representation were missing a declaration, canonical output would
 * drop it while raw output sailed through.
 *
 * ── Not css-tree, deliberately ──────────────────────────────────────────────
 *
 * css-tree is already a dependency (`lib/export/player-prune.js`) and is the
 * obvious reach. Two reasons this hand-rolls the scan instead:
 *
 *   - it drops comments by default, and a theme is substantially comments — the
 *     `@theme` header the engine's registry reads, and the a11y docblocks that
 *     carry the measurements behind the values;
 *   - **it is a serializer, and any CSS serializer normalizes `<\/style` back
 *     into a live terminator** — the HARD RULE #22 third-arm hazard.
 *     `checkCssTreeRewrapSinks` discovers sinks by matching
 *     `prunePlayer(Css|FontFaces)\s*\(`, so a new `csstree.generate()` site would
 *     be invisible to it and the gate would stay green over a live sink.
 *
 * This parser never re-escapes: a value is carried as the bytes the source spelled
 * it with, so `themes/a11y-base.css`'s `content:` literals survive unchanged.
 *
 * **That is necessary and it is not sufficient, which an earlier version of this
 * docblock got wrong.** It claimed nothing here could manufacture a terminator
 * that was not already written. A maker-checker pass falsified it in one line:
 * `:root{x<\/;style>y:1;}` came back as `:root {x<\/style>y: 1;}`. The bytes were
 * never re-escaped — they were DROPPED. A colon-less statement parses as a `raw`
 * node, the renderer omitted the `;` the source had, and the two fragments welded
 * into a terminator neither contained. Removal composes just as well as escaping.
 * The `raw` renderer now carries its `;`, and the test drives that path rather
 * than only the string-value one that was always safe.
 *
 * The guard for a document that EMBEDS this CSS still belongs at the frame
 * (`lib/core/sanitize-style-text.mjs`), which covers every channel rather than this
 * one producer — and that is the architecture, not a reason to be relaxed here. No
 * HARD RULE #22 gate can see this file: it is outside `DOC_STYLE_SINK_ROOTS`, and
 * `checkCssTreeRewrapSinks` discovers sinks by matching `prunePlayerCss(`. A
 * serializer no gate watches is exactly the third-arm shape #22 exists for, so the
 * property is held by the test rather than by a claim.
 */

const { requiredTokenList } = require('./derive.js');

/**
 * Selectors whose declarations belong to the theme's own root scope.
 *
 * Case-insensitive because CSS pseudo-classes are ASCII case-insensitive: a
 * hand-edited theme written with `:ROOT` is valid CSS, and classifying it as a
 * non-root rule drops all ~107 of its tokens out of the view — which the
 * conformance rung would then report as a wholly missing contract, the same
 * false indictment the design note argues against for `@import`.
 */
const ROOT_ISH = /^(?::root)+$|^:where\(\s*:root\s*\)$|^:is\(\s*:root\s*\)$/i;

/**
 * Is every top-level part of this selector a root-ish form?
 *
 * Whole-selector, and split on TOP-LEVEL commas only — the same rule
 * `tools/check-ownership.js` applies, for the same reason: a comma inside
 * `:is()` / `:where()` / `:not()` or an attribute value is part of one compound,
 * not a separator. A selector with ANY non-root arm (`:root, section`) reaches
 * slides and is NOT the theme's root scope; it belongs in the tail.
 */
function isRootIsh(selector) {
  // Comments stripped first: a comment may legally sit between the selector and
  // its brace (`:root /* palette */ {`), and it rides along in the recorded
  // selector text. `tools/check-ownership.js` strips them for the same reason.
  const parts = selectorParts(String(selector).replace(/\/\*[\s\S]*?\*\//g, ' ').trim());
  return parts.length > 0 && parts.every((p) => ROOT_ISH.test(p));
}

/** Split a selector list on top-level commas, respecting strings and nesting. */
function selectorParts(sel) {
  const out = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (const ch of sel) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

// ── Scanning ────────────────────────────────────────────────────────────────

/**
 * Index of the first character at or after `i` that is not whitespace.
 * Comments are NOT skipped — they are nodes, not trivia.
 */
function skipSpace(src, i, end) {
  while (i < end && /\s/.test(src[i])) i++;
  return i;
}

/** End index (exclusive) of the comment opening at `i`; the whole rest if unterminated. */
function commentEnd(src, i, end) {
  const close = src.indexOf('*/', i + 2);
  return close === -1 || close + 2 > end ? end : close + 2;
}

/**
 * Walk from `i` to the end of the statement that starts there.
 *
 * Returns `{ stop, terminator }` where `terminator` is `'{'`, `';'` or `''`
 * (input ran out). Strings, comments and `()` / `[]` nesting are transparent, so
 * a `;` inside `url(…)` or a quoted value never ends a statement early.
 *
 * `braceIsValue` is the custom-property carve-out: `--x: { … }` is legal CSS, so
 * for a statement already known to declare a custom property a `{` is part of
 * the value and only a top-level `;` terminates.
 */
function statementEnd(src, i, end, braceIsValue) {
  let depth = 0;
  let braces = 0;
  while (i < end) {
    const ch = src[i];
    // A CSS escape makes the NEXT character literal wherever it appears — not only
    // inside a string. `.a\}b` is a class named `a}b`, and treating that `}` as a
    // block closer mis-slices the selector (and used to hang the parser).
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      i = commentEnd(src, i, end);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = stringEnd(src, i, end);
      continue;
    }
    // Clamped at zero: an unbalanced `)` mid-edit must not drive depth negative and
    // swallow the rest of the block into one value.
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === '{') {
      if (!braceIsValue) return { stop: i, terminator: '{' };
      braces++;
    } else if (ch === '}') {
      if (braces === 0) return { stop: i, terminator: '' };
      braces--;
    } else if (ch === ';' && depth === 0 && braces === 0) {
      return { stop: i, terminator: ';' };
    }
    i++;
  }
  return { stop: end, terminator: '' };
}

/** End index (exclusive) of the string literal opening at `i`. */
function stringEnd(src, i, end) {
  const quote = src[i];
  i++;
  while (i < end) {
    if (src[i] === '\\') {
      i += 2;
      continue;
    }
    if (src[i] === quote) return i + 1;
    i++;
  }
  return end;
}

/**
 * Locate the `}` matching the `{` at `i`.
 *
 * Returns `{ stop, closed }`. `closed` matters: when the author is mid-keystroke
 * and the brace is still open, `stop` is the end of input and there is no `}` to
 * exclude from the interior. Slicing `stop - 1` unconditionally ate the last
 * character of the content — a color quietly losing a digit while being typed.
 */
function blockEnd(src, i, end) {
  let depth = 0;
  while (i < end) {
    const ch = src[i];
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      i = commentEnd(src, i, end);
      continue;
    }
    if (ch === '"' || ch === "'") {
      i = stringEnd(src, i, end);
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return { stop: i + 1, closed: true };
    }
    i++;
  }
  return { stop: end, closed: false };
}

// ── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse the region `[start, end)` into a node list.
 *
 * Used for the top level and for every block interior, so a rule nested in an
 * `@media` is parsed by the same code that parses a top-level rule. Returns
 * `{ nodes, after }`; `after` is the trailing whitespace, kept so the region
 * re-serializes exactly.
 */
function parseNodes(src, start, end) {
  const nodes = [];
  let i = start;
  while (i < end) {
    const from = i;
    i = skipSpace(src, i, end);
    if (i >= end) return { nodes, after: src.slice(from, end) };
    const before = src.slice(from, i);

    // A comment is a node: the `@theme` header the engine registry reads is one,
    // and so is every measurement docblock in the a11y palettes.
    if (src[i] === '/' && src[i + 1] === '*') {
      const stop = commentEnd(src, i, end);
      nodes.push({ type: 'comment', text: src.slice(i, stop), before, raw: src.slice(i, stop) });
      i = stop;
      continue;
    }

    // An unbalanced `}` — the author deleted an opening brace, the single most
    // common transient state in a CSS editor. It closes nothing, so it is carried
    // as opaque text. Without this the statement scan returns `stop === i` with no
    // terminator, `i` never advances, and `parseTheme` spins forever: not a throw
    // the caller could catch, but a frozen main thread taking unsaved work with it.
    if (src[i] === '}') {
      nodes.push({ type: 'raw', text: '}', before, raw: '}', semicolon: false });
      i++;
      continue;
    }

    if (src[i] === '@') {
      const { stop, terminator } = statementEnd(src, i, end, false);
      const head = src.slice(i, stop);
      const m = /^@([\w-]+)\s*/.exec(head);
      const name = m ? m[1] : '';
      const prelude = head.slice(m ? m[0].length : 1).trim();
      if (terminator === '{') {
        const { stop: close, closed } = blockEnd(src, stop, end);
        const inner = parseNodes(src, stop + 1, closed ? close - 1 : close);
        nodes.push({
          type: 'atrule', name, prelude, nodes: inner.nodes, after: inner.after,
          count: inner.nodes.length, closed,
          before, raw: src.slice(i, close),
        });
        i = close;
      } else {
        const past = terminator === ';' ? stop + 1 : stop;
        nodes.push({ type: 'atrule', name, prelude, nodes: null, before, raw: src.slice(i, past) });
        i = past;
      }
      continue;
    }

    // A custom property's value may legally contain a block, so decide which
    // scan to run BEFORE scanning: `--x: { a: b }` is one declaration, not a rule
    // whose selector is `--x: `.
    const custom = /^--[^\s:]*\s*:/.test(src.slice(i, Math.min(end, i + 200)));
    const { stop, terminator } = statementEnd(src, i, end, custom);

    if (terminator === '{') {
      const { stop: close, closed } = blockEnd(src, stop, end);
      const inner = parseNodes(src, stop + 1, closed ? close - 1 : close);
      nodes.push({
        type: 'rule', selector: src.slice(i, stop).trim(), nodes: inner.nodes, after: inner.after,
        count: inner.nodes.length, closed,
        before, raw: src.slice(i, close),
      });
      i = close;
      continue;
    }

    const text = src.slice(i, stop);
    const past = terminator === ';' ? stop + 1 : stop;
    if (text.trim()) {
      nodes.push({ ...declaration(text), before, raw: src.slice(i, past), semicolon: terminator === ';' });
    }
    // Backstop for any scan that reports no progress. Every branch above advances,
    // and the stray-`}` guard covers the one case that did not — but a parser whose
    // failure mode is a hang rather than a bad parse does not get to rely on that
    // being exhaustive.
    i = past > i ? past : i + 1;
  }
  return { nodes, after: '' };
}

/**
 * One `property: value` split at the first top-level colon.
 *
 * The value keeps the bytes the source spelled it with — no unescaping, no
 * re-quoting — which is what keeps this parser from manufacturing a `</style`
 * terminator that the source did not already contain.
 */
function declaration(text) {
  let depth = 0;
  let quote = null;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ':' && depth === 0) {
      const property = text.slice(0, i).trim();
      let value = text.slice(i + 1).trim();
      let important = false;
      const bang = /!\s*important\s*$/i.exec(value);
      if (bang) {
        important = true;
        value = value.slice(0, bang.index).trim();
      }
      return { type: 'decl', property, value, important };
    }
  }
  // No colon: not a declaration at all. Kept verbatim rather than dropped, so a
  // malformed line survives an edit to the rest of the file.
  return { type: 'raw', text: text.trim() };
}

/**
 * Parse theme CSS into a record.
 *
 * @param {string} css
 * @returns {{nodes: object[], after: string}} nodes in source order
 */
function parseTheme(css) {
  const src = String(css);
  return parseNodes(src, 0, src.length);
}

// ── Serializing ─────────────────────────────────────────────────────────────

/**
 * Is this node, or anything under it, edited?
 *
 * Dirtiness has to climb. A `dirty` flag on a declaration is invisible to a
 * serializer that emits the enclosing rule's `raw` slice — the edit lands in the
 * record and never reaches the file, which is the worst failure mode available
 * here: a save that silently discards the author's change and reports success.
 */
function hasDirty(node) {
  if (node.dirty) return true;
  if (!Array.isArray(node.nodes)) return false;
  // A node ADDED to or REMOVED from this block carries no `dirty` flag of its own —
  // an added one was never parsed, and a removed one is not there to flag — so
  // climbing from children alone missed both and the clean parent's `raw` slice
  // masked the edit. Adding and removing tokens is most of what a theme editor
  // does. `count` is the child count at parse time; a block whose length has moved
  // is dirty by construction.
  if (typeof node.count === 'number' && node.nodes.length !== node.count) return true;
  return node.nodes.some(hasDirty);
}

/**
 * Render one node.
 *
 * `indent` is the block nesting prefix. Inter-node whitespace comes from each
 * node's recorded `before`, so a block the author laid out one way does not come
 * back laid out another; what this decides is the shape of the node BODY, which
 * is the part a structural round-trip actually has to prove it kept.
 *
 * A clean node with a source slice emits that slice — so re-rendering a rule
 * because ONE of its declarations moved rewrites that declaration and copies the
 * rest through untouched.
 */
function renderNode(node, indent, canonical) {
  if (!canonical && node.raw != null && !hasDirty(node)) return node.raw;
  switch (node.type) {
    case 'comment':
      return node.text;
    case 'decl':
      return `${node.property}: ${node.value}${node.important ? ' !important' : ''}${node.semicolon === false ? '' : ';'}`;
    case 'raw':
      // The `;` is part of the node, and dropping it was two defects at once.
      // It WELDS this text onto whatever follows: `--accent red;` (a missing
      // colon — a routine typo) re-emitted without its terminator swallowed the
      // next declaration, so `--ink` stopped existing as a token after one save.
      // And because the weld DELETES bytes between two fragments, it can compose a
      // `</style` out of source that contained none — `x</` + `style>y:1;` — which
      // is exactly the property this file claims not to have. Carrying the source
      // bytes is only sufficient if none of them are dropped on the way out.
      return `${node.text}${node.semicolon ? ';' : ''}`;
    case 'atrule':
      if (!node.nodes) return `@${node.name}${node.prelude ? ` ${node.prelude}` : ''};`;
      return `@${node.name}${node.prelude ? ` ${node.prelude}` : ''} {${renderBody(node, indent, canonical)}}`;
    case 'rule':
      return `${node.selector} {${renderBody(node, indent, canonical)}}`;
    default:
      return '';
  }
}

/** A block interior: each child preceded by its recorded whitespace. */
function renderBody(node, indent, canonical) {
  let out = '';
  for (const child of node.nodes) {
    out += child.before ?? `\n${indent}  `;
    out += renderNode(child, `${indent}  `, canonical);
  }
  return out + (node.after ?? `\n${indent}`);
}

/**
 * Record → CSS text.
 *
 * Two modes, and the second exists to keep the first honest:
 *
 *   - default — a node nothing has touched re-emits its `raw` source slice, so
 *     an untouched region is byte-identical no matter how it was formatted. Mark
 *     a node `dirty: true` (or drop its `raw`) after editing it and that node
 *     alone re-renders — dirtiness climbs to its ancestors so the enclosing
 *     rule's source slice cannot swallow the edit, but its clean SIBLINGS still
 *     come through verbatim;
 *   - `{ canonical: true }` — every node body renders from structure, `raw`
 *     unused. If the record were missing a declaration this output would drop it,
 *     which is exactly what the round-trip test needs in order to mean anything.
 *
 * @param {{nodes: object[], after?: string}} record
 * @param {{canonical?: boolean}} [opts]
 * @returns {string}
 */
function serializeThemeRecord(record, { canonical = false } = {}) {
  let out = '';
  for (const node of record.nodes) {
    out += node.before ?? '';
    out += renderNode(node, '', canonical);
  }
  return out + (record.after ?? '');
}

// ── The four-bucket view ────────────────────────────────────────────────────

/**
 * The record, seen the way the design note frames it — four buckets, derived,
 * never a second copy of the truth. Every entry carries the node it came from,
 * so an edit through the view is an edit to the record.
 *
 * **The buckets are a READ, not a partition**, and nothing should be rebuilt from
 * them alone. Top-level comments belong to no bucket — including the `@theme`
 * header the engine's registry reads to learn the theme's name — as does the
 * whitespace that makes the file legible. `serializeThemeRecord` writes from the
 * RECORD; a caller that reassembles a sheet out of these four lists is dropping
 * the header and calling the result a theme.
 *
 * `REQUIRED_TOKENS` is the VALIDATOR here and never the emitter: `contract`
 * reports which side of the contract a token falls on, and nothing filters on it.
 *
 * @returns {{tokens: object[], rootOther: object[], atRules: object[], tail: object[]}}
 */
function themeRecordView(record) {
  const required = new Set(requiredTokenList());
  const tokens = [];
  const rootOther = [];
  const atRules = [];
  const tail = [];

  const walk = (list) => {
  for (const node of list) {
    if (node.type === 'atrule') {
      atRules.push(node);
      // Descend: a root block nested in an at-rule (`@media (prefers-contrast: more)
      // { :root { … } }`) is a natural hand-edit shape, and walking only the top
      // level put its tokens in NO bucket at all — invisible to the view, and so
      // reported as missing by anything reading the record.
      if (node.nodes) walk(node.nodes);
      continue;
    }
    if (node.type !== 'rule') continue;
    if (!isRootIsh(node.selector)) {
      tail.push(node);
      continue;
    }
    for (const child of node.nodes) {
      if (child.type !== 'decl') continue;
      const entry = { selector: node.selector, node: child, rule: node };
      if (child.property.startsWith('--')) {
        const name = child.property.slice(2);
        tokens.push({ ...entry, name, contract: required.has(name) });
      } else {
        // `color-scheme` lands here and must never reach the token record: it is
        // the whole content of the 13 `*-dark` wrappers, and a token map would
        // re-emit the generated `color-scheme: light` over it.
        rootOther.push(entry);
      }
    }
  }
  };
  walk(record.nodes);
  return { tokens, rootOther, atRules, tail };
}

/**
 * Token lookup keyed by (selector, name), last-wins within a selector.
 *
 * Last-wins matches CSS: a token declared twice under the same selector resolves
 * to the later value, so that is what a reader of this map must see. The keying
 * keeps two selectors distinct rather than collapsing them, which is the part a
 * flat map cannot do.
 */
function tokenMapBySelector(record) {
  const out = new Map();
  for (const t of themeRecordView(record).tokens) {
    if (!out.has(t.selector)) out.set(t.selector, new Map());
    out.get(t.selector).set(t.name, t.node.value);
  }
  return out;
}

module.exports = {
  parseTheme,
  serializeThemeRecord,
  themeRecordView,
  tokenMapBySelector,
  isRootIsh,
  selectorParts,
};
