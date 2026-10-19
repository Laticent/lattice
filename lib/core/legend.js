/**
 * legend.js — the legend MODEL, its Segno reader, and the HTML emitter.
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
 * component can import it. The SVG emitter needs the chart family's placement pass (`placeLabels`,
 * `wrapSvgLabel`), and lib/core may not import a component (.dependency-cruiser.cjs
 * `core-no-component-imports`), so it sits beside that pass in
 * lib/components/chart/_chart-family/legend-svg.js and reads its model from here. The mark slot is
 * lib/core/legend-mark.js. The plugin shell (manifest, docs, fixtures, stylesheet) is
 * lib/plugins/legend/.
 *
 * READING (§ 5). A legend is written `@legend{…}`. Its entries are records read through two Segno
 * slots in lib/core/segno-slots.js, tried in order: `legend-entry` (text, then pill words, then
 * named `detail=`, `mark=`, `for=`), and on a refusal `legend-keyed` (key, text). A Segno list holds
 * one type and a legend's list holds both shapes, so the entries are read one at a time off the
 * parsed tree rather than through a list parameter.
 *
 * Pure: no DOM, no fs. Both render paths, the narrator and the linter share it (HARD RULE #1).
 */

const { parse: segnoParse } = require('@laticent/segno/read');
const { coreSlot, CORE } = require('./segno-slots.js');
const { markHtml, colorAttr } = require('./legend-mark.js');

const LAYOUTS = Object.freeze(['key', 'anchored', 'along-path']);

/**
 * The slide classes that read a `@legend{…}` paragraph today (Wave 0: the heatmap's anchored labels).
 * The linter warns on a legend anywhere else, because there it renders as code. A hand list, and
 * knowingly so: when a second reader lands it moves to a manifest field the build collects, the way
 * `labelSet` did, rather than growing here.
 */
const LEGEND_READERS = Object.freeze(['heatmap']);

/** Every bare word the entry slot binds by type: a two-word record ending in one reads as an entry. */
const ENTRY_WORDS = new Set([
  ...CORE['legend-entry'].params.shape.values,
  ...CORE['legend-entry'].params.size.values,
  ...Array.from({ length: 12 }, (_, i) => `c${i + 1}`),
]);

const NUMBERISH = /^[-+]?\d+(?:\.\d+)?$/;

/** The span's text with `@legend` peeled off, or null when it is not a legend span. */
function legendBody(text) {
  const s = String(text ?? '').trim();
  if (s.startsWith('@legend{')) return s.slice('@legend'.length);
  return null;
}

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
    if (v.for !== undefined) entry.for = v.for;
    return { ok: true, entry, diagnostics: ambiguity(src) };
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
  return { ok: false, diagnostics: asEntry.diagnostics.map((d) => diag('legend/entry', 'warning', d.message)) };
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
  return [diag(
    'legend/ambiguous-pair', 'warning',
    `\`${src}\` reads as the label "${a}" with the style word \`${b}\`. To name ${a} "${b}", quote it: \`{${a}, "${b}"}\`.`,
  )];
}

function diag(code, severity, message) {
  return { code, severity, message };
}

/**
 * Read a legend span: `@legend{{Peak, for=14}}`, `@legend{[{Poor, c1}, {Good, c3}], key}`, or the
 * same without the `@legend` prefix.
 *
 * The record holds the entries — one entry record, or a list of them — and an optional layout word
 * (`key`, `anchored`, `along-path`, or `layout=…`). With no layout word, a legend whose entries name
 * a mark (`for=`) is `anchored` and any other is a `key`: the two read the way an author means them.
 *
 * @param {string} text
 * @returns {{ok: boolean, legend: {layout: string, entries: object[]} | null, diagnostics: object[]}}
 */
function readLegend(text) {
  const body = legendBody(text) ?? String(text ?? '').trim();
  const p = segnoParse(body);
  if (!p.ok || p.item.name !== null || p.item.tag || p.item.value.kind !== 'record') {
    return { ok: false, legend: null, diagnostics: [diag('legend/syntax', 'warning', `\`${String(text).trim()}\` is not a legend: write \`@legend{{Label, for=…}}\` or \`@legend{[{A, c1}, {B, c2}], key}\`.`)] };
  }
  const entries = [];
  const diagnostics = [];
  let layout = null;
  for (const it of p.item.value.items) {
    const v = it.value;
    if (it.name === 'layout' || (it.name === null && v.kind === 'scalar' && !v.quoted && LAYOUTS.includes(v.text))) {
      if (LAYOUTS.includes(v.text)) layout = v.text;
      else diagnostics.push(diag('legend/layout', 'warning', `\`${v.text}\` is not a legend layout: use ${LAYOUTS.map((l) => `\`${l}\``).join(', ')}.`));
      continue;
    }
    const records = it.name === null && v.kind === 'list' ? v.items.filter(Boolean)
      : it.name === null && v.kind === 'record' ? [v]
        : null;
    if (!records) {
      diagnostics.push(diag('legend/item', 'warning', `\`${body.slice(it.from, it.to)}\` is not a legend entry: write each entry in braces, \`{Label, c2}\`.`));
      continue;
    }
    for (const r of records) {
      const read = readEntry(body.slice(r.from, r.to));
      diagnostics.push(...read.diagnostics);
      if (read.ok) entries.push(read.entry);
    }
  }
  if (!entries.length) {
    diagnostics.push(diag('legend/empty', 'warning', 'The legend has no entries it can draw.'));
    return { ok: false, legend: null, diagnostics };
  }
  const resolved = layout || (entries.some((e) => e.for !== undefined) ? 'anchored' : 'key');
  if (resolved === 'anchored') {
    for (const e of entries) {
      if (e.for === undefined) diagnostics.push(diag('legend/no-target', 'warning', `"${e.text}" is an anchored label with nothing to anchor to: add \`for=\` naming the mark.`));
    }
  }
  return { ok: true, legend: { layout: resolved, entries }, diagnostics };
}

/**
 * `for=` on a GRID (a heatmap): which cell, as the row-major index the cell's `data-mark` carries.
 * Accepts that index (`for=14`) or the cell's name as the chart writes it in `data-label`,
 * `Row · Column` — `/` also separates, so `for=Feb 2026/M2` works without typing a middle dot.
 * Names compare case-insensitively with spaces collapsed. Returns -1 when it names no cell.
 * @param {string|number} target
 * @param {string[]} rows  row labels, in order
 * @param {string[]} cols  column labels, in order
 */
function gridTarget(target, rows, cols) {
  const t = String(target ?? '').trim();
  if (/^\d+$/.test(t)) {
    const i = Number(t);
    return i < rows.length * cols.length ? i : -1;
  }
  const norm = (s) => String(s).toLowerCase().replace(/\s+/g, ' ').trim();
  const parts = t.split(/\s*[·/]\s*/);
  if (parts.length !== 2) return -1;
  const ri = rows.findIndex((r) => norm(r) === norm(parts[0]));
  const ci = cols.findIndex((c) => norm(c) === norm(parts[1]));
  return ri >= 0 && ci >= 0 ? ri * cols.length + ci : -1;
}

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/**
 * The text slot as HTML: bare by default, or on a plate. The plate is the pill's own markup, so the
 * pill's stylesheet draws it and a plate cannot drift from a pill (§ 4 rule 2).
 */
function textHtml(entry) {
  // Beside a mark the color is the MARK's, and the words stay body ink: a key reads its swatches,
  // not a row of colored words. A bare colored label has no mark to carry it, so its words do.
  if (!entry.plate) return `<span class="legend-text"${entry.mark ? '' : colorAttr(entry.color)}>${esc(entry.text)}</span>`;
  const size = entry.size ? ` data-size="${esc(entry.size)}"` : '';
  return `<span class="legend-text lat-pill" data-shape="${esc(entry.plate)}"${colorAttr(entry.color)}${size}>${esc(entry.text)}</span>`;
}

/**
 * THE HTML EMITTER, `key` layout: a list of labels, each `[mark][text]`. A real list, so a screen
 * reader hears one (§ 7 rule 4). A detail rides as the row's `title`, not a second visible line: a
 * key sits under a figure that is already the tallest thing on the slide, and a second line per
 * chip is what pushes a wide key onto two rows.
 *
 * TWO MODES, one markup shape.
 *
 * - The legend's own classes (`classes` omitted): the mark slot draws the mark (legend-mark.js) and
 *   the text slot may carry a plate. This is the free-standing `@legend{…, key}`.
 * - A component's own classes (`classes` given): the component keeps its stylesheet's recipe. Its
 *   swatch is an empty span whose look comes from the classes on the row (`rowClass`) or on the
 *   swatch itself (`swatch`), so the key is painted by the same rule as the cells it decodes and the
 *   two cannot drift. This mode replaced lib/core/html-legend.js (Wave 1, § 10) and emits exactly
 *   what it did, byte for byte: roadmap, matrix-grid and obligation-matrix render unchanged.
 *
 * CLASSES ARE PASSED IN FULL, never composed from a prefix: `checkChartMarks` finds a declared mark
 * class by a whole-token search of string literals under lib/, and a composed one is invisible to it.
 *
 * ESCAPING: labels are author text (a label set renames them) and every class is interpolated into
 * an attribute, so all of it goes through `esc` (HARD RULE #22).
 *
 * @param {object[]} entries  legend entries; in the component mode also `rowClass` and `swatch`
 * @param {object} [o]
 * @param {{list: string, item: string, mark: string, label: string}} [o.classes]
 * @param {string} [o.ariaLabel]  the list's accessible name
 * @param {string} [o.tag]        `'ul'` (default) or `'ol'` when the order is meaningful
 * @returns {string} the key, or '' when no entry has text (a grid with no markers needs no key)
 */
function keyHtml(entries, { classes = null, ariaLabel = 'Key', tag = 'ul' } = {}) {
  const list = Array.isArray(entries) ? entries.filter((e) => e?.text) : [];
  if (!list.length) return '';
  const t = tag === 'ol' ? 'ol' : 'ul';
  const c = classes || OWN_CLASSES;
  const rows = list.map((e) => {
    const title = e.detail ? ` title="${esc(e.detail)}"` : '';
    const row = e.rowClass ? ` ${esc(e.rowClass)}` : '';
    const mark = classes
      ? `<span class="${esc(c.mark)}${e.swatch ? ` ${esc(e.swatch)}` : ''}" aria-hidden="true"></span>`
      : markHtml(e.mark, { color: e.color });
    const text = classes ? `<span class="${esc(c.label)}">${esc(e.text)}</span>` : textHtml(e);
    return `<li class="${esc(c.item)}${row}"${title}>${mark}${text}</li>`;
  }).join('');
  return `<${t} class="${esc(c.list)}" aria-label="${esc(ariaLabel)}">${rows}</${t}>`;
}

const OWN_CLASSES = Object.freeze({ list: 'legend legend--key', item: 'legend-label' });

/** A whole legend in the `key` layout, in the legend's own classes. */
function legendHtml(legend, { ariaLabel = 'Key' } = {}) {
  return keyHtml(legend?.entries, { ariaLabel });
}

/** An entry as one spoken or described phrase: "Month 2 drop-off". The detail is separate (§ 7). */
function entryPhrase(entry) {
  return entry.key !== undefined ? `${entry.key}, ${entry.text}` : entry.text;
}

module.exports = {
  LAYOUTS, LEGEND_READERS, readLegend, readEntry, legendBody, gridTarget, legendHtml, keyHtml, entryPhrase, textHtml,
};
