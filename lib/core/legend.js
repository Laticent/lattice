/**
 * legend.js — the legend MODEL and its Segno reader.
 *
 * Design: engineering/decisions/2026-10-19-universal-legend.md. One model replaces the eleven key and
 * label implementations the charts grew one at a time:
 *
 *   legend = { entries: label[], layout: key | anchored | along-path }
 *   label  = { text, key?, detail?, mark?, plate?, size?, color?, for? }
 *
 * TEXT IS THE ONLY REQUIRED SLOT. A bare label is text with no mark and no plate, and that is the
 * default (§ 4 rule 1). The plate IS the pill (rule 2): it takes the pill's shape words, color slots
 * and stylesheet, so a plate in a key paints exactly as `{LIVE, tag, c4}` does in prose.
 *
 * WHERE THE PARTS LIVE. This file is pure and component-agnostic, so it lives in lib/core and every
 * component can import it. It holds the reader. The HTML key is lib/core/legend-key.js (what a
 * component's own key needs) and lib/core/legend-html.js (the legend's own classes); the mark slot
 * is lib/core/legend-mark.js. They are split so the preview runtime bundles only what its callers
 * use. The SVG emitter needs the chart family's label kernel, and lib/core may not import a
 * component (.dependency-cruiser.cjs `core-no-component-imports`), so it sits beside that kernel in
 * lib/components/chart/_chart-family/legend-svg.js. The plugin shell (manifest, docs, fixtures,
 * stylesheet) is lib/plugins/legend/.
 *
 * TWO PLUGINS, ONE MODEL (engineering/decisions/2026-10-20-callout-placement.md § 2). The owner split
 * callouts from the key: `@callout{…}` is a note pinned to a mark (always `anchored`), and `@legend{…}`
 * is the key. Both read through this file. A `@legend{…}` span that pins a mark is the callout spelling
 * every heatmap deck used before the split, so it still reads as a callout, and `lint:deck` suggests
 * `@callout`.
 *
 * READING (§ 5). A legend is written `@legend{…}`, a callout `@callout{…}`. Its entries are records read through two Segno
 * slots in lib/core/segno-slots.js, tried in order: `legend-entry` (text, then pill words, then
 * named `detail=`, `mark=`, `for=`), and on a refusal `legend-keyed` (key, text). A Segno list holds
 * one type and a legend's list holds both shapes, so the entries are read one at a time off the
 * parsed tree rather than through a list parameter.
 *
 * Pure: no DOM, no fs. Both render paths, the narrator and the linter share it (HARD RULE #1).
 */

const { parse: segnoParse } = require('@laticent/segno/read');
const { coreSlot, CORE } = require('./segno-slots.js');
const { PLUGIN_AXIS_REGISTERS } = require('./axis-registers.js');

const LAYOUTS = Object.freeze(['key', 'anchored', 'along-path']);

/**
 * The slide classes that read a `@callout{…}` (or `@legend{…}`) paragraph today: the heatmap's anchored
 * labels. The linter warns on one anywhere else, because there it renders as code. A hand list, and
 * knowingly so: when a second reader lands it moves to a manifest field the build collects, the way
 * `labelSet` did, rather than growing here.
 */
const CALLOUT_READERS = Object.freeze(['heatmap']);

/** Every bare word the entry slot binds by type: a two-word record ending in one reads as an entry. */
const ENTRY_WORDS = new Set([
  ...CORE['legend-entry'].params.shape.values,
  ...CORE['legend-entry'].params.size.values,
  ...Array.from({ length: 12 }, (_, i) => `c${i + 1}`),
]);

const NUMBERISH = /^[-+]?\d+(?:\.\d+)?$/;

/** Which plugin a span is written for: `callout`, `legend`, or null when it is neither. */
const spanKind = (text) => /^\s*@(callout|legend)\{/.exec(text ?? '')?.[1] || null;

/** The span's text with `@callout` or `@legend` peeled off, or null when it is neither span. */
const legendBody = (text) => /^\s*@(?:callout|legend)(\{[\s\S]*)/.exec(text ?? '')?.[1].trim() ?? null;

/**
 * One entry record, read through the two slots in order.
 * @param {string} src  the record's own source, braces included
 * @returns {{ok: true, entry: object, diagnostics: object[]} | {ok: false, diagnostics: object[]}}
 */
function readEntry(src) {
  const asEntry = coreSlot('legend-entry').read(src);
  if (asEntry.ok) {
    const v = asEntry.value;
    const entry = { text: v.text };
    if (v.shape) entry.plate = v.shape;
    if (v.color) entry.color = v.color;
    if (v.size) entry.size = v.size;
    if (v.detail) entry.detail = v.detail;
    if (v.mark) entry.mark = v.mark;
    const diagnostics = ambiguity(src);
    const pair = v.row !== undefined && v.col !== undefined;
    if (pair) {
      // `row=` and `col=` name a cell by its labels; the pair is the target, as `for=` is.
      entry.for = { row: v.row, col: v.col };
      if (v.for !== undefined) diagnostics.push(diag('legend/two-targets', { text: v.text, drawn: 'pair' }));
    } else if (v.for !== undefined) {
      // A half pair beside `for=` is a slip, and `for=` is the target that can still resolve.
      entry.for = v.for;
      if (v.row !== undefined || v.col !== undefined) diagnostics.push(diag('legend/two-targets', { text: v.text, drawn: 'for' }));
    } else if (v.row !== undefined || v.col !== undefined) {
      entry.for = { row: v.row, col: v.col };
      diagnostics.push(diag('legend/half-target', { text: v.text, has: v.row === undefined ? 'col' : 'row' }));
    }
    return { ok: true, entry, diagnostics };
  }
  const asKeyed = coreSlot('legend-keyed').read(src);
  if (asKeyed.ok) {
    const v = asKeyed.value;
    const entry = { key: v.key, text: v.text };
    if (v.color) entry.color = v.color;
    if (v.detail) entry.detail = v.detail;
    return { ok: true, entry, diagnostics: [] };
  }
  // The entry slot's reason is the useful one: an author writing an entry is told what an entry takes.
  return { ok: false, diagnostics: asEntry.diagnostics.map((d) => diag('legend/entry', { reason: d.message })) };
}

/**
 * THE ONE SHAPE THAT READS WRONG SILENTLY (§ 13). `{1, lg}` meant as the keyed pair "1 → lg" reads
 * as the label "1" in size lg, with no error, because the entry slot is asked first. A number
 * followed by exactly one vocabulary word is that shape: `{Poor, c1}` is not (its text is a word),
 * so the warning stays off the form the design teaches.
 */
function ambiguity(src) {
  const p = segnoParse(src);
  if (!p.ok || p.item.value.kind !== 'record') return [];
  const items = p.item.value.items;
  if (items.length !== 2 || items.some((it) => it.name !== null || it.value.kind !== 'scalar' || it.value.quoted)) return [];
  const [a, b] = items.map((it) => it.value.text);
  if (!NUMBERISH.test(a) || !ENTRY_WORDS.has(b)) return [];
  return [diag('legend/ambiguous-pair', { src, a, b })];
}

/**
 * A diagnostic is a code and the facts it names, never prose: the words are the linter's
 * (lib/authoring/legend-messages.js). This module ships in the preview runtime, which renders a
 * legend and reports nothing, so the sentences would be bytes every page loads for no reader.
 */
function diag(code, args = {}) {
  return { code, severity: 'warning', args };
}

/**
 * Read a legend span: `@callout{{Peak, for=14}}`, `@legend{[{Poor, c1}, {Good, c3}], key}`, or the
 * same without a prefix.
 *
 * The record holds the entries — one entry record, or a list of them — and an optional layout word
 * (`key`, `anchored`, `along-path`, or `layout=…`). A `@callout` span is always `anchored`: a layout
 * word in it is reported and ignored. With no prefix and no layout word, a legend whose entries name
 * a mark (`for=`) is `anchored` and any other is a `key`: the two read the way an author means them.
 * The result carries `kind`: the prefix the author wrote, or null for none.
 *
 * @param {string} text
 * @returns {{ok: boolean, legend: {layout: string, entries: object[]} | null, diagnostics: object[]}}
 */
function readLegend(text) {
  const kind = spanKind(text);
  const body = legendBody(text) ?? String(text ?? '').trim();
  const p = segnoParse(body);
  if (!p.ok || p.item.name !== null || p.item.tag || p.item.value.kind !== 'record') {
    return { ok: false, legend: null, diagnostics: [diag('legend/syntax', { text: String(text ?? '').trim() })] };
  }
  const entries = [];
  const diagnostics = [];
  let layout = null;
  for (const it of p.item.value.items) {
    const v = it.value;
    if (it.name === 'layout' || (it.name === null && v.kind === 'scalar' && !v.quoted && LAYOUTS.includes(v.text))) {
      // In a `@callout` span a layout word is ignored below; `lint:deck` says so (lint-core.js).
      if (LAYOUTS.includes(v.text)) layout = v.text;
      else diagnostics.push(diag('legend/layout', { word: v.text }));
      continue;
    }
    const records = it.name === null && v.kind === 'list' ? v.items.filter(Boolean)
      : it.name === null && v.kind === 'record' ? [v]
        : null;
    if (!records) {
      diagnostics.push(diag('legend/item', { item: body.slice(it.from, it.to) }));
      continue;
    }
    for (const r of records) {
      const read = readEntry(body.slice(r.from, r.to));
      diagnostics.push(...read.diagnostics);
      if (read.ok) entries.push(read.entry);
    }
  }
  if (!entries.length) {
    diagnostics.push(diag('legend/empty'));
    return { ok: false, legend: null, diagnostics };
  }
  const resolved = kind === 'callout' ? 'anchored' : layout || (entries.some((e) => e.for !== undefined) ? 'anchored' : 'key');
  if (resolved === 'anchored') {
    for (const e of entries) {
      if (e.for === undefined) diagnostics.push(diag('legend/no-target', { text: e.text }));
    }
  }
  return { ok: true, legend: { layout: resolved, entries }, kind, diagnostics };
}

/**
 * A label's target on a GRID (a heatmap): which cell, as the row-major index the cell's `data-mark`
 * carries. The documented form is the pair `row=` / `col=`, by the labels the chart prints
 * (`{row: 'Feb 2026', col: 'M2'}`), the way pandas' `.loc` and a reader both name a cell. The
 * short forms are `for=`: the index (`for=14`), or `Row/Column` (`for=Feb 2026/M2`). `·`, the
 * separator the chart itself prints in `data-label`, is read too but not taught, because nobody
 * types it. Names compare case-insensitively with spaces collapsed. Returns -1 when it names no cell.
 * @param {string|number|{row?: string, col?: string}} target
 * @param {string[]} rows  row labels, in order
 * @param {string[]} cols  column labels, in order
 */
function gridTarget(target, rows, cols) {
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const cell = (row, col) => {
    const ri = rows.findIndex((r) => norm(r) === norm(row));
    const ci = cols.findIndex((c) => norm(c) === norm(col));
    return ri >= 0 && ci >= 0 ? ri * cols.length + ci : -1;
  };
  if (target && typeof target === 'object') {
    return target.row === undefined || target.col === undefined ? -1 : cell(target.row, target.col);
  }
  const t = String(target ?? '').trim();
  if (/^\d+$/.test(t)) {
    const i = Number(t);
    return i < rows.length * cols.length ? i : -1;
  }
  const parts = t.split(/\s*[·/]\s*/);
  return parts.length === 2 ? cell(parts[0], parts[1]) : -1;
}

/** A target as the author wrote it, for a message or a description: `row=…, col=…` or `for=…`. */
function targetText(target) {
  if (target && typeof target === 'object') {
    return [target.row !== undefined && `row=${target.row}`, target.col !== undefined && `col=${target.col}`].filter(Boolean).join(', ');
  }
  return `for=${target ?? 'nothing'}`;
}

/** The `callout:` register (the plugin's manifest declares it; lib/core/register-factory.js builds it). */
const CALLOUT_REGISTER = PLUGIN_AXIS_REGISTERS.find((r) => r.key === 'callout') || null;

/**
 * Are callouts switched off for one slide? THE ONE READING every surface shares, so the render,
 * the narrator and the linter cannot disagree about a deck (the checker found three readings that
 * did): the host's switch first (`callout` among the plugins it left off, which no slide
 * overrides), then the slide's own class words (`callout-off` hides, `callout-on` shows; a slide's
 * word evicts the deck's stamped one), then, given the deck's front matter instead of stamped
 * classes (the narrator, the linter), its `callout:` register. The pre-split `legend:` switches are
 * not read: the owner dropped them to keep the preview runtime under its byte ceiling
 * (engineering/decisions/2026-10-20-callout-placement.md § 2).
 * @param {{tokens?: string[], frontMatter?: string, pluginsOff?: Iterable<string>|null}} o
 */
function calloutsOff({ tokens = [], frontMatter = '', pluginsOff = null } = {}) {
  if (pluginsOff && [...pluginsOff].includes('callout')) return true;
  if (tokens.includes('callout-off')) return true;
  if (tokens.includes('callout-on')) return false;
  return !!(CALLOUT_REGISTER && frontMatter && CALLOUT_REGISTER.classesFromFrontMatter(frontMatter).includes('callout-off'));
}

/**
 * The most anchored labels one figure draws: six, one per marker shape (design note § 18). A callout
 * is tied to its mark by shape and color, and about six shapes are told apart at a glance; past that
 * the chart is making more points than one slide should. The render draws the first six as written
 * and lists the rest in the chart's description as not drawn, the narrator says only those six, and
 * `lint:deck` warns on the rest. A warning, never an error: we coach authors, we do not refuse decks.
 */
const MAX_ANCHORED = 6;

module.exports = {
  MAX_ANCHORED, LAYOUTS, CALLOUT_READERS, readLegend, readEntry, legendBody, spanKind,
  gridTarget, targetText, calloutsOff,
};
