/**
 * lib/authoring/meta-migrate.mjs
 *
 * THE MIGRATION: directive comments (`<!-- _class: cards -->`, `<!-- _footer: Q3 -->`, `<!-- _pane: bar -->`) rewritten
 * as slide-metadata records (`<!-- @meta{class=cards} -->`), in place, keeping every line where it is
 * (engineering/decisions/2026-10-17-meta-record.md §9 step 5). One kernel for every caller: `lattice migrate meta`, the
 * `legacy-directive-comment` quick fix, and the Marp importer (§7: "the importer reads directive comments and writes
 * records; it is what the codemod runs, so the two share one tested path").
 *
 * WHAT IT CONVERTS, and only that: a comment the engine reads as a directive block (lib/core/directive-island.mjs, the
 * deck model's answer, so never one in a fence, a paragraph or a larger HTML block) that sits at the top level, 0 to 3
 * spaces in, which is exactly where the door reads a record (§5.3). A directive inside a list item or a blockquote is
 * left as written and reported (`kept`), because a record there is not read (D1); the author moves it.
 *
 * WHAT IT WRITES: one `<!-- @meta{…} -->` record per comment (`@meta` is the one spelling, owner 2026-11-22, amending D5 of
 * the record note; a bare `<!-- {…} -->` record already in the deck is respelled the same way, its text untouched), the key kebab-cased (`backgroundColor` → `background-color`), spot as the
 * default and `carry` for a running global, a value bare when Segno reads it back unchanged and quoted otherwise.
 * Notes are not settings and are not touched: `lattice migrate notes` (lib/authoring/notes-migrate.mjs) moves them. Merging a slide's adjacent records into one is `mergeAdjacent`'s, a
 * separate pass so this one stays one-to-one and provable.
 *
 * Pure and fs-free (HARD RULE #7).
 */

import { readDirectiveComment } from '../core/comment-directive.mjs';
import { fenceRanges } from '../core/fence-ranges.mjs';
import { commentSites, ownLineSite, recordParts } from '../core/meta-door.mjs';
import { encodeCommentText, recordValue } from '../core/meta-internal.mjs';

export { recordValue };

// NO import of the deck model (lib/core/deck-model.mjs, with its parser) or of directive-island.mjs: the caller passes
// them in one `kit` (`{ deckModel, directiveIslands, authoredComments }`). The lint core loads this file on demand for the
// `legacy-directive-comment` fix (lint-core `loadFixDriver`) and already holds both; a static import here made esbuild cut
// them out of the Studio's lint core into a chunk both share, +1,128 B gzip on `lintCoreGz` (measured 2026-11-22), the
// trap lib/authoring/notes-migrate.mjs documents.

import { DIRECTIVE_VOCAB, kebab, MARKER_NAMES, REGISTERS, SLIDE_ONLY_KEYS } from '../core/meta-keys.mjs';

/** The record fields that compose the slide's class (record note §4.2): the typed fields, `class` and every register. */
const CLASS_SHAPED = new Set(['layout', 'variant', 'universal', 'modifiers', 'class', ...REGISTERS.map((r) => r.key)]);

const PANE_RE = /^\s*(_?)(pane|panes)\s*:([\s\S]*)$/;

/** `recordForComment`'s answer for a directive whose value spans lines: not converted, and reported as kept. */
const MULTILINE = Symbol('multiline');

/**
 * The record for ONE directive comment's body; null when it is not one this migration converts, and `MULTILINE` for a
 * directive whose value spans lines (left as written, reported as kept). `recordForComment` is its public face.
 * @param {string} inner  the text between `<!--` and `-->`
 */
function recordFor(inner, { components } = {}) {
  const body = String(inner ?? '');
  // Already a record, or the engine's internal form: nothing to migrate.
  if (/^\s*(?:\{|@meta\{|lat-)/.test(body)) return null;
  const marker = body.trim();
  if (MARKER_NAMES.has(marker)) return `{${marker}}`;
  const pane = PANE_RE.exec(body);
  // A pane marker whose value runs onto a second line is kept too (the second checker: the record form dropped the panes).
  if (pane) return pane[3].trim().includes('\n') ? MULTILINE : `{${pane[2]}=${recordValue(pane[3].trim())}}`;
  const dir = readDirectiveComment(`<!--${body}-->`, DIRECTIVE_VOCAB);
  if (!dir) return null;
  // A value that runs onto a second line (Marp's `<!--\nclass: invert\npaginate: true\n-->`) is read as one value
  // holding a newline, which no record says the same way: leave it as written (the checker on the meta slice found the
  // record form dropped the slide's class). `migrateMetaSource` names it in `kept`.
  if (String(dir.value ?? '').includes('\n')) return MULTILINE;
  const name = kebab(dir.key);
  const carry = !dir.spot && !SLIDE_ONLY_KEYS.has(dir.key) ? ', carry' : '';
  const hasValue = /:/.test(body);
  // THE TYPED LAYOUT (§4.2): a class whose FIRST word is a component is written `layout=<it>`, the rest `class=`. Only
  // the first word, so the engine composes the same class string in the same order (`readRecord` puts the typed words
  // first): `_class: cards dark` → `{layout=cards, class=dark}`, byte-identical. A class that opens with a modifier
  // (`_class: dark cards`) stays `class=`, because typing it would reorder the words.
  if (dir.key === 'class' && components && hasValue) {
    const words = String(dir.value).trim().split(/\s+/).filter(Boolean);
    if (words.length && components.has(words[0]) && new Set(words).size === words.length) {
      const rest = words.slice(1).join(' ');
      return `{layout=${words[0]}${rest ? `, class=${recordValue(rest)}` : ''}${carry}}`;
    }
  }
  return hasValue ? `{${name}=${recordValue(dir.value)}${carry}}` : `{${name}${carry}}`;
}

/** The record for ONE directive comment's body, or null when this migration leaves it as written. */
export function recordForComment(inner, opts) {
  const rec = recordFor(inner, opts);
  return rec === MULTILINE ? null : rec;
}

/** The width of an indent, a tab advancing to the next multiple of four. */
function indentWidth(ws) {
  let col = 0;
  for (const ch of ws) col = ch === '\t' ? col + 4 - (col % 4) : col + 1;
  return col;
}

/**
 * Rewrite every top-level directive comment of `source` as a `@meta` record, and every bare record as `@meta`, in place.
 * @param {string} source  LF source
 * @param {{components?: Set<string>, kit: {deckModel: Function, directiveIslands: Function}}} opts  `components`: the
 *   catalog's component names: a class that opens with one is written as the typed `layout=` field (without it every
 *   class stays `class=`). `kit`: lib/core/deck-model.mjs `deckModel` and lib/core/directive-island.mjs
 *   `directiveIslands` (see the note at the imports).
 * @returns {{source: string, converted: number, respelled: number, kept: Array<{line: number, why: string}>}}
 *   `converted`: directive comments rewritten as records; `respelled`: bare `<!-- {…} -->` records given `@meta`;
 *   `kept`: directive comments left as written (inside a list or blockquote), 1-based lines.
 */
export function migrateMetaSource(source, opts = {}) {
  const { deckModel, directiveIslands, authoredComments } = opts.kit ?? {};
  if (typeof deckModel !== 'function' || typeof directiveIslands !== 'function' || typeof authoredComments !== 'function') {
    throw new TypeError('migrateMetaSource: pass `kit: { deckModel, directiveIslands, authoredComments }`');
  }
  const src = String(source ?? '');
  if (!src.includes('<!--')) return { source: src, converted: 0, respelled: 0, kept: [] };
  const model = deckModel(src);
  if (model.text !== src) throw new Error('migrateMetaSource: pass LF source with no BOM');
  const edits = [];
  const kept = [];
  const firstLine = src.slice(0, model.bodyStart).split('\n').length;
  for (const island of directiveIslands(model)) {
    const whole = island.content;
    if (!island.closed || !whole.startsWith('<!--') || whole.indexOf('-->', 4) !== whole.length - 3) continue;
    const inner = whole.slice(4, -3);
    const rec = recordFor(inner, opts);
    if (!rec) continue;
    const line = firstLine + island.fromLine;
    if (rec === MULTILINE) {
      kept.push({ line, why: 'its value runs onto a second line; write one comment per directive' });
      continue;
    }
    if (island.level !== 0 || indentWidth(island.indent) > 3) {
      kept.push({ line, why: 'inside a list item or blockquote, where a record is not read; move it to its own line' });
      continue;
    }
    const start = model.bodyStart + model.lineStart(island.fromLine) + island.indent.length;
    const end = model.bodyStart + model.lineEnd(island.toLine - 1);
    const lines = src.slice(start, end).split('\n').length;
    let text = `<!-- @meta${rec} -->`;
    // Keep the comment's line count, so no source position after it moves.
    const have = text.split('\n').length;
    // `text` is this function's own output and always ends `-->`; the padding goes just before it.
    if (have < lines) text = `${text.slice(0, text.endsWith(' -->') ? -4 : -3)}${'\n'.repeat(lines - have)}-->`;
    else if (have > lines) continue; // a record never grows past its comment; anything else is left as written
    edits.push([start, end, text]);
  }
  // THE BARE SPELLING: a record written `<!-- {…} -->` gets `@meta` before its brace, and nothing else changes (the
  // door reads both spellings the same, lib/core/meta-door.mjs `isRecordOpener`). Only the comments the deck model
  // lists (`authoredComments`: comment blocks, and those folded into another block), which are the ones lint
  // reads, so a comment in indented code, inline in prose, or second on its line stays as written
  // (the checker on the meta slice found the older text walk respelled a code block's visible text).
  let respelled = 0;
  for (const c of authoredComments(model)) {
    const lineAt = model.bodyStart + model.lineStart(c.fromLine);
    const text = src.slice(lineAt, model.bodyStart + model.lineEnd(c.fromLine));
    const open = text.indexOf('<!--');
    const m = open < 0 ? null : /^[ \t]*\{/.exec(text.slice(open + 4));
    if (!m) continue;
    const at = lineAt + open + 4 + m[0].length - 1;
    edits.push([at, at, '@meta']);
    respelled++;
  }
  if (!edits.length) return { source: src, converted: 0, respelled: 0, kept };
  edits.sort((a, b) => a[0] - b[0]);
  let out = '';
  let pos = 0;
  for (const [s, e, rep] of edits) {
    out += src.slice(pos, s) + rep;
    pos = e;
  }
  return { source: out + src.slice(pos), converted: edits.length - respelled, respelled, kept };
}

/**
 * ONE RECORD PER SCOPE (§4.3): each run of record comments on CONSECUTIVE lines, outside code, merged into the first, the
 * lines the others held left blank, so no line after them moves. `<!-- @meta{layout=cards} -->` then
 * `<!-- @meta{footer=Q3} -->` becomes `<!-- @meta{layout=cards, footer=Q3} -->` and a blank line (a bare `{…}` record
 * in the run is written `@meta` too). A run breaks where merging would change what renders:
 *   · at a different scope (a `carry` record next to a spot one: two records, one per scope, as §4.3 says);
 *   · at a pane marker (`pane`, `panes`): its line is where a pane starts;
 *   · at a record with `key: |` lines, or one that spans lines;
 *   · at a field already in the run (the engine is last-wins; one record cannot say a key twice). Every class-shaped
 *     field counts as the one key `class`, which is what the engine resolves them to.
 * The class slot still leads wherever the class sits, because `readRecord` holds it at the first class-shaped field,
 * which keeps the order the separate comments wrote attributes in.
 * @param {string} source
 * @returns {{source: string, merged: number}}  `merged`: records folded into another
 */
export function mergeAdjacentRecords(source) {
  const src = String(source ?? '');
  if (!src.includes('<!--')) return { source: src, merged: 0 };
  const runs = [];
  let run = null;
  for (const site of commentSites(src, fenceRanges(src))) {
    // Zero indent only: a record indented under a list item is the item's, and merging into it would hide the rest.
    const parts = !site.inCode && !site.inSpan && ownLineSite(site) && site.lead === '' && !site.body.includes('\n') ? recordParts(site.body) : null;
    // `lead` is the text between `<!--` and the brace: a space, or `@meta` (this read `parts.prefix`, a field
    // `recordParts` never returned, so no run ever merged until 2026-11-22).
    const ok = parts && !parts.tail.trim() && /^\s*(?:@meta)?$/.test(parts.lead) && !parts.items.some((it) => it.name === 'pane' || it.name === 'panes');
    if (!ok) {
      run = null;
      continue;
    }
    // Every class-shaped field (`layout`, `variant`, `class`, a register) sets the ONE engine key `class`, which is
    // last-wins across records: two of them in a run would merge into a union of words, so they count as one name.
    const names = parts.items.map((it) => (it.name !== null && CLASS_SHAPED.has(it.name) ? 'class' : (it.name ?? it.text.trim())));
    const carry = names.includes('carry');
    const fields = names.filter((n) => n !== 'carry');
    if (run && site.line === run.lastLine + 1 && run.carry === carry && !fields.some((n) => run.names.has(n))) {
      run.sites.push({ site, parts });
      run.lastLine = site.line;
      for (const n of fields) run.names.add(n);
      continue;
    }
    run = { sites: [{ site, parts }], lastLine: site.line, carry, names: new Set(fields) };
    runs.push(run);
  }
  let out = '';
  let pos = 0;
  let merged = 0;
  for (const r of runs) {
    if (r.sites.length < 2) continue;
    const items = [];
    for (const { parts } of r.sites) for (const it of parts.items) if (!(r.carry && it.name === null && it.text.trim() === 'carry')) items.push(it.text);
    if (r.carry) items.push('carry');
    const first = r.sites[0].site;
    const last = r.sites[r.sites.length - 1].site;
    out += `${src.slice(pos, first.at)}<!-- @meta${encodeCommentText(`{${items.join(', ')}}`)} -->${'\n'.repeat(r.sites.length - 1)}`;
    // Everything from the first comment through the last one's line end is replaced; the blank lines keep the count.
    pos = last.end;
    merged += r.sites.length - 1;
  }
  return merged ? { source: out + src.slice(pos), merged } : { source: src, merged: 0 };
}

/**
 * ONE DECK, MIGRATED: `migrateMetaSource` then `mergeAdjacentRecords`, keeping the file's byte-order mark and each line's
 * ending. The one whole-deck pass behind `lattice migrate meta`, `lint:deck --fix` and the Studio's quick fix
 * (`legacy-directive-comment`, `rewrite: 'migrate-meta'` in lib/authoring/lint-core.js), so all three write the same text.
 * @param {string} text  a deck as read (any line endings, a BOM or none)
 * @param {{components?: Set<string>, kit: object}} opts  as `migrateMetaSource`
 * @returns {{text: string, converted: number, respelled: number, merged: number, kept: Array<{line: number, why: string}>}}
 */
export function migrateMetaDeck(text, opts = {}) {
  const src = String(text ?? '');
  const bom = src.startsWith('\uFEFF') ? '\uFEFF' : '';
  const lf = src.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const one = migrateMetaSource(lf, opts);
  const two = mergeAdjacentRecords(one.source);
  // Nothing to migrate: the deck comes back byte for byte, whatever its line endings.
  if (two.source === lf) return { text: src, converted: 0, respelled: 0, merged: 0, kept: one.kept };
  // Each line keeps the ending it had (both passes keep every line in place), so a CRLF file stays CRLF and a mixed
  // file changes no line it did not rewrite.
  const eols = src.slice(bom.length).match(/\r\n|\r|\n/g) ?? [];
  const outLines = two.source.split('\n');
  const out = eols.length === outLines.length - 1 ? outLines.map((l, k) => l + (eols[k] ?? '')).join('') : two.source;
  return { text: bom + out, converted: one.converted, respelled: one.respelled, merged: two.merged, kept: one.kept };
}
