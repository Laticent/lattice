#!/usr/bin/env node
/**
 * chart-list-vs-table-bakeoff — measures radar, bullet and progress written as a list versus a table, over the real corpus.
 *
 * It re-derives the bake-off in engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §7,
 * so the owner's list-or-table decision rests on numbers a reviewer can rerun. Every deck, gallery,
 * docs example and manifest sample that carries a radar, bullet or progress slide is converted into
 * both forms under that note's rules (a list row is a label plus one `{…}` record; a table has a
 * header row and a separator), and the two are compared.
 *
 * MEASURED: characters (table unpadded and padded to align pipes), the names written, the places
 * touched to add or rename an axis or add a series or band, the header-and-separator overhead, and
 * the share of optional cells a table would leave empty. JUDGED, and marked so: the Compose, error
 * hazard and schema-fit scores, and the persona weights. They sit in JUDGED and WEIGHTS below, and
 * `--sensitivity` shows which of them could flip a result. Not measured: authoring error rates.
 *
 * The corpus walker is the census's (tools/chart-authoring-census.mjs), so slide counts match it.
 * A corpus edit moves every number, so quote the commit when you cite them.
 *
 * Usage:
 *   node tools/chart-list-vs-table-bakeoff.mjs                 # Markdown tables to stdout
 *   node tools/chart-list-vs-table-bakeoff.mjs --sensitivity   # plus the weight sweep
 *   node tools/chart-list-vs-table-bakeoff.mjs --json out.json
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { corpus } from './chart-authoring-census.mjs';

const require = createRequire(import.meta.url);
const { splitSourceToSections } = require('../lib/core/section-source-split.js');

const FRONT = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;
const CHARTS = ['radar', 'bullet', 'progress'];

// ── The corpus: every slide whose class names one of the three charts ───────────────────────
function slidesByChart() {
  const out = Object.fromEntries(CHARTS.map((c) => [c, []]));
  for (const f of corpus()) {
    if (f.file.includes('components/inventory/')) continue; // the `list` component's own `bullet` modifier
    const deck = (f.source.match(FRONT)?.[1].match(/^class:\s*(.+)$/m)?.[1] ?? '').replace(/["']/g, '').trim();
    let secs;
    try { secs = splitSourceToSections(f.source); } catch { secs = [f.source]; }
    secs.forEach((src, i) => {
      const m = [...String(src).matchAll(/<!--\s*_?class:\s*([^>]*?)\s*-->/g)].pop();
      const mods = (m ? m[1] : deck).split(/\s+/).filter(Boolean);
      for (const c of CHARTS) if (mods.includes(c)) out[c].push({ ref: `${f.file}:${i + 1}`, src: String(src), mods });
    });
  }
  return out;
}

// ── Line-based reading of today's forms (the corpus forms are simple; the counts match the census) ──
const codes = (s) => [...s.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
const labelOf = (s) => s.replace(/`[^`]+`/g, '').replace(/^\s*[-*]\s+/, '').trim();
const listLines = (src) => src.split('\n').filter((l) => /^\s*[-*]\s+/.test(l)).map((l) => ({ depth: Math.floor(l.match(/^\s*/)[0].length / 2), text: l }));
const avg = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);

/** A GFM table, unpadded (`pad` false) or padded so the pipes align. */
function table(header, rows, pad) {
  const w = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (c) => `| ${c.map((x, i) => (pad ? x.padEnd(w[i]) : x)).join(' | ')} |`;
  const sep = `|${w.map((x) => (pad ? '-'.repeat(x + 2) : '---')).join('|')}|`;
  return [fmt(header), sep, ...rows.map(fmt)].join('\n');
}
const widest = (t) => Math.max(...t.split('\n').map((l) => l.length));

function measureProgress(slides) {
  const bySlide = new Map();
  let nested = 0;
  for (const s of slides) {
    for (const l of listLines(s.src)) {
      if (l.depth > 0) { nested++; continue; }
      (bySlide.get(s.ref) ?? bySlide.set(s.ref, []).get(s.ref)).push({ name: labelOf(l.text), c: codes(l.text) });
    }
  }
  let list = 0, today = 0, tableU = 0, tableP = 0, rows = 0, over80 = 0;
  for (const rs of bySlide.values()) {
    rows += rs.length;
    list += rs.map((r) => `- ${r.name} \`{${r.c.join(', ')}}\``).join('\n').length + rs.length;
    today += rs.map((r) => `- ${r.name} \`${r.c.join('` `')}\``).join('\n').length + rs.length;
    const cells = rs.map((r) => [r.name, r.c[0] ?? '', r.c[1] ?? '']);
    const hdr = ['Item', 'Progress', 'Status'];
    tableU += table(hdr, cells, false).length + 1;
    const p = table(hdr, cells, true);
    tableP += p.length + 1;
    if (widest(p) > 80) over80++;
  }
  return { slides: bySlide.size, rows, nestedNotes: nested, today, list, tableUnpadded: tableU, tablePadded: tableP, overheadLinesPerSlide: 2, padded80: over80 };
}

function measureBullet(slides) {
  const bySlide = new Map();
  const named = { band: 0, floor: 0 };
  for (const s of slides) {
    let cur = null;
    for (const l of listLines(s.src)) {
      const c = codes(l.text);
      if (l.depth === 0) { cur = { name: labelOf(l.text), c, bands: [], floor: null }; (bySlide.get(s.ref) ?? bySlide.set(s.ref, []).get(s.ref)).push(cur); }
      else if (cur) {
        const lab = labelOf(l.text).toLowerCase();
        if (/^(band|range)$/.test(lab)) { cur.bands.push(c[0]); named.band++; } else if (/^(floor|base)$/.test(lab)) { cur.floor = c[0]; named.floor++; }
      }
    }
  }
  let list = 0, today = 0, tableU = 0, tableP = 0, rows = 0, over80 = 0, optional = 0, empty = 0, bandColumnTouches = 0;
  for (const rs of bySlide.values()) {
    rows += rs.length;
    list += rs.map((r) => `- ${r.name} \`{${[r.c[0], `target=${r.c[1]}`, ...r.bands.map((b) => `band=${b}`), ...(r.floor ? [`floor=${r.floor}`] : [])].join(', ')}}\``).join('\n').length + rs.length;
    today += rs.map((r) => `- ${r.name} \`${r.c.join('` `')}\``).join('\n').length + rs.length;
    const mb = Math.max(0, ...rs.map((r) => r.bands.length));
    const fl = rs.some((r) => r.floor);
    const hdr = ['KPI', 'Actual', 'Target', ...Array.from({ length: mb }, (_, i) => `Band ${i + 1}`), ...(fl ? ['Floor'] : [])];
    const cells = rs.map((r) => [r.name, r.c[0] ?? '', r.c[1] ?? '', ...Array.from({ length: mb }, (_, i) => r.bands[i] ?? ''), ...(fl ? [r.floor ?? ''] : [])]);
    for (const c of cells) for (const x of c.slice(3)) { optional++; if (!x) empty++; }
    bandColumnTouches += rs.length; // adding a band or floor column touches every row of the slide
    tableU += table(hdr, cells, false).length + 1;
    const p = table(hdr, cells, true);
    tableP += p.length + 1;
    if (widest(p) > 80) over80++;
  }
  return { slides: bySlide.size, rows, namedNested: named, today, list, tableUnpadded: tableU, tablePadded: tableP, optionalCells: optional, optionalCellsEmpty: empty, emptyShare: optional ? empty / optional : 0, avgRowsTouchedToAddABand: bandColumnTouches / (bySlide.size || 1), padded80: over80, overheadLinesPerSlide: 2 };
}

function measureRadar(slides) {
  const plain = [];
  let quadrant = 0;
  for (const s of slides) {
    const ls = listLines(s.src);
    if (!ls.length) continue;
    if (s.mods.includes('quadrant')) { quadrant++; continue; }
    const series = [];
    let cur = null;
    for (const l of ls) {
      const c = codes(l.text);
      if (l.depth === 0) { cur = { name: labelOf(l.text), axes: [] }; series.push(cur); }
      else if (cur && c.length) cur.axes.push({ a: labelOf(l.text), v: c[0] });
    }
    if (series.some((x) => x.axes.length)) plain.push({ ref: s.ref, series });
  }
  let list = 0, today = 0, tableU = 0, tableP = 0, listLinesN = 0, tableLinesN = 0, axisWritesList = 0, axisWritesTable = 0, over80 = 0, ragged = 0;
  const S = [], A = [];
  for (const r of plain) {
    const ss = r.series;
    S.push(ss.length);
    const axes = [...new Set(ss.flatMap((x) => x.axes.map((y) => y.a)))];
    A.push(axes.length);
    if (!ss.every((x) => x.axes.map((y) => y.a).join('|') === ss[0].axes.map((y) => y.a).join('|'))) ragged++;
    const lines = ss.flatMap((x) => [`- ${x.name}`, ...x.axes.map((y) => `  - ${y.a} \`{${y.v}}\``)]);
    list += lines.join('\n').length + lines.length; listLinesN += lines.length;
    today += ss.flatMap((x) => [`- ${x.name}`, ...x.axes.map((y) => `  - ${y.a} \`${y.v}\``)]).join('\n').length + lines.length;
    axisWritesList += ss.reduce((n, x) => n + x.axes.length, 0);
    axisWritesTable += axes.length;
    const hdr = ['Axis', ...ss.map((x) => x.name)];
    const cells = axes.map((a) => [a, ...ss.map((x) => x.axes.find((y) => y.a === a)?.v ?? '')]);
    tableU += table(hdr, cells, false).length + 1;
    const p = table(hdr, cells, true);
    tableP += p.length + 1; tableLinesN += cells.length + 2;
    if (widest(p) > 80) over80++;
  }
  return {
    slidesPlain: plain.length, slidesQuadrant: quadrant, avgSeries: avg(S), avgAxes: avg(A), raggedAxisSets: ragged,
    today, list, tableUnpadded: tableU, tablePadded: tableP, listLines: listLinesN, tableLines: tableLinesN,
    axisNameWritesList: axisWritesList, axisNameWritesTable: axisWritesTable, padded80: over80,
    placesToAddOrRenameAnAxis: { list: avg(S), table: 1 }, placesToAddASeries: { list: 1, table: avg(A.map((a) => a + 1)) },
  };
}

// ── Scoring ─────────────────────────────────────────────────────────────────────────────────
// A measured criterion is (list, table), lower is better: 5 to the better arm, 5*best/this to the other.
// Where the best is zero (overhead lines), the table is scored 3.5 for two lines.
const score = ([l, t]) => {
  if (l === t) return [5, 5];
  const best = Math.min(l, t);
  if (best === 0) return l === 0 ? [5, 3.5] : [3.5, 5];
  return [l === best ? 5 : Math.max(1, (5 * best) / l), t === best ? 5 : Math.max(1, (5 * best) / t)];
};

// JUDGED, not measured (1 to 5, list then table). Change these and rerun to see what moves.
//   compose: a table edits in Compose today (an editable grid, Tab adds a row; docs/src/components/studio/ComposeView.tsx);
//            a `{…}` list row has no row editor, because the chart-series grid note was never built.
//   hazard:  radar's list repeats axis names per series, so a typo can leave one series an axis short (0 slides do today);
//            a table holds one axis set by construction.
//   fit:     bullet's table needs a fixed column per band and floor; radar's table cannot hold the quadrant variant.
const JUDGED = {
  radar: { compose: [3, 5], hazard: [3, 5], fit: [5, 4], width: [5, 5] },
  bullet: { compose: [3, 5], hazard: [4, 4], fit: [5, 3], width: [5, 4] },
  progress: { compose: [3, 5], hazard: [4, 4], fit: [5, 5], width: [5, 5] },
};
const WEIGHTS = {
  'raw-markdown author': { size: 15, names: 15, edits: 25, overhead: 10, compose: 0, hazard: 15, fit: 10, width: 10 },
  'Compose-first author': { size: 5, names: 5, edits: 15, overhead: 0, compose: 40, hazard: 20, fit: 15, width: 0 },
  'agent author': { size: 25, names: 15, edits: 10, overhead: 10, compose: 0, hazard: 30, fit: 10, width: 0 },
};

function criteria(chart, m) {
  // The mean places touched per edit: radar over add an axis, rename an axis, add a series and change a value;
  // bullet over add a row, change a value and add a band (a table adds a column, touching every row of the slide).
  let edits = [1, 1];
  if (chart === 'radar') edits = [(m.placesToAddOrRenameAnAxis.list * 2 + m.placesToAddASeries.list + 1) / 4, (m.placesToAddOrRenameAnAxis.table * 2 + m.placesToAddASeries.table + 1) / 4];
  if (chart === 'bullet') edits = [1, (1 + 1 + m.avgRowsTouchedToAddABand) / 3];
  const names = chart === 'radar' ? [m.axisNameWritesList, m.axisNameWritesTable] : [1, 1];
  const j = JUDGED[chart];
  return {
    size: score([m.list, m.tableUnpadded]), names: score(names), edits: score(edits), overhead: score([0, 2]),
    compose: j.compose, hazard: j.hazard, fit: j.fit, width: j.width,
  };
}
const total = (crit, w) => {
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return [0, 1].map((i) => Object.keys(w).reduce((n, k) => n + w[k] * crit[k][i], 0) / sum);
};

function report(m, sensitivity) {
  const pct = (a, b) => `${a.toLocaleString('en-US')} → ${b.toLocaleString('en-US')} (${b >= a ? '+' : '−'}${Math.abs(Math.round(((b - a) / a) * 100))}%)`;
  const lines = [];
  lines.push('# list versus table — radar, bullet, progress\n');
  lines.push('| | radar list → table | bullet list → table | progress list → table |', '|---|---|---|---|');
  lines.push(`| slides · rows | ${m.radar.slidesPlain} plain + ${m.radar.slidesQuadrant} quadrant | ${m.bullet.slides} · ${m.bullet.rows} | ${m.progress.slides} · ${m.progress.rows} |`);
  lines.push(`| characters, table unpadded | ${pct(m.radar.list, m.radar.tableUnpadded)} | ${pct(m.bullet.list, m.bullet.tableUnpadded)} | ${pct(m.progress.list, m.progress.tableUnpadded)} |`);
  lines.push(`| characters, table padded to align pipes | ${pct(m.radar.list, m.radar.tablePadded)} | ${pct(m.bullet.list, m.bullet.tablePadded)} | ${pct(m.progress.list, m.progress.tablePadded)} |`);
  lines.push(`| today's form, characters | ${m.radar.today.toLocaleString('en-US')} | ${m.bullet.today.toLocaleString('en-US')} | ${m.progress.today.toLocaleString('en-US')} |`);
  lines.push(`| axis names written | ${m.radar.axisNameWritesList} → ${m.radar.axisNameWritesTable} | same | same |`);
  lines.push(`| places to add or rename an axis | ${m.radar.placesToAddOrRenameAnAxis.list.toFixed(1)} → 1 | n/a | n/a |`);
  lines.push(`| places to add a series or band | 1 → ${m.radar.placesToAddASeries.table.toFixed(1)} | 1 → ${m.bullet.avgRowsTouchedToAddABand.toFixed(1)} | n/a |`);
  lines.push(`| optional cells left empty | n/a | ${Math.round(m.bullet.emptyShare * 100)}% (${m.bullet.optionalCellsEmpty} of ${m.bullet.optionalCells}) | n/a |`);
  lines.push(`| padded table wider than 80 columns | ${m.radar.padded80} of ${m.radar.slidesPlain} | ${m.bullet.padded80} of ${m.bullet.slides} | ${m.progress.padded80} of ${m.progress.slides} |`);
  lines.push(`| radar axis sets that differ between series | ${m.radar.raggedAxisSets} of ${m.radar.slidesPlain} | n/a | n/a |`);
  lines.push('', '## Scores (1 to 5, list / table; compose, hazard and fit are JUDGED)\n');
  lines.push('| weighting | radar | bullet | progress |', '|---|---|---|---|');
  const crit = Object.fromEntries(CHARTS.map((c) => [c, criteria(c, m[c])]));
  for (const [p, w] of Object.entries(WEIGHTS)) {
    const cell = (c) => { const [l, t] = total(crit[c], w); return `${l.toFixed(2)} / ${t.toFixed(2)} ${l > t + 0.05 ? 'list' : t > l + 0.05 ? 'table' : 'tie'}`; };
    lines.push(`| ${p} | ${cell('radar')} | ${cell('bullet')} | ${cell('progress')} |`);
  }
  if (sensitivity) {
    lines.push('', '## Sensitivity\n', 'Compose weight (others = the raw-markdown mix) at which the table overtakes the list:\n');
    for (const c of CHARTS) {
      let flip = null;
      for (let cw = 0; cw <= 200; cw += 5) { const [l, t] = total(crit[c], { ...WEIGHTS['raw-markdown author'], compose: cw }); if (t > l) { flip = cw; break; } }
      lines.push(`- ${c}: ${flip === null ? 'never (up to 200)' : flip}`);
    }
    lines.push('', 'If a list row editor shipped (compose list = 5), the table wins no chart under any weighting except where noted:\n');
    for (const c of CHARTS) {
      const j = { ...crit[c], compose: [5, 5] };
      lines.push(`- ${c}: ${Object.entries(WEIGHTS).map(([p, w]) => { const [l, t] = total(j, w); return `${p} ${l.toFixed(2)} / ${t.toFixed(2)}`; }).join(' · ')}`);
    }
  }
  return lines.join('\n');
}

function main(args) {
  const by = slidesByChart();
  const m = { radar: measureRadar(by.radar), bullet: measureBullet(by.bullet), progress: measureProgress(by.progress) };
  const ji = args.indexOf('--json');
  if (ji >= 0) writeFileSync(args[ji + 1], `${JSON.stringify(m, null, 1)}\n`);
  console.log(report(m, args.includes('--sensitivity')));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));

export { measureBullet, measureProgress, measureRadar, report, score, slidesByChart };
