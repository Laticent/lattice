#!/usr/bin/env node
/**
 * segno-codemod — rewrite inline-code directives from their old spellings into Segno's notation.
 *
 *   `{BETA}:tag:c4`       →  `{BETA, tag, c4}`
 *   `~{12 14 17}:bar:lg`  →  `~{12 14 17, bar, lg}`
 *   `\{LIVE}:tag`         →  `\{LIVE, tag}`        (an escaped example stays escaped)
 *
 * Segno phase 2 is a clean break (engineering/decisions/2026-09-28-segno-unified-inline-notation.md,
 * decisions 9 and 21): this rewrites every shipped deck and doc, and the old parsers are deleted.
 * It recognizes the OLD spellings with the frozen kernels in tools/segno-legacy/ — never with
 * lib/, which no longer reads them — and rewrites a span only when the old kernel would have read
 * it as that directive (or as a broken attempt at one, so a doc that teaches an error keeps
 * teaching it, in the new spelling). Anything it cannot rewrite safely is REPORTED, not guessed.
 *
 * Grammars are switched on one at a time as each phase-2 slice moves its kernel (`--only`).
 *
 * Usage:
 *   node tools/segno-codemod.mjs                     rewrite the default corpus (all grammars)
 *   node tools/segno-codemod.mjs --only pill,spark   only these rewriters
 *   node tools/segno-codemod.mjs --check             exit 1 if anything would change (no writes)
 *   node tools/segno-codemod.mjs path/to/deck.md …   these files instead of the corpus
 *
 * The corpus is every tracked `*.md` except dated records (engineering/decisions/**, CHANGELOG.md,
 * changelog.d/**), which keep the spellings of their day. Inside a fenced block, only a
 * `markdown`/`md` fence (a deck example in a doc) is rewritten.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const legacyPills = require('./segno-legacy/inline-pills.js');
const newPills = require('../lib/core/inline-pills.js');
const newSparks = require('../lib/core/inline-sparks.js');
const legacyBrackets = require('./segno-legacy/bracket-list.js');
const { parseBracketList } = require('../lib/core/bracket-list.js');

/** A span's text split on top-level `:` after a `{…}` head: `{A}:b:c` → ['{A}', 'b', 'c']. */
function headAndMods(text, open) {
  if (!text.startsWith(open)) return null;
  const close = text.indexOf('}', open.length);
  if (close < 0) return null;
  const tail = text.slice(close + 1);
  if (tail && tail[0] !== ':') return null;
  return { body: text.slice(open.length, close), mods: tail ? tail.slice(1).split(':') : [] };
}

const PILL_WORD = new Set([...legacyPills.SHAPES, ...legacyPills.SIZES]);
const isPillWord = (m) => PILL_WORD.has(m) || /^c\d+$/.test(m);

/**
 * Old pill → new, or null. A pill the OLD kernel read (`parse` gave a label and `resolveMods`
 * accepted the words), or an attempt at one whose words are all pill words (`{X}:c9`, `{X}:tag:tag`).
 */
function rewritePill(text) {
  const parsed = legacyPills.parse(text);
  if (!parsed?.mods.length) return null; // `{LIVE}` is spelled the same in both
  if (!parsed.mods.every(isPillWord)) return null;
  const out = `{${partSpelling(parsed.value)}, ${parsed.mods.join(', ')}}`;
  // RE-READ: a pill the old kernel drew must draw the same pill now — label, shape, color and
  // size — and an attempt it refused (`{X}:c13`, kept to teach its error) must still be refused.
  const was = legacyPills.resolve(text);
  const now = newPills.resolve(out);
  const same = was
    ? now && now.value === was.value && now.shape === was.shape && (now.c ?? null) === (was.c ?? null) && (now.size ?? null) === (was.size ?? null)
    : !now;
  return same ? out : { unsafe: `no spelling of it reads back the same (${out})` };
}

const SPARK_WORDS = new Set([
  'line', 'area', 'bar', 'step', 'winloss', 'ring', 'bullet', 'sm', 'md', 'lg', 'end', 'minmax',
  'fill', 'zero', 'framed', 'bare', 'pigment', 'etching', 'tone', 'square', 'rounded',
]);
const isSparkWord = (m) => SPARK_WORDS.has(m) || /^c\d+$/.test(m);

/**
 * Old spark → new, or null. Any `~{DATA}:words` whose words are spark words (so a broken demo
 * like `~{3 5 4}:c13` keeps teaching its error). Data with a comma is left alone: in the new
 * notation a comma separates items, so `~{1,200}` would change meaning — it is reported instead.
 */
function rewriteSpark(text) {
  const hm = headAndMods(text, '~{');
  if (!hm?.mods.length) return null;
  if (!hm.mods.every((m) => m && isSparkWord(m))) return null;
  if (hm.body.includes(',')) return { unsafe: 'the data holds a comma, which the new notation reads as a separator' };
  const out = `~{${hm.body.trim()}, ${hm.mods.join(', ')}}`;
  // RE-READ: there is no frozen old spark kernel, so the bar is that the new reader still reads
  // the rewrite as a spark, or as a spark attempt it can name the fault in (a teaching example).
  return newSparks.resolve(out) || newSparks.diagnose(out) ? out : { unsafe: `the new reader does not read it as a spark (${out})` };
}

/** The chart components whose slides read a bracketed span (an axis, a key, a label set). */
const BRACKET_SLIDES = new Set(['gantt', 'matrix-grid', 'quadrant', 'scatter', 'heatmap', 'journey', 'roadmap', 'obligation-matrix', 'flowchart', 'radar', 'bullet', 'kanban', 'state-chart']);

/** A part as the notation reads it back exactly: bare when it can be, quoted when it must be. */
function partSpelling(p) {
  if (p && !/[,={}[\]"|]/.test(p) && !/^[~^\s]|\s$/.test(p)) return p;
  return `"${p.replace(/["\\]/g, '\\$&')}"`;
}

/**
 * Old bracketed list → new, or null. Only on a chart slide (`ctx.slideClass`), and only when the
 * old scanner read the span and the new reader reads it differently. The rewrite is re-read before
 * it is returned: it must give the old members exactly, or the span is reported, not guessed.
 */
function rewriteBracket(text, ctx) {
  if (!ctx || !BRACKET_SLIDES.has(ctx.slideClass) || !text.startsWith('[')) return null;
  const old = legacyBrackets.parseBracketList(text);
  if (!old) return null;
  if (JSON.stringify(parseBracketList(text)) === JSON.stringify(old)) return null;
  const out = `[${old.map((m) => (m.length === 0 ? '' : m.length === 1 ? partSpelling(m[0]) : `{${m.map(partSpelling).join(', ')}}`)).join(', ')}]`;
  if (JSON.stringify(parseBracketList(out)) !== JSON.stringify(old)) return { unsafe: `no spelling of it reads back the same (${out})` };
  return out;
}

const legacyValues = require('./segno-legacy/chart-values.js');
const { readPoint } = require('../lib/core/chart-point.js');

/** A coordinate as a record item: a number token with no separator in it, or null. */
const coordItem = (t) => (t && !/[,={}[\]"|]/.test(t) ? t.trim() : null);

/** `{x, y}` / `{x, y, size=s}` — re-read before it is trusted. */
function pointRecord(x, y, size) {
  const items = [x, y].map(coordItem);
  if (items.includes(null) || (size != null && coordItem(size) == null)) return null;
  const out = `{${items.join(', ')}${size != null ? `, size=${coordItem(size)}` : ''}}`;
  return readPoint(out) ? out : null;
}

/**
 * Quadrant: a coordinate pill `3, 70` (or `0.4, 0.55, 12`, the third a bubble's size) on a list
 * row of a quadrant slide → `{3, 70}` / `{0.4, 0.55, size=12}`. The old reader counted a part as a
 * coordinate when parseFloat read it and it began with a digit; only pills made wholly of such
 * parts are rewritten, anything else is reported.
 */
function rewriteQuadrantPoint(text, ctx) {
  if (!ctx || ctx.slideClass !== 'quadrant' || ctx.listDepth !== 1 || text.startsWith('{') || text.startsWith('[')) return null;
  const parts = text.split(',').map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2 || parts.length > 3) return null;
  if (!parts.every((x) => /^[-+]?\d/.test(x) && Number.isFinite(Number.parseFloat(x)))) return null;
  return pointRecord(parts[0], parts[1], parts[2]) || { unsafe: 'a coordinate is not a plain number' };
}

const { readGanttPill } = require('../lib/core/gantt-pill.js');

/**
 * Gantt: a dependency pill `after: Design` → `after=Design` (row 10 of the Segno note). A name
 * holding a Segno stop character is quoted; one holding a comma is reported, because the old
 * transform read `after: A, B` as ONE name and the old lint as TWO, so there is no single
 * meaning to keep. Gantt slides only — elsewhere `after:` is prose.
 */
function rewriteGanttAfter(text, ctx) {
  if (!ctx || ctx.slideClass !== 'gantt') return null;
  const m = /^after\s*:\s*(.*)$/i.exec(text);
  if (!m) return null;
  const dep = m[1].trim();
  if (!dep) return { unsafe: 'an `after:` with no task name' };
  if (dep.includes(',')) return { unsafe: `"${dep}" was one dependency to the chart and two to lint` };
  const out = /[={}[\]"|\\]/.test(dep) || dep !== dep.trim() ? `after="${dep.replace(/[\\"]/g, '\\$&')}"` : `after=${dep}`;
  const back = readGanttPill(out);
  return back?.kind === 'after' && back.deps.length === 1 && back.deps[0] === dep ? out : { unsafe: `no spelling of it reads back the same (${out})` };
}

const { readCellNote } = require('../lib/core/cell-note.js');

/**
 * Heatmap: a cell annotation `# dipped after onboarding` → `note=dipped after onboarding` (row 20
 * of the Segno note), quoted when the note holds a Segno stop character. Heatmap slides only, and
 * only the old reader's shape: `#`, then whitespace, then the note.
 */
function rewriteCellNote(text, ctx) {
  if (!ctx || ctx.slideClass !== 'heatmap') return null;
  const m = /^#\s+([\s\S]*)$/.exec(text);
  if (!m) return null;
  const note = m[1].trim();
  if (!note) return null;
  const out = /[,={}[\]"|\\]/.test(note) ? `note="${note.replace(/[\\"]/g, '\\$&')}"` : `note=${note}`;
  return readCellNote(out) === note ? out : { unsafe: `no spelling of it reads back the same (${out})` };
}

const { readStateTransition } = require('../lib/core/state-pill.js');

/**
 * State chart: a transition `approve => 2` → `{approve, to=2}`, `=> 3` → `{to=3}` (row 22 of the
 * Segno note). The old reader's pattern, frozen here: an event of anything but `=`, then `=>`,
 * then a number or `self`. Re-read through the new reader before it is trusted.
 */
function rewriteTransition(text, ctx) {
  if (!ctx || ctx.slideClass !== 'state-chart') return null;
  const m = /^([^=]*?)=>\s*(\d+|self)\s*$/.exec(text);
  if (!m) return null;
  const event = m[1].trim();
  const to = m[2];
  const ev = /[,={}[\]"|\\]/.test(event) ? `"${event.replace(/[\\"]/g, '\\$&')}"` : event;
  const out = event ? `{${ev}, to=${to}}` : `{to=${to}}`;
  const back = readStateTransition(out);
  return back && back.event === event && String(back.to) === to ? out : { unsafe: `no spelling of it reads back the same (${out})` };
}

const legacyFlow = require('./segno-legacy/flowchart-span.js');
const flowGrammar = require('../lib/core/flowchart-grammar.js');

/**
 * Flowchart: a style span's colon chain → one record (row 25 of the Segno note).
 *   `:doc` → `doc`   `#api:diamond:c2` → `{#api, diamond, c2}`   `:dotted:loose` → `{dotted, loose}`
 * One word is written bare; two or more go in braces. And the key's colon words:
 *   `[{"=>", Paging path}, {:dotted, Waits}]` → `[{"=>", Paging path}, {dotted, Waits}]`
 * Only a span the old reader read in full is rewritten, and the result must read back the same.
 */
function rewriteFlowStyle(text, ctx) {
  if (!ctx || ctx.slideClass !== 'flowchart') return null;
  if (text.startsWith('[')) {
    const out = text.replace(/\{\s*"?:([a-z0-9-]+)"?\s*,/g, '{$1,');
    return out === text ? null : out;
  }
  if (!text.includes(':')) return null; // a bare status word or plain code: unchanged
  const old = legacyFlow.parseSpan(text, null);
  if (old.unknown.length) return null;
  const words = [];
  if (old.id) words.push(`#${old.id}`);
  const sh = old.shape;
  if (sh.status) words.push(sh.status);
  if (sh.shape) words.push(sh.shape);
  if (sh.slot) words.push(`c${sh.slot}`);
  for (const k of ['fill', 'border', 'text']) if (sh[k]) words.push(`${k}=c${sh[k]}`);
  const ln = old.line;
  if (ln.pattern) words.push(ln.pattern);
  if (ln.head) words.push(ln.head);
  if (ln.loose) words.push('loose');
  if (!words.length) return null;
  const out = words.length === 1 ? words[0] : `{${words.join(', ')}}`;
  const back = flowGrammar.parseSpan(out, null);
  const sorted = (o) => Object.fromEntries(Object.entries(o).sort(([x], [y]) => (x < y ? -1 : 1)));
  const same = (a, b) => JSON.stringify([a.id, sorted(a.shape), sorted(a.line)]) === JSON.stringify([b.id, sorted(b.shape), sorted(b.line)]);
  return !back.unknown.length && same(back, old) ? out : { unsafe: `no spelling of it reads back the same (${out})` };
}

const REWRITERS = { pill: rewritePill, spark: rewriteSpark, bracket: rewriteBracket, point: rewriteQuadrantPoint, after: rewriteGanttAfter, note: rewriteCellNote, transition: rewriteTransition, flow: rewriteFlowStyle };

/**
 * Scatter, a LINE rewrite: the row's trailing run of 2–3 value pills (the old reader's
 * coordinates: the maximal numeric suffix of the pills) becomes one point pill.
 *   - Atlas `$4.2M` `62%`         →  - Atlas `{$4.2M, 62%}`
 *   - Borealis `$2.1M` `38%` `140` →  - Borealis `{$2.1M, 38%, size=140}`
 */
function rewriteScatterRow(line, ctx) {
  if (!ctx || ctx.slideClass !== 'scatter' || ctx.listDepth !== 0) return null;
  const spans = spansOf(line);
  // The trailing pills: spans separated only by whitespace, ending the line.
  let k = spans.length;
  let end = line.trimEnd().length;
  const run = [];
  while (k > 0) {
    const sp = spans[k - 1];
    if (line.slice(sp.to, end).replace(/`/g, '').trim() !== '') break;
    run.unshift(sp);
    end = sp.from;
    while (end > 0 && line[end - 1] === '`') end--;
    k--;
  }
  const texts = run.map((sp) => line.slice(sp.from, sp.to));
  let first = texts.length;
  while (first > 0 && legacyValues.isValuePill(texts[first - 1])) first--;
  const nums = texts.slice(first);
  if (nums.length < 2 || nums.length > 3) return null;
  const rec = pointRecord(nums[0], nums[1], nums[2]);
  if (!rec) return { unsafe: `a coordinate holds a separator: ${nums.join(' ')}` };
  // Replace from the first number pill's opening backticks to the last one's closing ones.
  let from = run[first].from;
  while (from > 0 && line[from - 1] === '`') from--;
  let to = run[run.length - 1].to;
  while (to < line.length && line[to] === '`') to++;
  return line.slice(0, from) + '`' + rec + '`' + line.slice(to);
}

/**
 * Gantt, a LINE rewrite (row 11): the retired eyebrow — a line of only code pills, one holding
 * the window (`..`) and one `today <point>` — becomes the bracketed axis, the one form the chart
 * reads. An axis needs a name first; a gantt draws none, so it is `Timeline`.
 *   `2026 Q1..2026 Q4` `today Q3`  →  `[{Timeline, 2026 Q1..2026 Q4, today=Q3}]`
 * And (row 8) a bracketed axis whose today point is bare gets its name: `today=Q3`.
 */
function rewriteGanttAxis(line, ctx) {
  if (!ctx || ctx.slideClass !== 'gantt' || ctx.listRow) return null;
  const spans = spansOf(line);
  if (!spans.length) return null;
  const outside = spans.reduce((acc, sp, k) => acc + line.slice(k ? spans[k - 1].to : 0, sp.from), '') + line.slice(spans[spans.length - 1].to);
  if (outside.replace(/`/g, '').trim() !== '') return null; // a line of pills and nothing else
  const texts = spans.map((sp) => line.slice(sp.from, sp.to).trim());
  if (texts.length === 1 && texts[0].startsWith('[')) {
    const members = legacyBrackets.parseBracketList(texts[0], { maxParts: 3 });
    const m = members?.[0];
    if (!m || m.length < 2) return null;
    const parts = m.slice(1).map((p) => (!p.includes('..') && !/^today\s*=/i.test(p) && !/=/.test(p) ? `today=${p}` : p));
    if (parts.join() === m.slice(1).join()) return null;
    // A `name=value` part is written as such; every other part is spelled to read back exactly.
    const spell = (p) => (/^[a-z][a-z0-9-]*=\S/i.test(p) ? p : partSpelling(p));
    const out = `[{${[m[0], ...parts].map(spell).join(', ')}}${members.length > 1 ? `, ${members.slice(1).map((x) => `{${x.map(spell).join(', ')}}`).join(', ')}` : ''}]`;
    return line.replace(texts[0], out);
  }
  let window = '';
  let today = '';
  for (const t of texts) {
    if (/^today\b/i.test(t)) today = t.replace(/^today\s*:?\s*/i, '').trim();
    else if (t.includes('..') && !window) window = t;
    else return null;
  }
  if (!window && !today) return null;
  const items = ['Timeline', ...(window ? [window] : []), ...(today ? [`today=${today}`] : [])];
  if (items.some((x) => /[,{}[\]"|]/.test(x))) return { unsafe: 'a window or today point holds a separator' };
  const indent = /^\s*/.exec(line)[0];
  return `${indent}\`[{${items.join(', ')}}]\``;
}

const legacyRadar = require('./segno-legacy/radar-scale.js');

/**
 * Radar: an eyebrow that pinned the scale (`Scale · 0–100`) → the value axis line
 * `[{Scale, 0..100}]` (row 27 of the Segno note), which the chart lifts off the slide. An eyebrow
 * that says more than the scale (`Scale · 0–10, on the criteria we wrote`) is prose the author
 * wrote for the slide, so it stays and the axis line goes in above it. An eyebrow the old reader
 * found no scale in is left alone.
 */
function rewriteRadarScale(line, ctx) {
  if (!ctx || ctx.slideClass !== 'radar' || ctx.listRow || ctx.headingSeen) return null;
  const m = /^(\s*)`([^`\n]+)`\s*$/.exec(line);
  if (!m) return null;
  // A slide that already has its axis line is done: the eyebrow after it is prose (idempotence).
  if (m[2].trim().startsWith('[')) { ctx.radarAxis = true; return null; }
  if (ctx.radarAxis) return null;
  const text = m[2].trim();
  const scale = legacyRadar.parseScale(text);
  if (!scale) return null;
  const num = /(-?[\d.]+)\s*(?:[–—-]|to)\s*(-?[\d.]+)/.exec(text) || /(?:^|\s)([\d.]+)\s*$/.exec(text);
  const before = text.slice(0, num.index).trim();
  const after = text.slice(num.index + num[0].length).trim();
  const head = before.replace(/\s*[·:]\s*$/, '').trim();
  const segs = head.split(/\s*·\s*/).filter(Boolean);
  const name = (segs[segs.length - 1] || 'Scale').replace(/\s+$/, '');
  if (/[,={}[\]"|]/.test(name)) return { unsafe: 'the scale name holds a separator' };
  const axis = `${m[1]}\`[{${name}, ${scale.min}..${scale.max}}]\``;
  const pure = !after && segs.length <= 1;
  return pure ? axis : `${axis}\n\n${line}`;
}

const { readJourneyStep } = require('../lib/core/journey-step.js');

/**
 * Journey, a LINE rewrite (decision 11 of the Segno note): a task's `@actor`, `:mood` and `+volume`
 * pills become one step record. The first actor goes in as `who=`; a second actor stays an
 * `@` pill, because a record names `who` once. A task with actors only keeps its `@` pills —
 * that is still the shortcut.
 *   - Make tea `@me` `:5`              →  - Make tea `{who=me, mood=5}`
 *   - Do work `@me` `@cat` `:1` `+40`  →  - Do work `{who=me, mood=1, volume=40}` `@cat`
 * The old reader's own rules decide what each pill was (`parseInt` for mood, `parseFloat` for
 * volume), and the result is re-read through the new reader before it is trusted.
 */
function rewriteJourneyTask(line, ctx) {
  if (!ctx || ctx.slideClass !== 'journey' || ctx.listDepth !== 1) return null;
  const spans = spansOf(line).map((sp) => ({ ...sp, text: line.slice(sp.from, sp.to).trim() }));
  const actors = [];
  let mood = null;
  let volume = null;
  const used = [];
  for (const sp of spans) {
    const t = sp.text;
    if (t.startsWith('@') && t.length > 1) { actors.push({ sp, name: t.slice(1) }); continue; }
    if (t.startsWith(':')) { const n = Number.parseInt(t.slice(1), 10); if (Number.isFinite(n)) { mood = n; used.push(sp); } continue; }
    if (t.startsWith('+')) { const n = Number.parseFloat(t.slice(1)); if (Number.isFinite(n)) { volume = n; used.push(sp); } }
  }
  if (mood == null && volume == null) return null; // actors only: `@me` is still valid
  const q = (x) => (/[,={}[\]"|\\]/.test(x) || x !== x.trim() ? `"${x.replace(/[\\"]/g, '\\$&')}"` : x);
  const items = [];
  if (actors[0]) items.push(`who=${q(actors[0].name)}`);
  if (mood != null) items.push(`mood=${mood}`);
  if (volume != null) items.push(`volume=${volume}`);
  const record = `{${items.join(', ')}}`;
  const rest = actors.slice(1).map((a) => a.sp);
  const want = { actors: actors.map((a) => a.name), mood, volume };
  const got = readJourneyStep([record, ...rest.map((sp) => sp.text)]);
  if (JSON.stringify(got) !== JSON.stringify(want)) return { unsafe: `no spelling reads back the same (${record})` };
  // Rebuild the line: the record where the first consumed pill was, the extra actors after it,
  // every other pill and all prose where they were.
  const gone = new Set([...used, ...(actors[0] ? [actors[0].sp] : [])]);
  const first = spans.find((sp) => gone.has(sp));
  let out = '';
  let at = 0;
  for (const sp of spans) {
    if (!gone.has(sp) && !rest.includes(sp)) continue;
    // Each removed pill takes its backticks and the space before it.
    let from = sp.from;
    while (from > 0 && line[from - 1] === '`') from--;
    let to = sp.to;
    while (to < line.length && line[to] === '`') to++;
    const pre = line.slice(at, from);
    out += sp === first ? `${pre}\`${record}\`${rest.map((r) => ` \`${r.text}\``).join('')}` : pre.replace(/[ \t]+$/, '');
    at = to;
  }
  return out + line.slice(at);
}

const LINE_REWRITERS = { point: rewriteScatterRow, gantt: rewriteGanttAxis, radar: rewriteRadarScale, journey: rewriteJourneyTask };
REWRITERS.journey = () => null;
REWRITERS.gantt = () => null; // a line rewriter only; listed so `--only gantt` is valid
REWRITERS.radar = () => null;

/** One span's text → its new text, or null; `{unsafe}` when it looks old but cannot be rewritten. */
export function rewriteSpan(text, active = Object.keys(REWRITERS), ctx = null) {
  // A double-backtick span that QUOTES markdown (`` `{X}:c4` ``, `` 1. cards-grid `{X}:c2` ``):
  // rewrite the single-backtick spans inside it, as a reader would see them rendered.
  if (text.includes('`')) {
    let out = '';
    let at = 0;
    for (const { from, to } of spansOf(text)) {
      const r = rewriteSpan(text.slice(from, to), active, ctx);
      if (r == null) continue;
      if (typeof r === 'object') return r;
      out += text.slice(at, from) + r;
      at = to;
    }
    return at ? out + text.slice(at) : null;
  }
  const escaped = text.startsWith('\\');
  const body = escaped ? text.slice(1) : text;
  for (const name of active) {
    const out = REWRITERS[name](body, ctx);
    if (out == null) continue;
    if (typeof out === 'object') return out;
    return escaped ? `\\${out}` : out;
  }
  return null;
}

/** The inline code spans on one line, CommonMark's way (a port of lint-core's inlineCodeSpans). */
function spansOf(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '\\') { i += 2; continue; }
    if (ch !== '`') { i++; continue; }
    let n = 0;
    while (line[i + n] === '`') n++;
    let j = i + n;
    let close = -1;
    while (j < line.length) {
      if (line[j] !== '`') { j++; continue; }
      let m = 0;
      while (line[j + m] === '`') m++;
      if (m === n) { close = j; break; }
      j += m;
    }
    if (close < 0) { i += n; continue; }
    let from = i + n;
    let to = close;
    if (to - from > 1 && line[from] === ' ' && line[to - 1] === ' ' && line.slice(from, to).trim()) { from++; to--; }
    out.push({ from, to });
    i = close + n;
  }
  return out;
}

const FENCE = /^(\s{0,3})(`{3,}|~{3,})\s*([\w-]*)/;

/** Rewrite one file's text. Returns { text, changes: [{line, from, to}], unsafe: [{line, span, why}] }. */
export function rewriteText(src, active = Object.keys(REWRITERS)) {
  const lines = src.split('\n');
  const changes = [];
  const unsafe = [];
  let fence = null; // { marker, prose: boolean }
  const ctx = { slideClass: null, listRow: false, listDepth: -1, headingSeen: false }; // the slide's component, from its `_class:` directive
  lines.forEach((orig, n) => {
    let line = orig;
    const f = FENCE.exec(line);
    if (fence) {
      if (f && f[2][0] === fence.marker[0] && f[2].length >= fence.marker.length && !f[3]) { fence = null; ctx.slideClass = null; return; }
      if (!fence.prose) return;
    } else if (f) {
      fence = { marker: f[2], prose: /^(markdown|md)$/i.test(f[3]) };
      ctx.slideClass = null;
      return;
    }
    if (/^---\s*$/.test(line)) { ctx.slideClass = null; ctx.headingSeen = false; ctx.radarAxis = false; }
    if (/^#{1,6}\s/.test(line)) ctx.headingSeen = true;
    const cls = /<!--\s*_?class:\s*([a-z][a-z0-9-]*)/.exec(line);
    if (cls) ctx.slideClass = cls[1];
    const row = /^(\s*)(?:[-*+]|\d+[.)])\s/.exec(line);
    ctx.listRow = !!row;
    // A list row's depth: 0 at the margin, 1 for a row nested once (two to three spaces), and so
    // on. A quadrant's points sit on its items (depth 1, under a group); a scatter's on its rows
    // (depth 0). Deeper rows are detail — prose that may hold any figure, never a coordinate.
    ctx.listDepth = row ? Math.floor(row[1].length / 2) : -1;
    for (const name of active) {
      const lr = LINE_REWRITERS[name];
      if (!lr) continue;
      const got = lr(line, ctx);
      if (got == null) continue;
      if (typeof got === 'object') { unsafe.push({ line: n + 1, span: line.trim(), why: got.unsafe }); continue; }
      changes.push({ line: n + 1, from: line, to: got });
      line = got;
      lines[n] = got;
    }
    let out = '';
    let at = 0;
    for (const { from, to } of spansOf(line)) {
      const text = line.slice(from, to);
      const r = rewriteSpan(text, active, ctx);
      if (r == null) continue;
      if (typeof r === 'object') { unsafe.push({ line: n + 1, span: text, why: r.unsafe }); continue; }
      out += line.slice(at, from) + r;
      at = to;
      changes.push({ line: n + 1, from: text, to: r });
    }
    if (at) lines[n] = out + line.slice(at);
  });
  return { text: lines.join('\n'), changes, unsafe };
}

/**
 * An `.mdx` docs page keeps its demo slides in JS template literals (`` export const X = `…` ``),
 * where every backtick is escaped (`\\``). Each template is unescaped, rewritten as the deck it is,
 * and escaped again; the prose between templates is rewritten as ordinary Markdown. A template
 * that interpolates (`${…}`) is left alone, since its text is not the deck it renders.
 */
export function rewriteMdx(src, active = Object.keys(REWRITERS)) {
  const changes = [];
  const unsafe = [];
  const prose = (text) => {
    const r = rewriteText(text, active);
    changes.push(...r.changes);
    unsafe.push(...r.unsafe);
    return r.text;
  };
  let out = '';
  let at = 0;
  for (const m of src.matchAll(/=\s*`((?:[^`\\]|\\.)*)`/gs)) {
    const bodyFrom = m.index + m[0].indexOf('`') + 1;
    out += prose(src.slice(at, bodyFrom));
    const body = m[1];
    if (body.includes('${')) out += body;
    else {
      const r = rewriteText(body.replace(/\\`/g, '`'), active);
      changes.push(...r.changes);
      unsafe.push(...r.unsafe);
      out += r.changes.length ? r.text.replace(/`/g, '\\`') : body;
    }
    at = bodyFrom + body.length;
  }
  out += prose(src.slice(at));
  return { text: out, changes, unsafe };
}

export function corpus() {
  const files = execFileSync('git', ['ls-files', '*.md', '*.mdx', 'lib/components/**/*.manifest.json'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  return files.filter((f) => !f.startsWith('engineering/decisions/') && !f.startsWith('changelog.d/') && f !== 'CHANGELOG.md' && !f.includes('/segno-legacy/'));
}

/**
 * A component manifest holds whole example decks as JSON strings (`skeleton`, `sample`,
 * `example`, variant docs) and prose that quotes spans. Every string value is rewritten as
 * Markdown; the file is re-serialized only when something changed, in the house JSON shape
 * (two-space indent, trailing newline).
 */
export function rewriteManifest(src, active) {
  const data = JSON.parse(src);
  const changes = [];
  const unsafe = [];
  const walk = (v) => {
    if (typeof v === 'string') {
      const r = rewriteText(v, active);
      changes.push(...r.changes);
      unsafe.push(...r.unsafe);
      return r.text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') { for (const k of Object.keys(v)) v[k] = walk(v[k]); return v; }
    return v;
  };
  const pairs = [];
  const collect = (before, after) => {
    if (typeof before === 'string') { if (before !== after) pairs.push([before, after]); return; }
    if (before && typeof before === 'object') for (const k of Object.keys(before)) collect(before[k], after[k]);
  };
  const before = JSON.parse(src);
  const out = walk(data);
  collect(before, out);
  // Replace each changed string where it sits, so the file keeps its own layout (compact
  // one-line objects stay compact); then prove the edit is exactly the rewrite.
  let text = src;
  for (const [a, b] of pairs) {
    const enc = JSON.stringify(a);
    if (!text.includes(enc)) return { text: src, changes: [], unsafe: [...unsafe, { line: 0, span: a.slice(0, 40), why: 'the string is escaped differently in the file; rewrite by hand' }] };
    text = text.replace(enc, JSON.stringify(b));
  }
  if (JSON.stringify(JSON.parse(text)) !== JSON.stringify(out)) return { text: src, changes: [], unsafe: [...unsafe, { line: 0, span: '', why: 'the in-place edit did not reproduce the rewrite' }] };
  return { text, changes, unsafe };
}

function main(argv) {
  const check = argv.includes('--check');
  const onlyAt = argv.indexOf('--only');
  const active = onlyAt >= 0 ? argv[onlyAt + 1].split(',') : Object.keys(REWRITERS);
  for (const a of active) if (!REWRITERS[a]) throw new Error(`segno-codemod: no rewriter "${a}" (have: ${Object.keys(REWRITERS).join(', ')})`);
  const named = argv.filter((a, k) => !a.startsWith('--') && argv[k - 1] !== '--only');
  const files = named.length ? named : corpus();
  let changed = 0;
  let spans = 0;
  const unsafeAll = [];
  for (const rel of files) {
    // A path the author typed is theirs: from the working directory first, then the repo root.
    const file = named.length && fs.existsSync(path.resolve(process.cwd(), rel)) ? path.resolve(process.cwd(), rel) : path.resolve(ROOT, rel);
    const src = fs.readFileSync(file, 'utf8');
    const r = rel.endsWith('.manifest.json') ? rewriteManifest(src, active) : rel.endsWith('.mdx') ? rewriteMdx(src, active) : rewriteText(src, active);
    for (const u of r.unsafe) unsafeAll.push(`${rel}:${u.line}  \`${u.span}\` — ${u.why}`);
    if (!r.changes.length) continue;
    changed++;
    spans += r.changes.length;
    if (!check) fs.writeFileSync(file, r.text);
  }
  console.log(`[segno-codemod] ${check ? 'would rewrite' : 'rewrote'} ${spans} span(s) in ${changed} file(s) (${active.join(', ')})`);
  if (unsafeAll.length) console.log(`[segno-codemod] left alone, rewrite by hand:\n  ${unsafeAll.join('\n  ')}`);
  if (check && spans) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) main(process.argv.slice(2));
