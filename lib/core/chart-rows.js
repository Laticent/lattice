/**
 * lib/core/chart-rows.js — THE chart row reader: what one row of a chart's data holds, from the
 * chart's own manifest schema.
 *
 * Phase 2 of the chart authoring model (engineering/decisions/2026-10-14-chart-authoring-uniform-model.md
 * §2, §9, §10). Each chart in the model declares its row in its manifest's `segno` block: a `row`
 * slot (a `cell` slot on the two grid charts) whose `positional` and `params` are the row's fields,
 * written as one `{…}` record, plus a `rows` block saying the shape (`fields`, `series`, `grid`),
 * whether a `>` under a list row is that row's description (`quotes`), which list depths draw no mark, and how the chart reads
 * the row today (`legacy`). tools/build-stage-catalog.js compiles every slot into
 * lib/core/segno-slots.generated.js, so a schema Segno refuses fails the build.
 *
 * Read from here:
 *   - which charts read a row's `>` description and value-less nested bullets as detail
 *     (`DETAIL_CHARTS`, the schemas' `rows.quotes`), for the linter (lib/authoring/lint-core.js)
 *     and the narrator (lib/core/chart-narration.js). Compose (docs/src/lib/compose/deck-doc.ts)
 *     reads the same flag from the generated catalog, because its dev shim takes only a file that
 *     requires nothing; a test there pins its list to this one. The transforms do not read it yet:
 *     each detail chart calls the shared kernel (lib/components/chart/_chart-family/mark-detail.js)
 *     itself, and test/unit/core/chart-rows.test.js pins the two to agree;
 *   - which rows draw no mark, so a `>` under them describes nothing (`marklessDepths`);
 *   - what a `{…}` record on a row binds to (`readRecord`), and the spans the chart reads today for
 *     the same row (`legacySpans`), which is the old-form branch phase 4 deletes;
 *   - a slide's rows and their `>` descriptions, read from the Markdown source with markdown-it's
 *     list rules (`readChartRows`), for the readers that have no markdown-it (the narrator).
 *
 * Pure and fs-free: lint-core and the narration bundle run in the browser.
 */

const CATALOG = require('./segno-slots.generated.js');
const { componentSlot } = require('./segno-slots.js');
const { isValueSlot } = require('./chart-values.js');

/** The slot that holds a chart's row schema: `row` on a list chart, `cell` on a grid chart. */
function rowSlotName(cls) {
  const slots = cls ? CATALOG[cls] : null;
  if (!slots) return null;
  for (const name of ['row', 'cell']) if (slots[name]?.rows) return name;
  return null;
}

/** A chart's row schema, `{ slot, spec, rows }`, or null when the chart is outside the model. */
function rowSchema(cls) {
  const slot = rowSlotName(cls);
  return slot ? { slot, spec: CATALOG[cls][slot], rows: CATALOG[cls][slot].rows } : null;
}

/** Every chart that declares a row schema, sorted. */
const ROW_CHARTS = Object.freeze(Object.keys(CATALOG).filter((c) => rowSlotName(c)).sort());

/** The charts whose rows carry detail through mark-detail.js: a `>` under a row is its description. */
const DETAIL_CHARTS = Object.freeze(ROW_CHARTS.filter((c) => rowSchema(c).rows.quotes === true));

/**
 * Charts that read an indented `>` through their own grammar (lib/core/flowchart-grammar.js).
 * Outside the model's row schema by choice (model note §2): they still read a row's `>`.
 */
const QUOTE_CHARTS = Object.freeze(['flowchart', 'state-chart']);

/**
 * The list depths (1 = top level) whose rows draw no mark, for a slide carrying `classTokens`:
 * the schema's `markless.default`, or the list a modifier on the slide names (radar's `quadrant`
 * nests its series one level under a group, and neither draws a mark).
 * @param {string} cls
 * @param {string[]} [classTokens]
 * @returns {Set<number>}
 */
function marklessDepths(cls, classTokens = []) {
  const spec = rowSchema(cls)?.rows.markless;
  if (!spec) return new Set();
  const hit = classTokens.find((t) => t !== 'default' && Array.isArray(spec[t]));
  return new Set(hit ? spec[hit] : spec.default);
}

/** Is this span text a `{…}` record (not an escaped or tagged one)? */
const isRecordText = (text) => /^\{[\s\S]*\}$/.test(String(text).trim());

/**
 * Read one span as the chart's row record: `{4.2M, target=5.0M}` on a bullet row. Returns Segno's
 * result (`{ ok, value, diagnostics }`), or null when the chart has no row schema or the span is
 * not a record.
 */
function readRecord(cls, text) {
  const s = rowSchema(cls);
  if (!s || !isRecordText(text)) return null;
  const slot = componentSlot(cls, s.slot);
  return slot ? slot.read(String(text).trim()) : null;
}

/**
 * The spans the chart reads TODAY for the row a record describes, in the order its transform reads
 * them: `{4.2M, target=5.0M}` on bullet is `4.2M` `5.0M`. Each field keeps the author's spelling
 * (Segno gives a value's source range), so a number reads exactly as typed. Null when the chart's
 * old form is already a record, when a field set has no old form (bullet's `band=` and `floor=`
 * were named nested rows), or when the record does not read.
 *
 * The old-form branch: phase 4 of the model note deletes it with the codemod.
 */
function legacySpans(cls, text) {
  const s = rowSchema(cls);
  if (!s || !Array.isArray(s.rows.legacy)) return null;
  const read = readRecord(cls, text);
  if (!read?.ok) return null;
  const order = s.rows.legacy;
  const fields = Object.keys(read.value);
  if (fields.some((f) => !order.includes(f))) return null;
  const items = recordItems(String(text).trim());
  const spelled = {};
  // Positional items bind in schema order; named ones by their name.
  let pos = 0;
  const positional = (s.spec.positional || []).map((p) => p.name);
  for (const item of items) {
    const eq = /^([a-z][a-z0-9-]*)\s*=\s*([\s\S]*)$/.exec(item);
    if (eq) { spelled[eq[1]] = eq[2].trim(); continue; }
    // A bare word a param takes by its vocabulary (waterfall's `total`): bound by value, not place.
    const byValue = fields.find((f) => !positional.includes(f) && read.value[f] === item);
    if (byValue) { spelled[byValue] = item; continue; }
    if (pos < positional.length) spelled[positional[pos++]] = item;
  }
  const out = [];
  for (const f of order) {
    if (!(f in read.value)) break;
    if (spelled[f] === undefined) return null;
    const quoted = /^"([\s\S]*)"$/.exec(spelled[f]);
    const span = quoted ? quoted[1].replace(/\\(["\\])/g, '$1') : spelled[f];
    // A backtick cannot sit in a single-backtick span, so such a field has no one-span form.
    if (span.includes('`') || !span.trim()) return null;
    out.push(span);
  }
  // A field set with a gap (`target` but no `value`) has no old form: the old reader is positional.
  return out.length === fields.length ? out : null;
}

/** A record's top-level items, split on the commas outside quotes and brackets. */
function recordItems(text) {
  const inner = text.slice(1, -1);
  const out = [];
  let depth = 0;
  let quoted = false;
  let cur = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '\\' && quoted) { cur += ch + (inner[i + 1] ?? ''); i++; continue; }
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '[' || ch === '{')) depth++;
    else if (!quoted && (ch === ']' || ch === '}')) depth--;
    if (ch === ',' && !quoted && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// ── Ownership: which span is a row's data record ───────────────────────────────────────────────

/**
 * Every chart layout, in the order the chart family's dispatcher tries them
 * (lib/plugins/chart-family/shared/chart-registry.generated.js `LAYOUTS`). The dispatcher draws the
 * FIRST of these a slide's class names, so a slide carrying two (`quadrant radar`, `journey heatmap`)
 * is drawn by one of them, and the record rules must pick the same one. A literal list, because the
 * registry requires every chart kernel and this file runs in the browser bundles; a test pins the two.
 */
const CHART_LAYOUT_ORDER = Object.freeze(['bar', 'bullet', 'ep-curve', 'flowchart', 'funnel', 'gantt', 'histogram',
  'hub-spoke', 'journey', 'heatmap', 'kanban', 'line', 'map', 'matrix-grid', 'piechart', 'progress', 'radar', 'quadrant',
  'risk-matrix', 'roadmap', 'scatter', 'slope', 'stacked-bar', 'state-chart', 'timeline-list', 'tower', 'waterfall',
  'word-cloud']);

/** The chart that DRAWS a slide with these class tokens, when it declares a row schema; else null. */
function recordChart(classTokens) {
  const tokens = classTokens || [];
  const layout = CHART_LAYOUT_ORDER.find((l) => tokens.includes(l));
  return layout && ROW_CHARTS.includes(layout) ? layout : null;
}

/** Does this span make its row hold a value of its own: a number, or the chart's `{…}` record? */
function holdsValue(chart, text) {
  return text != null && (isValueSlot(text) || readRecord(chart, text)?.ok === true);
}

/** Does any of these code spans (a row's lead) make the row hold a value of its own: a number, or the chart's record? */
function holdsValueIn(chart, spans) {
  return (spans || []).some((t) => holdsValue(chart, t));
}

/**
 * Is a row DETAIL, so a `{…}` on it stays a pill? Each chart's schema says what its kernel does with a row
 * nested under another (`rows.nested`, manifest.schema.json): a series POINT unless the parent holds a value of
 * its own (a bar category, a line series; under a valued row a nested pill is a pill, as on main), or DETAIL
 * below the first data depth whatever the parent holds (pie, funnel, map, waterfall, word-cloud, progress,
 * bullet, radar). `ancestors[i]` is the list of code spans in the lead of the open ancestor row at depth
 * i + 1 (all of them, not the last: `- Q2 `16` `{risk}`` holds a value), outermost first. A markless ancestor
 * (a radar series, a quadrant group) holds nothing and is not a data depth: its children are the data. Not
 * decided here: stacked-bar's authored total over its segments puts a plain value under a valued row; it
 * reads from the old spans until phase 4 (lint `chart-row-record-unread` says so), because a delta note in the
 * same place is a pill on main.
 */
function isDetailRow(chart, classTokens, ancestors) {
  const rule = rowSchema(chart)?.rows.nested || 'point-unless-valued';
  const markless = marklessDepths(chart, classTokens);
  const depth = (ancestors || []).length + 1;
  if (rule === 'detail') {
    let first = 1;
    while (markless.has(first)) first++;
    return depth > first;
  }
  return (ancestors || []).some((spans, i) => !markless.has(i + 1) && holdsValueIn(chart, spans));
}

/**
 * Is this span the row's DATA RECORD: the span the chart reads as the row's value, so the slide-wide
 * pill pass must leave it alone, and the bridge rewrites it? THE ONE DECISION every path asks (the
 * engine's `inlinePills`, the runtime's `isOwnedRecordElement`, Compose's `ownsRecord`, lint's
 * `recordPlace`, and both bridges below), each measuring `place` its own way. Model note §9: narrower
 * than a slot's `sits: "list-rows"`, which would own every span on the row and stop a pill in a label
 * or in a `>` description rendering.
 *
 * A span is the record when ALL of these hold:
 *   - the slide's class names a chart with a row schema (the chart that draws it, `recordChart`), and
 *     the span reads as that chart's `{…}` record;
 *   - it is the LAST thing in its row's LEAD (the item's first paragraph, or a whole table cell), where
 *     the old form puts a value too. The old spans also draw a value from a later paragraph, or from the line after a
 *     heading item; the record is read only from the first line, so there it stays a pill (`lead: false`) and lint says so;
 *   - it is the row's ONLY value: no other code span in the lead holds one (`leadSpans`, every code span
 *     of the lead, `at` is this one's index), so `- North `40` up `{+3%}`` is a value and a pill, and
 *     `- Q2 `16` `{risk}`` is a value and a label;
 *   - no other code span sits right before it (`1` `{2}` is the old form's first value, then a pill);
 *   - it is outside any `>` quote (a description), which keeps the pill pass it has today;
 *   - it is in the slide's FIRST list or table, the only ones a chart kernel reads (`firstList: false` declines);
 *   - its row draws a mark (not a radar series or a quadrant group) and is DATA, not detail by its chart's
 *     `rows.nested` rule (`isDetailRow`), so a delta pill in a detail bullet stays a pill;
 *   - its place matches the chart's shape: a table cell on a grid chart, a list row on every other.
 *
 * @param {string[]} classTokens  the slide's class tokens
 * @param {string} text           the span's text
 * @param {{cell?: boolean, depth?: number, lastInRow: boolean, afterCode?: boolean, quoted?: boolean,
 *          firstList?: boolean, lead?: boolean, leadSpans?: string[], at?: number,
 *          ancestors?: Array<string[]|null>}} place
 */
function ownsRecordSpan(classTokens, text, place) {
  const chart = recordChart(classTokens);
  if (!chart || !place.lastInRow || place.afterCode || place.quoted || place.firstList === false || place.lead === false) return false;
  const grid = rowSchema(chart).slot === 'cell';
  if (Boolean(place.cell) !== grid) return false;
  // A cell record the bridge cannot spell as the old cell text (`{value=3}`) is no claim: it stays what it was.
  if (grid) return readRecord(chart, text)?.ok === true && gridCellText(chart, text) != null;
  if (!grid) {
    if (marklessDepths(chart, classTokens).has(place.depth) || isDetailRow(chart, classTokens, place.ancestors)) return false;
    const spans = place.leadSpans || [];
    if (spans.some((t, i) => i !== place.at && holdsValue(chart, t))) return false; // the row already has its value
  }
  return readRecord(chart, text)?.ok === true;
}

// Past this many characters a raw block is counted by plain tag names, not scanned tag by tag (see `rawBlockCounts`).
const RAW_SCAN_LIMIT = 8000;
/** A slide's total budget of characters for tag-by-tag scanning of its raw blocks. */
const RAW_SCAN_BUDGET = 32000;

/**
 * The top-level lists and the tables a raw HTML block opens. A chart reads the slide's FIRST list or table, and
 * the HTML bridge counts every list and table tag it finds, so the pill pass and lint count a raw block too: a
 * `<ul>` before the chart's list makes that list the second one on every path.
 * Bounded: one raw block is scanned tag by tag up to `RAW_SCAN_LIMIT` characters, and `budget` (`{left}`, one per slide)
 * bounds the sum over a slide's blocks, so many large hostile blocks cannot add up; past either bound the block is
 * counted by plain tag names, a linear read.
 * @param {string} html
 * @param {{left: number}} [budget]
 * @returns {{lists: number, tables: number}}
 */
function rawBlockCounts(html, budget) {
  let lists = 0;
  let depth = 0;
  let tables = 0;
  const src = String(html);
  // A raw block this large is not an author's list or table, and scanning it tag by tag is not linear on hostile input:
  // past the bound, count the plain tag names (a cheap, linear read that cannot be fooled into looping).
  if (src.length > RAW_SCAN_LIMIT || (budget && src.length > budget.left)) {
    const open = (src.match(/<(?:ul|ol)\b/gi) || []).length;
    return { lists: open > 0 ? 1 : 0, tables: (src.match(/<table\b/gi) || []).length };
  }
  if (budget) budget.left -= src.length;
  // Real tags only: a `<ul>` in a comment or in a quoted attribute value is text.
  ANY_TAG.lastIndex = 0;
  for (let m = ANY_TAG.exec(src); m; m = ANY_TAG.exec(src)) {
    if (m[0] === '<!--') {
      const close = src.indexOf('-->', m.index + 4);
      if (close < 0) break;
      ANY_TAG.lastIndex = close + 3;
      continue;
    }
    const name = m[2].toLowerCase();
    if (name === 'table' && !m[1]) tables++;
    else if (name === 'ul' || name === 'ol') {
      if (m[1]) depth = Math.max(0, depth - 1);
      else { if (depth === 0) lists++; depth++; }
    }
  }
  return { lists, tables };
}

const NAMED_ENTITIES = { quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
const unescapeHtml = (s) => s
  .replace(/&#x([0-9a-f]+);/gi, (_m, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d+);/g, (_m, d) => String.fromCodePoint(Number(d)))
  .replace(/&(quot|apos|lt|gt|nbsp);/g, (_m, n) => NAMED_ENTITIES[n])
  .replace(/&amp;/g, '&');
const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Any tag, or the start of a comment (skipped by index: its text is not markup). Quoted attribute values may hold a
// `<` or a `>` (the browser serializes `title="a <pre> b"` as is). One tag body is bounded to 4000 pieces, so a SINGLE
// attempt cannot run away; a hostile input with thousands of unclosed `<` still costs up to that bound per `<`, which is
// why `rawBlockCounts` (run on every raw block of a chart slide, in lint too) bounds its input and this does not claim more.
const ANY_TAG = /<!--|<(\/?)([a-z][a-z0-9-]*)\b(?:[^>"']|"[^"]*"|'[^']*'){0,4000}>/gi;

/**
 * A grid chart's old spelling of a cell record: heatmap's `{4.2}` is the number `4.2`, and
 * matrix-grid's `{done}` is the marker its shortcut table names (`[x]`). Null when the chart has no
 * plain spelling for what the record holds.
 */
function gridCellText(chart, text) {
  const read = readRecord(chart, text);
  if (!read?.ok) return null;
  if (chart === 'matrix-grid') {
    const shortcuts = CATALOG[chart].cell.shortcuts || {};
    return Object.keys(shortcuts).find((k) => shortcuts[k] === `{${read.value.state}}`) || null;
  }
  const first = recordItems(text.trim())[0];
  return first == null || /^[a-z][a-z0-9-]*\s*=/.test(first) ? null : first.replace(/^"([\s\S]*)"$/, '$1');
}

/**
 * The attribute a code span carries from the moment a pass CLAIMS it as a chart row's record: the markdown-it pill
 * pass on the engine path, the DOM mirror (`isOwnedRecordElement`) in the browser. The pass decides from its own
 * surface (tokens, or the DOM), once; the bridge below only follows the stamp, so a claimed span is always rewritten
 * (or shown as it was) and can never be left as raw braces by a second, different decision.
 */
const RECORD_ATTR = 'data-lat-record';
const STAMPED = `<code ${RECORD_ATTR}="">`;
const STAMPED_CELL = new RegExp(`(<td\\b[^>]*>)(\\s*)<code ${RECORD_ATTR}="">(\\{[^<]*\\})</code>((?:\\s|&nbsp;|&#160;|&#xa0;)*)(</td>)`, 'gi');
const STAMPED_ROW = new RegExp(`<code ${RECORD_ATTR}="">([^<]*)</code>`, 'g');

/**
 * The HTML bridge: a record the pill pass (or the DOM mirror) CLAIMED, and stamped, is rewritten to the spans the
 * chart's transform reads (`legacySpans`), so every transform draws it through the code it already has. The chart
 * family calls this once before dispatch (lib/plugins/chart-family/chart-family.dispatch.js), on the engine's HTML
 * and on the runtime's DOM alike. It decides nothing about ownership: a stamped span with no old form (a field the
 * chart has no span for) is shown as it was, minus the stamp, and lint `chart-row-record-unread` says so. Phase 4
 * deletes it with the old spellings.
 * @param {string} html  a section's inner HTML
 * @param {string[]} classTokens
 */
function bridgeRecordsHtml(html, classTokens) {
  if (!html.includes(STAMPED)) return html; // nothing claimed: no scan at all
  const chart = recordChart(classTokens);
  const schema = chart ? rowSchema(chart) : null;
  let out = html;
  if (schema?.slot === 'cell') {
    out = out.replace(STAMPED_CELL, (all, open, lead, code, trail, close) => {
      const text = gridCellText(chart, unescapeHtml(code));
      return text == null ? all : `${open}${lead}${escapeHtml(text)}${trail}${close}`;
    });
  } else if (schema && Array.isArray(schema.rows.legacy)) {
    out = out.replace(STAMPED_ROW, (all, raw) => {
      const spans = legacySpans(chart, unescapeHtml(raw));
      return spans ? spans.map((x) => `<code>${escapeHtml(x)}</code>`).join(' ') : all;
    });
  }
  return out.split(STAMPED).join('<code>');
}

const BACKTICK_TAIL = /(?<!`)`([^`\n]+)`(?:\s|&nbsp;|&#160;|&#xa0;)*$/i;
// A table cell holding nothing but a backticked record, with or without the outer pipes.
const RECORD_CELL = /(^|\|)(\s*)`(\{[^`|]*\})`(\s*)(?=\||$)/g;

/**
 * The source bridge: the same rewrite as `bridgeRecordsHtml`, on one slide's Markdown, for the
 * readers that have no markdown-it (the narrators). It rewrites inside a line and never adds or
 * removes one, because the narrator finds a row's description by line count.
 * @param {string} markdown      one slide's source
 * @param {string[]} classTokens
 */
function bridgeRecordsSource(markdown, classTokens) {
  const out = bridgeLines(markdown, classTokens);
  // A source with no record to rewrite comes back untouched, so a deck that writes none narrates as it always did.
  if (out === String(markdown).replace(/\r$/gm, '')) return markdown;
  // A CRLF slide stays CRLF: the narrators read it as they read the old spans (a CRLF slide narrates nothing either way).
  return markdown.includes('\r\n') ? out.replace(/\n/g, '\r\n') : out;
}

function bridgeLines(markdown, classTokens) {
  const chart = recordChart(classTokens);
  if (!chart || !markdown.includes('`{')) return markdown;
  const schema = rowSchema(chart);
  const lines = markdown.split('\n').map((l) => l.replace(/\r$/, ''));
  if (schema.slot === 'cell') {
    // Only the slide's first table is the chart's: a run of pipe lines ends at the first line without one.
    let table = 0;
    let inRun = false;
    return lines.map((line) => {
      const pipe = line.includes('|') && !ITEM.test(line.trim()) && !/^\s*>/.test(line);
      if (pipe && !inRun) table++;
      inRun = pipe;
      if (!pipe || table !== 1) return line;
      return line.replace(RECORD_CELL, (all, bar, a, rec, b) => {
        const text = gridCellText(chart, rec);
        return text == null ? all : `${bar}${a}${text}${b}`;
      });
    }).join('\n');
  }
  if (!Array.isArray(schema.rows.legacy)) return markdown;
  const open = []; // the open list items, outermost first: { content, spans, closed }
  let inFence = false;
  let lists = 0;
  let inList = false;
  let listKind = '';
  const rawBudget = { left: RAW_SCAN_BUDGET };
  let lastBlank = true;
  // A line that starts a block of its own interrupts a paragraph (and, at the margin, ends the list).
  const BLOCK_START = /^\s*(?:>|```|~~~|#{1,6}\s|<!--|(?:[-*_]\s*){3,}$|=+\s*$|<\/?(?:div|p|table|ul|ol|pre|blockquote|details|section|hr|h[1-6])\b|\|)/;
  // A paragraph ends at its line when the next one is blank, a list marker, a block start, or absent: that line's
  // last span is a row's record, as it is for the engine's inline token (a lazy continuation included).
  const endsPara = (i) => { const n = lines[i + 1]; return n === undefined || !n.trim() || ITEM.test(n.trim()) || BLOCK_START.test(n); };
  const spansOf = (line) => [...line.matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)].map((m) => m[1]);
  lines.forEach((line, i) => {
    const { col, rest } = expandLead(line);
    if (FENCE.test(rest)) { inFence = !inFence; return; }
    if (inFence) return;
    if (!rest) { lastBlank = true; return; }
    const blankBefore = lastBlank;
    lastBlank = false;
    // A raw `<ul>`/`<ol>` ahead of the chart's list, a block at the margin or inline in a paragraph, makes the chart's the second.
    // (inline code spans are text, not tags: `Use `<ul>` for lists` is no list)
    if (!open.length && line.includes('<')) {
      const bare = line.replace(/`[^`]*`/g, '');
      if (/<(?:ul|ol)\b/i.test(bare)) { lists += rawBlockCounts(bare, rawBudget).lists; inList = false; }
    }
    const item = ITEM.exec(rest);
    let row;
    let ancestors;
    if (item && col < (open.length ? open[open.length - 1].content + 4 : 4)) {
      while (open.length && open[open.length - 1].content > col) open.pop();
      // A different bullet character or ordered delimiter starts a new list (CommonMark), as the engine counts it.
      const kind = /^\d/.test(item[1]) ? `o${item[1].trim().slice(-1)}` : item[1].trim();
      if (!open.length && (!inList || kind !== listKind)) { lists++; inList = true; listKind = kind; }
      const gap = item[2] === '\t' ? 4 - ((col + item[1].length) % 4) : item[2].length;
      row = { content: col + item[1].length + (gap > 4 || !item[3] ? 1 : gap), spans: [], closed: false };
      ancestors = open.map((r) => r.spans);
      open.push(row);
    } else {
      const here = open[open.length - 1];
      // A block start at the margin, or any margin line after a blank, ends the list; a plain margin line without a blank is lazy.
      if (!here || (col < here.content && (blankBefore || BLOCK_START.test(line))) || rest[0] === '>') {
        if (col === 0 && (blankBefore || BLOCK_START.test(line))) { inList = false; open.length = 0; }
        return;
      }
      if (BLOCK_START.test(line)) return; // an indented block start (a rule, a table) is not the row's text
      row = here;
      ancestors = open.slice(0, -1).map((r) => r.spans);
    }
    const lead = !row.closed;
    const content = item ? line.slice(line.indexOf(rest) + item[1].length) : line;
    if (lead) row.spans.push(...spansOf(content));
    // An ATX heading is one line: whatever follows it in the item is a second block, not the heading's lead.
    const heading = Boolean(item) && /^\s*#{1,6}(?:\s|$)/.test(content);
    if (!heading && !endsPara(i)) return;
    row.closed = true; // the paragraph ends here: the next one is not the lead
    const m = BACKTICK_TAIL.exec(line);
    if (!m) return;
    const own = ownsRecordSpan(classTokens, m[1], {
      depth: open.length, lastInRow: true, afterCode: line.slice(0, m.index).trimEnd().endsWith('`'),
      firstList: lists === 1, lead, leadSpans: lead ? row.spans : [], at: lead ? row.spans.length - 1 : 0, ancestors,
    });
    const spans = own ? legacySpans(chart, m[1]) : null;
    if (spans) lines[i] = line.slice(0, m.index) + spans.map((x) => `\`${x}\``).join(' ') + m[0].slice(m[0].lastIndexOf('`') + 1).replace(/^\s+$/, '');
  });
  return lines.join('\n');
}

// ── A slide's rows and descriptions, from the Markdown source ──────────────────────────────────

/** A line's leading whitespace as columns, with a tab advancing to the next four-column stop. */
function expandLead(line) {
  let col = 0;
  let i = 0;
  for (; i < line.length; i++) {
    if (line[i] === ' ') col++;
    else if (line[i] === '\t') col += 4 - (col % 4);
    else break;
  }
  return { col, rest: line.slice(i) };
}

const ITEM = /^([-*+]|\d{1,9}[.)])( +|\t|$)(.*)$/;
const FENCE = /^(```|~~~)/;
// A line that starts a block of its own, so it cannot continue a quote's paragraph lazily.
const BLOCK_START = /^(?:[-*+]\s|\d{1,9}[.)]\s|#{1,6}\s|>|```|~~~|(?:[-*_]\s*){3,}$)/;

/**
 * A slide's list rows and each row's `>` description, read from Markdown source.
 *
 * The engine reads the rendered HTML (`takeRowDescription` in mark-detail.js); a reader with no
 * markdown-it (the narration bundle) reads the source, so this follows markdown-it's rules for
 * which quote belongs to which row, and the two must agree
 * (test/unit/authoring/chart-list-quote-split.test.js pins them):
 *   - a quote belongs to the deepest open row whose CONTENT column it reaches. `1. A` puts its
 *     content at column 3, so a two-space `>` under it is not its description: it ends the list,
 *     as it does in the engine (and `chart-list-split-quote` warns);
 *   - a tab advances to the next four-column stop;
 *   - a line with no `>` continues the quote's paragraph (CommonMark's lazy continuation);
 *   - blank lines between the row and its quote belong to the quote (Compose writes one).
 *
 * Returns the slide WITHOUT its descriptions (`markdown`, so a row reader never sees a quote as a
 * row or as trailing prose), its rows (`line` indexes that markdown), and the descriptions, each
 * with the row it describes (`anchor`), the line it sat before (`at`), whether that row draws no
 * mark (`markless`: the engine drops it, so a reader must too) and its blocks: one `para` per
 * paragraph and one `item` per list item inside it.
 *
 * @param {string} markdown      one slide's source
 * @param {string} [cls]         the chart's class, for its markless rows
 * @param {string[]} [classTokens] the slide's class tokens (modifiers), for the same
 * @returns {{ markdown: string, rows: Array<{line:number, depth:number, content:number}>,
 *            descriptions: Array<{anchor:number, at:number, depth:number, markless:boolean,
 *            blocks: Array<{kind:'para'|'item', text:string}>}> }}
 */
function readChartRows(markdown, cls, classTokens = []) {
  const lines = String(markdown).split('\n');
  const markless = marklessDepths(cls, classTokens);
  const out = [];
  const rows = [];
  const descriptions = [];
  const items = []; // open rows: { content, depth, line }
  let inFence = false;
  let afterBlank = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const { col, rest } = expandLead(line);
    if (FENCE.test(rest)) inFence = !inFence;
    if (inFence || FENCE.test(rest)) { out.push(line); continue; }
    if (!rest) { out.push(line); afterBlank = true; continue; }
    const item = ITEM.exec(rest);
    if (item && col < (items.length ? items[items.length - 1].content + 4 : 4)) {
      while (items.length && items[items.length - 1].content > col) items.pop();
      const gap = item[2] === '\t' ? 4 - ((col + item[1].length) % 4) : item[2].length;
      const content = col + item[1].length + (gap > 4 || !item[3] ? 1 : gap);
      const row = { line: out.length, depth: items.length + 1, content };
      items.push(row);
      rows.push(row);
      out.push(line);
      afterBlank = false;
      continue;
    }
    if (rest[0] === '>') {
      let owner = null;
      for (let k = items.length - 1; k >= 0; k--) {
        if (items[k].content <= col) { owner = items[k]; break; }
      }
      if (!owner || col >= owner.content + 4) {
        // A margin quote (or code): not a description, and it ends a list it is not inside.
        if (!owner) items.length = 0;
        out.push(line);
        afterBlank = false;
        continue;
      }
      while (items.length && items[items.length - 1] !== owner) items.pop();
      const block = [];
      let j = i;
      let inPara = false;
      while (j < lines.length) {
        const next = expandLead(lines[j]);
        if (next.rest[0] === '>' && next.col >= owner.content && next.col < owner.content + 4) {
          const body = next.rest.slice(1).replace(/^ /, '');
          block.push(body);
          inPara = Boolean(body.trim()) && !ITEM.test(body.trim());
          j++;
          continue;
        }
        // Lazy continuation: a plain line carries on the quote's open paragraph.
        if (inPara && next.rest && !BLOCK_START.test(next.rest)) {
          block.push(next.rest);
          j++;
          continue;
        }
        break;
      }
      while (out.length > owner.line + 1 && out[out.length - 1].trim() === '') out.pop();
      i = j - 1;
      afterBlank = false;
      const blocks = [];
      let para = [];
      const flush = () => { if (para.length) blocks.push({ kind: 'para', text: para.join(' ').trim() }); para = []; };
      for (const b of block) {
        const li = ITEM.exec(b.trim());
        if (li) { flush(); blocks.push({ kind: 'item', text: li[3] }); }
        else if (!b.trim()) flush();
        else para.push(b.trim());
      }
      flush();
      descriptions.push({ anchor: owner.line, at: out.length, depth: owner.depth, content: owner.content, markless: markless.has(owner.depth), blocks });
      continue;
    }
    // Any other line: after a blank, a line left of every open row's content ends the list.
    if (afterBlank && items.length && col < items[0].content) items.length = 0;
    out.push(line);
    afterBlank = false;
  }
  return { markdown: out.join('\n'), rows, descriptions };
}

module.exports = {
  ROW_CHARTS, DETAIL_CHARTS, QUOTE_CHARTS,
  rowSchema, marklessDepths, readRecord, legacySpans, recordItems, readChartRows,
  CHART_LAYOUT_ORDER, recordChart, holdsValue, holdsValueIn, isDetailRow, ownsRecordSpan, rawBlockCounts, RAW_SCAN_BUDGET, RECORD_ATTR, gridCellText,
  bridgeRecordsHtml, bridgeRecordsSource,
};
