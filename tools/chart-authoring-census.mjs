#!/usr/bin/env node
/**
 * chart-authoring-census — every chart slide's rewrite count under the chart authoring model, by chart and slot.
 *
 * It measures how every chart slide in the corpus is written today against the uniform authoring
 * model, and how many rewrites that model costs.
 *
 * The model is engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §2: a list row
 * is a label plus ONE `{…}` record; a series chart is a table (label column, one column per
 * series); a grid chart is a table whose crossings are values; a description is a `>` blockquote
 * indented under its list item, or `{> text}` in a table cell; a number is ISO (point decimal,
 * space grouping, never a comma). This is phase 1 of that note: it changes no behavior. Phase 2's
 * schemas and phase 4's codemod scope rest on the numbers it prints.
 *
 * WHY MARKDOWN-IT AND NOT A REGEX. The earlier counts in that note (§9) were regex counts with
 * `.docs.md` left out, and the trio found them wrong in places. A list row, a nested detail
 * bullet, a lazy blockquote and a table cell are decided by the CommonMark parser, not by a line
 * pattern, so this reads each slide with markdown-it (default preset: GFM tables) and walks the
 * tokens. Slides are split by the engine's own boundary source (lib/core/section-source-split.js),
 * so a `split: headings` deck divides where the render divides.
 *
 * WHY A SPAN IS CLASSIFIED BY ITS SLOT. A codemod keyed on spans alone would wrap a kicker
 * (`` `Revenue · FY26` `` above the heading) and prose code, so every span is counted by where it
 * sits: heading, the paragraph above the data (kicker / axes), the paragraph below (key /
 * caption), a list row's lead, a nested row's lead, a table header or body cell, a blockquote.
 * Only the row and cell slots are the codemod's to touch.
 *
 * A value is a span `isValuePill` (lib/core/chart-values.js, Segno's whole-value reader) accepts —
 * the same test `parseSeries` uses to call a nested row DATA rather than DETAIL — so the
 * data/detail split here is the transforms' split, not a second opinion.
 *
 * Corpus: the decks we ship (examples/, test/integration/baseline-decks/, the galleries
 * lib/components/**\/*.gallery.md and design/*.gallery.md, exemplars/, kit/); every fenced
 * `markdown` block in lib/components/**\/*.docs.md, because a doc's example is what an author
 * copies; and every chart manifest string that holds a `_class` directive (`sample`,
 * `skeleton`), because that is what the Insert menu and agents insert. Left out, and named so:
 * .vscode snippets, .mdx pages and test fixtures.
 *
 * Usage:
 *   node tools/chart-authoring-census.mjs              # Markdown tables to stdout
 *   node tools/chart-authoring-census.mjs --json out.json
 *   node tools/chart-authoring-census.mjs --chart bar  # one chart's rows, with file:slide refs
 *   node tools/chart-authoring-census.mjs --only deck  # decks only (or `docs`, `manifest`)
 *
 * On-demand, not a gate: a corpus edit moves every number.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const MarkdownIt = require('markdown-it');
const { splitSourceToSections } = require('../lib/core/section-source-split.js');
const { isValuePill } = require('../lib/core/chart-values.js');
const { MARKER_CLASS } = require('../lib/core/state-marks.js');

/** A whole span that is one state mark (`[x]`), and a cell that leads with one. */
const MARK_SPAN = new RegExp(`^\\[${MARKER_CLASS}\\]$`);
const MARK_LEAD = new RegExp(`^\\[${MARKER_CLASS}\\]`);

const md = new MarkdownIt('default', { html: true });

// ── The model (§2 of the note) ───────────────────────────────────────────────────────────────
const LIST = ['bar', 'line', 'piechart', 'funnel', 'waterfall', 'word-cloud', 'map', 'scatter', 'quadrant'];
const SERIES = ['stacked-bar', 'slope', 'radar']; // plus bar and line when they carry nested series
const GRID = ['heatmap', 'matrix-grid'];
const OPEN = ['bullet', 'progress']; // §7: list records or tables, the owner's call
const OUTSIDE = ['gantt', 'kanban', 'journey', 'flowchart', 'state-chart', 'hub-spoke', 'roadmap', 'timeline-list'];
const CHARTS = [...LIST, ...SERIES, ...GRID, ...OPEN, ...OUTSIDE];
const shapeOf = (c) => (LIST.includes(c) ? 'list' : SERIES.includes(c) ? 'series' : GRID.includes(c) ? 'grid' : OPEN.includes(c) ? 'open' : 'outside');

// ── The corpus ───────────────────────────────────────────────────────────────────────────────
function walk(dir, keep, out = []) {
  let names;
  try { names = readdirSync(dir); } catch { return out; }
  for (const n of names) {
    if (n === 'node_modules' || n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, keep, out);
    else if (keep(p)) out.push(p);
  }
  return out;
}
const isMd = (p) => p.endsWith('.md') && !p.endsWith('README.md');

function corpus() {
  const decks = [
    ...walk(join(ROOT, 'examples'), isMd),
    ...walk(join(ROOT, 'test/integration/baseline-decks'), isMd),
    ...walk(join(ROOT, 'lib/components'), (p) => p.endsWith('.gallery.md')),
    ...walk(join(ROOT, 'exemplars'), isMd),
    ...walk(join(ROOT, 'kit'), isMd),
    ...walk(join(ROOT, 'design'), (p) => p.endsWith('.gallery.md')),
  ].sort().map((f) => ({ file: relative(ROOT, f), kind: 'deck', source: readFileSync(f, 'utf8') }));
  const docs = [];
  for (const f of walk(join(ROOT, 'lib/components'), (p) => p.endsWith('.docs.md')).sort()) {
    const src = readFileSync(f, 'utf8');
    let n = 0;
    for (const t of md.parse(src, {})) {
      if (t.type !== 'fence' || !/^(markdown|md)\b/.test(t.info.trim())) continue;
      docs.push({ file: `${relative(ROOT, f)}#${++n}`, kind: 'docs', source: t.content });
    }
  }
  // A manifest's `sample` and `skeleton` strings (and any other string holding a `_class`
  // directive) are the text the Insert menu, the catalog and agents copy, so a codemod that
  // misses them keeps inserting the old syntax.
  const manifests = [];
  for (const f of walk(join(ROOT, 'lib/components/chart'), (p) => p.endsWith('.manifest.json')).sort()) {
    const visit = (v, key) => {
      if (typeof v === 'string') { if (/_class:/.test(v)) manifests.push({ file: `${relative(ROOT, f)}#${key}`, kind: 'manifest', source: v }); return; }
      if (Array.isArray(v)) v.forEach((x, i) => { visit(x, `${key}[${i}]`); });
      else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) visit(x, key ? `${key}.${k}` : k);
    };
    visit(JSON.parse(readFileSync(f, 'utf8')), '');
  }
  return [...decks, ...docs, ...manifests];
}

// ── One slide ────────────────────────────────────────────────────────────────────────────────
const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const deckClass = (src) => (src.match(FRONT)?.[1].match(/^class:\s*(.+)$/m)?.[1] ?? '').replace(/["']/g, '').trim();
function slideClass(src, fallback) {
  const m = [...src.matchAll(/<!--\s*_?class:\s*([^>]*?)\s*-->/g)].pop();
  return (m ? m[1] : fallback).replace(/["']/g, '').split(/\s+/).filter(Boolean);
}

/** What a code span is, by its text. */
function spanKind(text) {
  if (/^\\[{[~^]/.test(text)) return 'escaped';
  if (/^\{>/.test(text)) return 'description';
  if (/^\{[\s\S]*\}$/.test(text)) return 'record';
  if (/^\[[\s\S]*\]$/.test(text)) return MARK_SPAN.test(text) ? 'mark' : 'bracket';
  if (/^~\{/.test(text)) return 'spark';
  if (/^\^\{/.test(text)) return 'icon';
  if (isValuePill(text)) return 'value';
  return 'text';
}
/** A comma that a reader of today takes as grouping or decimal; ISO input never has one. */
const COMMA_NUMBER = /\d,\d/;
/** A pasted locale number with a dot as grouping (`12.000`, `1.234,5`). */
const DOT_GROUPED = /^\D*\d{1,3}(\.\d{3})+(,\d+)?\D*$/;

/** Is this list item a data row: its last span on its own line is a value or a record? */
const isDataItem = (it) => { const k = codesOf(it.lead).map(spanKind); return k.length > 0 && (k.at(-1) === 'value' || k.at(-1) === 'record'); };
/** Does any row below this item hold data? Then the item is a GROUP (radar quadrant's middle level). */
const hasDataBelow = (it) => it.children.some((c) => isDataItem(c) || hasDataBelow(c));
/** The row's label: its own text with the spans removed. Bullet reads `Band`, `Target`, `Floor` by name. */
const labelOf = (it) => (it.lead?.children ?? []).filter((c) => c.type === 'text').map((c) => c.content).join('').trim();
const codesOf = (inline) => (inline?.children ?? []).filter((c) => c.type === 'code_inline').map((c) => c.content);

/** Build a light tree of the slide's top-level blocks from markdown-it's flat token stream. */
function blocks(tokens) {
  const out = [];
  let i = 0;
  function list(start) {
    // tokens[start] is bullet_list_open / ordered_list_open; returns [node, next index]
    const items = [];
    let j = start + 1;
    const depth = 0;
    while (j < tokens.length) {
      const t = tokens[j];
      if ((t.type === 'bullet_list_close' || t.type === 'ordered_list_close') && depth === 0) return [{ type: 'list', items, line: tokens[start].map?.[0] }, j + 1];
      if (t.type === 'list_item_open') {
        const item = { lead: null, children: [], quotes: [], line: t.map?.[0] };
        let k = j + 1;
        while (tokens[k].type !== 'list_item_close') {
          const u = tokens[k];
          if (u.type === 'paragraph_open') {
            if (!item.lead) item.lead = tokens[k + 1];
            else item.extraParagraphs = (item.extraParagraphs || 0) + 1;
            k += 3;
          } else if (u.type === 'bullet_list_open' || u.type === 'ordered_list_open') {
            const [node, next] = list(k);
            item.children.push(...node.items);
            k = next;
          } else if (u.type === 'blockquote_open') {
            let d = 1; let q = k + 1; const inl = [];
            while (d) { if (tokens[q].type === 'blockquote_open') d++; if (tokens[q].type === 'blockquote_close') d--; if (tokens[q].type === 'inline') inl.push(tokens[q]); q++; }
            item.quotes.push(inl);
            k = q;
          } else if (u.type === 'table_open') {
            item.table = true;
            while (tokens[k].type !== 'table_close') k++;
            k++;
          } else k++;
        }
        items.push(item);
        j = k + 1;
        continue;
      }
      j++;
    }
    return [{ type: 'list', items }, j];
  }
  while (i < tokens.length) {
    const t = tokens[i];
    if (t.type === 'bullet_list_open' || t.type === 'ordered_list_open') { const [n, next] = list(i); out.push(n); i = next; continue; }
    if (t.type === 'table_open') {
      const head = []; const body = []; let row = null; let inHead = false; let j = i + 1;
      while (tokens[j].type !== 'table_close') {
        const u = tokens[j];
        if (u.type === 'thead_open') inHead = true;
        if (u.type === 'thead_close') inHead = false;
        if (u.type === 'tr_open') row = [];
        if (u.type === 'tr_close') (inHead ? head : body).push(row);
        if (u.type === 'inline') row.push(u);
        j++;
      }
      out.push({ type: 'table', head, body, line: t.map?.[0] });
      i = j + 1;
      continue;
    }
    if (t.type === 'paragraph_open') { out.push({ type: 'paragraph', inline: tokens[i + 1] }); i += 3; continue; }
    if (t.type === 'heading_open') { out.push({ type: 'heading', inline: tokens[i + 1] }); i += 3; continue; }
    if (t.type === 'blockquote_open') {
      let d = 1; let q = i + 1; const inl = [];
      while (d) { if (tokens[q].type === 'blockquote_open') d++; if (tokens[q].type === 'blockquote_close') d--; if (tokens[q].type === 'inline') inl.push(tokens[q]); q++; }
      out.push({ type: 'blockquote', inlines: inl });
      i = q;
      continue;
    }
    if (t.type === 'fence' || t.type === 'html_block' || t.type === 'hr') { out.push({ type: t.type }); i++; continue; }
    i++;
  }
  return out;
}

// ── Counting ─────────────────────────────────────────────────────────────────────────────────
function blank() {
  return {
    slides: 0, decks: 0, docs: 0, manifests: 0, lists: 0, tables: 0, listAndTable: 0,
    rows: 0, nested: { 2: 0, 3: 0, '4+': 0 },
    lead: { none: 0, value: 0, record: 0, text: 0, other: 0, multi: 0 },
    nestedData: 0, nestedDetail: 0, nestedGroupRows: 0, seriesSlides: 0, seriesPoints: 0,
    detailBullets: 0, detailUnderValue: 0, quoteDescriptions: 0, column0Quotes: 0,
    commaNumbers: 0, dotGrouped: 0,
    cells: 0, headerCells: 0, cellPlainNumber: 0, cellCodeSpan: 0, cellMark: 0, cellNonNumeric: 0, cellEmpty: 0, cellNoteSpan: 0,
    slot: { heading: 0, aboveBracket: 0, aboveOther: 0, below: 0, rowLead: 0, nestedLead: 0, quote: 0, header: 0, cell: 0 },
    nestedGroups: 0, groupedSeriesSlides: 0, named: {}, secondSpan: {},
    rewrite: { wrap: 0, wrapText: 0, merge: 0, detailToQuote: 0, detailToCell: 0, groupSpan: 0, namedToParam: 0, listToTable: 0, tableCells: 0, number: 0, noteSpan: 0, strictCell: 0 },
    modifiers: {}, refs: [],
  };
}

function countSlide(chart, tokens, src, s, ref) {
  const bs = blocks(md.parse(src, {}));
  const dataIdx = bs.findIndex((b) => b.type === 'list' || b.type === 'table');
  const hasList = bs.some((b) => b.type === 'list');
  const hasTable = bs.some((b) => b.type === 'table');
  if (hasList) s.lists++;
  if (hasTable) s.tables++;
  if (hasList && hasTable) s.listAndTable++;
  for (const t of tokens.slice(1)) s.modifiers[t] = (s.modifiers[t] || 0) + 1;

  // Spans outside the data: by slot. "above" and "below" are relative to the first data block.
  bs.forEach((b, idx) => {
    if (b.type === 'heading') s.slot.heading += codesOf(b.inline).length;
    if (b.type === 'paragraph') {
      for (const c of codesOf(b.inline)) {
        if (dataIdx !== -1 && idx > dataIdx) s.slot.below++;
        else s.slot[spanKind(c) === 'bracket' ? 'aboveBracket' : 'aboveOther']++;
      }
    }
    if (b.type === 'blockquote') s.slot.quote += b.inlines.flatMap(codesOf).length;
  });

  // A column-0 `>` between two lists ends the first one (lint rule `chart-list-split-quote`): list, quote, list.
  for (let i = 1; i + 1 < bs.length; i++) {
    if (bs[i].type === 'blockquote' && bs[i - 1].type === 'list' && bs[i + 1].type === 'list') s.column0Quotes++;
  }

  const firstList = bs.find((b) => b.type === 'list');
  const row = { ref, rows: 0, series: false };
  if (firstList) {
    let slideHasSeries = false;
    const visit = (items, depth, parentKind) => {
      for (const it of items) {
        const codes = codesOf(it.lead);
        s.slot[depth === 1 ? 'rowLead' : 'nestedLead'] += codes.length;
        s.slot.quote += it.quotes.flat().flatMap(codesOf).length;
        s.quoteDescriptions += it.quotes.length;
        const kinds = codes.map(spanKind);
        const dataKinds = kinds.filter((k) => k === 'value' || k === 'record');
        for (const c of codes) {
          if (spanKind(c) === 'value' && COMMA_NUMBER.test(c)) { s.commaNumbers++; s.rewrite.number++; }
          if (spanKind(c) === 'record' && COMMA_NUMBER.test(c)) s.commaNumbers++;
          if (DOT_GROUPED.test(c)) s.dotGrouped++;
        }
        const lastIsValue = kinds.length && (kinds.at(-1) === 'value' || kinds.at(-1) === 'record');
        if (depth === 1) {
          s.rows++;
          row.rows++;
          if (!codes.length) s.lead.none++;
          else if (codes.length > 1) s.lead.multi++;
          else s.lead[{ value: 'value', record: 'record', text: 'text' }[kinds[0]] ?? 'other']++;
          if (codes.length > 1) { const key = kinds.join(' + '); s.secondSpan[key] = (s.secondSpan[key] || 0) + 1; }
        } else {
          s.nested[depth >= 4 ? '4+' : depth]++;
          if (lastIsValue) s.nestedData++;
          else if (hasDataBelow(it)) s.nestedGroups++;
          else { s.nestedDetail++; if (parentKind === 'data') s.detailUnderValue++; }
          if (chart === 'bullet') { const n = lastIsValue ? (labelOf(it).match(/^(Band|Range|Target|Plan|Goal|Actual|Measure|Floor|Base)\b/)?.[1] ?? 'unnamed value') : 'detail'; s.named[n] = (s.named[n] || 0) + 1; }
        }
        const kind = lastIsValue ? 'data' : 'group';
        if (depth === 1 && (it.children.some(isDataItem) || (chart === 'radar' && hasDataBelow(it)))) {
          slideHasSeries = true;
          s.nestedGroupRows++;
        }
        // Rewrites under §2, for the charts the model covers.
        const shape = shapeOf(chart);
        if (depth === 1 && (shape === 'list' || shape === 'open')) {
          // A lone value, or a lone text value (map's categories), becomes the row's one record.
          if (codes.length === 1 && (kinds[0] === 'value' || kinds[0] === 'text')) {
            s.rewrite.wrap++;
            if (kinds[0] === 'text') s.rewrite.wrapText++;
          }
          if (codes.length > 1 && dataKinds.length) s.rewrite.merge++;
        }
        // Bullet's named nested rows (`Band`, `Floor`, …) fold into the row's record as parameters.
        if (chart === 'bullet' && depth > 1 && lastIsValue) s.rewrite.namedToParam++;
        visit(it.children, depth + 1, kind);
      }
    };
    visit(firstList.items, 1, 'group');
    // Does this slide become a table under §2? A series chart (or bar / line with nested series)
    // does, except radar's grouped `quadrant` variant, which no GFM table holds.
    const grouped = chart === 'radar' && firstList.items.some((it) => it.children.some((c) => !isDataItem(c) && hasDataBelow(c)));
    const becomesTable = !grouped && (shapeOf(chart) === 'series' || (slideHasSeries && (chart === 'bar' || chart === 'line')));
    // Detail bullets: a nested row with no value, on a chart where §3 decision 7 retires them.
    const countDetail = (items, depth) => {
      for (const it of items) {
        const k = codesOf(it.lead).map(spanKind);
        const isData = k.length && (k.at(-1) === 'value' || k.at(-1) === 'record');
        if (depth > 1 && !isData && !hasDataBelow(it)) {
          // quadrant's four named groups sit at depth 1 with points at depth 2; a depth-1 label
          // with nested points is a group, never detail.
          s.detailBullets++;
          // On a slide that becomes a table the detail becomes a `{> …}` cell, not a blockquote.
          if (shapeOf(chart) !== 'outside') s.rewrite[becomesTable ? 'detailToCell' : 'detailToQuote']++;
        }
        countDetail(it.children, depth + 1);
      }
    };
    countDetail(firstList.items, 1);
    // Quadrant's four named groups are groups, not series; bullet's named sublist is its range.
    if (slideHasSeries && ['bar', 'line', 'stacked-bar', 'slope', 'radar'].includes(chart)) {
      s.seriesSlides++;
      row.series = true;
      // A span on a group row of a series slide (slope's `fail`, stacked-bar's total) has no
      // cell in a series table: it needs a column or a span on the label cell.
      s.rewrite.groupSpan += firstList.items.filter((it) => codesOf(it.lead).length).length;
      // Radar's `quadrant` variant nests series, then group, then axis: no GFM table holds it (§7).
      if (grouped) s.groupedSeriesSlides++;
      else {
        s.rewrite.listToTable++;
        const pts = (items) => items.reduce((n, it) => n + it.children.filter(isDataItem).length, 0);
        s.seriesPoints += pts(firstList.items);
      }
    }
  }
  if (shapeOf(chart) === 'series' && firstList && !row.series) {
    // A series chart with no nested data: a flat list, still one series column under §2.
    s.rewrite.listToTable++;
  }

  for (const t of bs.filter((b) => b.type === 'table')) {
    for (const r of t.head) for (const c of r) { s.headerCells++; s.slot.header += codesOf(c).length; }
    for (const r of t.body) {
      for (const c of r.slice(1)) { // the first column is the row label
        s.cells++;
        const text = c.content.trim();
        const codes = codesOf(c);
        s.slot.cell += codes.length;
        if (!text) { s.cellEmpty++; continue; }
        if (codes.length) s.cellCodeSpan++;
        if (codes.some((x) => /(^|[{,]\s*)note=/.test(x))) { s.cellNoteSpan++; s.rewrite.noteSpan++; }
        if (MARK_LEAD.test(text)) { s.cellMark++; continue; }
        const plain = text.replace(/`[^`]*`/g, '').trim();
        if (plain && isValuePill(plain)) {
          s.cellPlainNumber++;
          if (COMMA_NUMBER.test(plain)) { s.commaNumbers++; s.rewrite.number++; }
          if (DOT_GROUPED.test(plain)) s.dotGrouped++;
        } else if (plain) {
          s.cellNonNumeric++;
          if (chart === 'heatmap') s.rewrite.strictCell++;
        }
      }
    }
    if (shapeOf(chart) === 'series' || chart === 'bar' || chart === 'line') s.rewrite.tableCells += t.body.reduce((n, r) => n + r.length - 1, 0);
  }
  s.refs.push({ ...row, list: hasList, table: hasTable });
}

function census(only) {
  const files = corpus().filter((f) => !only || f.kind === only);
  const by = Object.fromEntries(CHARTS.map((c) => [c, blank()]));
  const totals = { files: files.length, decks: files.filter((f) => f.kind === 'deck').length, docBlocks: files.filter((f) => f.kind === 'docs').length, manifestSnippets: files.filter((f) => f.kind === 'manifest').length, slides: 0, chartSlides: 0 };
  for (const f of files) {
    let sections;
    try { sections = splitSourceToSections(f.source); } catch { continue; }
    const fallback = deckClass(f.source);
    sections.forEach((src, i) => {
      totals.slides++;
      const tokens = slideClass(src, fallback);
      const chart = tokens[0];
      if (!CHARTS.includes(chart)) return;
      totals.chartSlides++;
      const s = by[chart];
      s.slides++;
      s[{ deck: 'decks', docs: 'docs', manifest: 'manifests' }[f.kind]]++;
      countSlide(chart, tokens, src, s, `${f.file}:${i + 1}`);
    });
  }
  return { totals, by };
}

// ── Output ───────────────────────────────────────────────────────────────────────────────────
function table(header, rows) {
  return [`| ${header.join(' | ')} |`, `|${header.map((_, i) => (i ? '--:' : '---')).join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

function report({ totals, by }) {
  const out = [];
  out.push(`Corpus: ${totals.decks} decks, ${totals.docBlocks} fenced \`markdown\` blocks from .docs.md and ${totals.manifestSnippets} manifest snippets (${totals.files} sources), ${totals.slides} slides, ${totals.chartSlides} on the 24 charts.\n`);
  const order = CHARTS.filter((c) => by[c].slides);
  out.push('**Slides and containers**\n');
  out.push(table(['chart', 'shape', 'slides', 'decks', 'docs', 'manifests', 'list', 'table', 'rows', 'depth 2', 'depth 3', 'depth 4+'],
    order.map((c) => { const s = by[c]; return [c, shapeOf(c), s.slides, s.decks, s.docs, s.manifests, s.lists, s.tables, s.rows, s.nested[2], s.nested[3], s.nested['4+']]; })));
  out.push('\n**What a top-level row carries** (inline-code spans on the row\'s own line)\n');
  out.push(table(['chart', 'no span', 'one value', 'one record', 'one text', 'one other', 'two or more', 'nested data', 'nested group', 'nested other', 'series slides', '`>` under item', 'column-0 `>`'],
    order.map((c) => { const s = by[c]; return [c, s.lead.none, s.lead.value, s.lead.record, s.lead.text, s.lead.other, s.lead.multi, s.nestedData, s.nestedGroups, s.nestedDetail, s.seriesSlides, s.quoteDescriptions, s.column0Quotes]; })));
  out.push('\n"nested other" is a nested row with no value and no data below it: mark detail on the in-scope charts, the chart\'s own structure (tasks, cards, connections) on the `outside` ones.');
  const withTables = order.filter((c) => by[c].tables);
  out.push('\n**Table cells** (body cells after the label column)\n');
  out.push(table(['chart', 'tables', 'header cells', 'body cells', 'plain number', 'with a span', 'state mark', 'not a number', 'empty', '`note=` span'],
    withTables.map((c) => { const s = by[c]; return [c, s.tables, s.headerCells, s.cells, s.cellPlainNumber, s.cellCodeSpan, s.cellMark, s.cellNonNumeric, s.cellEmpty, s.cellNoteSpan]; })));
  out.push('\n**Spans by slot** (only the row and cell slots are a codemod\'s to touch)\n');
  out.push(table(['chart', 'heading', 'above: `[…]` axes', 'above: other (kicker)', 'below data', 'row lead', 'nested lead', 'blockquote', 'header cell', 'body cell'],
    order.map((c) => { const s = by[c].slot; return [c, s.heading, s.aboveBracket, s.aboveOther, s.below, s.rowLead, s.nestedLead, s.quote, s.header, s.cell]; })));
  out.push('\n**Rewrites under §2** (charts the model covers; `outside` charts adopt only the number and description rules)\n');
  out.push(table(['chart', 'wrap in `{…}`', 'of which text', 'merge spans into one record', 'named row → parameter', 'detail → `>`', 'detail → `{> …}` cell', 'list → table (slides)', 'group-row span with no cell', 'no GFM table (slides)', 'series points to cells', 'comma number', 'dot-grouped number', 'heatmap `note=`', 'strict cell refused'],
    order.map((c) => { const s = by[c]; const r = s.rewrite; return [c, r.wrap, r.wrapText, r.merge, r.namedToParam, r.detailToQuote, r.detailToCell, r.listToTable, r.groupSpan, s.groupedSeriesSlides, s.seriesPoints, r.number, s.dotGrouped, r.noteSpan, r.strictCell]; })));
  const sum = (k) => order.filter((c) => shapeOf(c) !== 'outside').reduce((n, c) => n + by[c].rewrite[k], 0);
  out.push(`\nIn-scope totals: ${sum('wrap')} wraps (${sum('wrapText')} of them text), ${sum('merge')} merges, ${sum('namedToParam')} named rows to parameters, ${sum('detailToQuote')} detail bullets to \`>\`, ${sum('detailToCell')} to \`{> …}\` cells, ${sum('listToTable')} list-to-table slides, ${sum('groupSpan')} group-row spans with no cell, ${sum('number')} comma numbers, ${sum('noteSpan')} \`note=\` spans, ${sum('strictCell')} heatmap cells a strict reader refuses.`);
  out.push('\n**Rows with two or more spans, by kind** (what a merge folds into one record)\n');
  out.push(table(['chart', 'spans', 'rows'], order.flatMap((c) => Object.entries(by[c].secondSpan).sort((a, b) => b[1] - a[1]).map(([k, n]) => [c, `\`${k}\``, n]))));
  if (by.bullet.slides) {
    out.push('\n**Bullet\'s nested rows by name** (§7 evidence: what a record would have to name)\n');
    out.push(table(['name', 'rows'], Object.entries(by.bullet.named).sort((a, b) => b[1] - a[1])));
  }
  return out.join('\n');
}

function main(args) {
  const oi = args.indexOf('--only');
  const result = census(oi >= 0 ? args[oi + 1] : null);
  const ji = args.indexOf('--json');
  if (ji >= 0) writeFileSync(args[ji + 1], `${JSON.stringify(result, null, 1)}\n`);
  const ci = args.indexOf('--chart');
  if (ci >= 0) {
    for (const r of result.by[args[ci + 1]]?.refs ?? []) console.log(`${r.ref}\trows=${r.rows}\tlist=${r.list}\ttable=${r.table}\tseries=${r.series}`);
  } else if (ji < 0) {
    console.log(report(result));
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));

export { blank, blocks, census, corpus, countSlide, spanKind };
