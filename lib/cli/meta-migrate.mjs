/**
 * lib/cli/meta-migrate.mjs
 *
 * THE MIGRATION: directive comments (`<!-- _class: cards -->`, `<!-- _footer: Q3 -->`, `<!-- _pane: bar -->`) rewritten
 * as slide-metadata records (`<!-- {class=cards} -->`), in place, keeping every line where it is
 * (engineering/decisions/2026-10-17-meta-record.md §9 step 5). One kernel for every caller: `lattice migrate meta`, the
 * `legacy-directive-comment` quick fix, and the Marp importer (§7: "the importer reads directive comments and writes
 * records; it is what the codemod runs, so the two share one tested path").
 *
 * WHAT IT CONVERTS, and only that: a comment the engine reads as a directive block (lib/core/directive-island.mjs, the
 * deck model's answer, so never one in a fence, a paragraph or a larger HTML block) that sits at the top level, 0 to 3
 * spaces in, which is exactly where the door reads a record (§5.3). A directive inside a list item or a blockquote is
 * left as written and reported (`kept`), because a record there is not read (D1); the author moves it.
 *
 * WHAT IT WRITES: one record per comment, the key kebab-cased (`backgroundColor` → `background-color`), spot as the
 * default and `carry` for a running global, a value bare when Segno reads it back unchanged and quoted otherwise.
 * Speaker notes stay plain comments (D7). Merging a slide's adjacent records into one is `mergeAdjacent`'s, a
 * separate pass so this one stays one-to-one and provable.
 *
 * Pure and fs-free (HARD RULE #7).
 */

import { readDirectiveComment } from '../core/comment-directive.mjs';
import { deckModel } from '../core/deck-model.mjs';
import { directiveIslands } from '../core/directive-island.mjs';
import { fenceRanges } from '../core/fence-ranges.mjs';
import { commentSites, ownLineSite, recordParts } from '../core/meta-door.mjs';
import { encodeCommentText, recordValue } from '../core/meta-internal.mjs';

export { recordValue };

import { DIRECTIVE_VOCAB, kebab, MARKER_NAMES, REGISTERS, SLIDE_ONLY_KEYS } from '../core/meta-keys.mjs';

/** The record fields that compose the slide's class (record note §4.2): the typed fields, `class` and every register. */
const CLASS_SHAPED = new Set(['layout', 'variant', 'universal', 'modifiers', 'class', ...REGISTERS.map((r) => r.key)]);

const PANE_RE = /^\s*(_?)(pane|panes)\s*:([\s\S]*)$/;
const CHANNEL_RE = /^\s*(say|describe)\s*:([\s\S]*)$/;

/**
 * The record for ONE directive comment's body, or null when it is not one this migration converts.
 * @param {string} inner  the text between `<!--` and `-->`
 */
export function recordForComment(inner, { components } = {}) {
  const body = String(inner ?? '');
  // Already a record, or the engine's internal form: nothing to migrate.
  if (/^\s*(?:\{|@meta\{|lat-)/.test(body)) return null;
  const marker = body.trim();
  if (MARKER_NAMES.has(marker)) return `{${marker}}`;
  const pane = PANE_RE.exec(body);
  if (pane) return `{${pane[2]}=${recordValue(pane[3].trim())}}`;
  const channel = CHANNEL_RE.exec(body);
  if (channel) {
    const text = channel[2].trim();
    if (!text) return null;
    // A one-line value stays in the record; anything longer becomes a `key: |` block (D2).
    if (!text.includes('\n')) return `{${channel[1]}=${recordValue(encodeCommentText(text))}}`;
    const lines = text.split('\n').map((l) => l.trim());
    return `{}\n${channel[1]}: |\n${lines.map((l) => (l ? `  ${encodeCommentText(l)}` : '')).join('\n')}\n`;
  }
  const dir = readDirectiveComment(`<!--${body}-->`, DIRECTIVE_VOCAB);
  if (!dir) return null;
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

/** The width of an indent, a tab advancing to the next multiple of four. */
function indentWidth(ws) {
  let col = 0;
  for (const ch of ws) col = ch === '\t' ? col + 4 - (col % 4) : col + 1;
  return col;
}

/**
 * Rewrite every top-level directive comment of `source` as a record, in place.
 * @param {string} source  LF source
 * @param {{components?: Set<string>}} [opts]  the catalog's component names: a class that opens with one is written
 *   as the typed `layout=` field. Without it every class stays `class=` (the byte-identity proof runs that way).
 * @returns {{source: string, converted: number, kept: Array<{line: number, why: string}>}}
 *   `kept`: directive comments left as written (inside a list or blockquote), 1-based lines.
 */
export function migrateMetaSource(source, opts = {}) {
  const src = String(source ?? '');
  if (!src.includes('<!--')) return { source: src, converted: 0, kept: [] };
  const model = deckModel(src);
  if (model.text !== src) throw new Error('migrateMetaSource: pass LF source with no BOM');
  const edits = [];
  const kept = [];
  const firstLine = src.slice(0, model.bodyStart).split('\n').length;
  for (const island of directiveIslands(model)) {
    const whole = island.content;
    if (!island.closed || !whole.startsWith('<!--') || whole.indexOf('-->', 4) !== whole.length - 3) continue;
    const inner = whole.slice(4, -3);
    const rec = recordForComment(inner, opts);
    if (!rec) continue;
    const line = firstLine + island.fromLine;
    if (island.level !== 0 || indentWidth(island.indent) > 3) {
      kept.push({ line, why: 'inside a list item or blockquote, where a record is not read; move it to its own line' });
      continue;
    }
    const start = model.bodyStart + model.lineStart(island.fromLine) + island.indent.length;
    const end = model.bodyStart + model.lineEnd(island.toLine - 1);
    const lines = src.slice(start, end).split('\n').length;
    let text = rec.startsWith('{}\n') ? `<!-- {}\n${rec.slice(3)}-->` : `<!-- ${rec} -->`;
    // Keep the comment's line count, so no source position after it moves.
    const have = text.split('\n').length;
    // `text` is this function's own output and always ends `-->`; the padding goes just before it.
    if (have < lines) text = `${text.slice(0, text.endsWith(' -->') ? -4 : -3)}${'\n'.repeat(lines - have)}-->`;
    else if (have > lines) continue; // a one-line say/describe never grows; anything else is left as written
    edits.push([start, end, text]);
  }
  if (!edits.length) return { source: src, converted: 0, kept };
  let out = '';
  let pos = 0;
  for (const [s, e, rep] of edits) {
    out += src.slice(pos, s) + rep;
    pos = e;
  }
  return { source: out + src.slice(pos), converted: edits.length, kept };
}

/**
 * ONE RECORD PER SCOPE (§4.3): each run of record comments on CONSECUTIVE lines, outside code, merged into the first, the
 * lines the others held left blank, so no line after them moves. `<!-- {layout=cards} -->` then `<!-- {footer=Q3} -->`
 * becomes `<!-- {layout=cards, footer=Q3} -->` and a blank line. A run breaks where merging would change what renders:
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
    const ok = parts && !parts.tail.trim() && /^\s*$/.test(parts.prefix) && !parts.items.some((it) => it.name === 'pane' || it.name === 'panes');
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
    out += `${src.slice(pos, first.at)}<!-- ${encodeCommentText(`{${items.join(', ')}}`)} -->${'\n'.repeat(r.sites.length - 1)}`;
    // Everything from the first comment through the last one's line end is replaced; the blank lines keep the count.
    pos = last.end;
    merged += r.sites.length - 1;
  }
  return merged ? { source: out + src.slice(pos), merged } : { source: src, merged: 0 };
}
