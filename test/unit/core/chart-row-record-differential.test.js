// A GENERATED differential for the chart row record (the chart authoring model, phase 2): random chart
// slides, each written twice, once with the old spans and once with one `{…}` record per row, must render
// the same HTML and narrate the same words. The hand-picked matrix in chart-row-record.test.js pins the
// cases the reviewers found; this one finds the next ones. Seeded, so a failure reproduces: the message
// carries the seed and both sources.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../../../lib/engine');
const { narrateChart } = require('../../../lib/core/chart-narration.js');

const deck = (cls, body) => `---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n## A\n\n${body}\n`;

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// How each chart writes a row's value: `old(x)` is the spans, `rec(x)` the one record.
const num = (r) => String(Math.round(r() * 90) / 10 + 1);
const CHARTS = {
  bar: { series: true, make: num, old: (x) => `\`${x}\``, rec: (x) => `\`{${x}}\`` },
  line: { series: true, make: num, old: (x) => `\`${x}\``, rec: (x) => `\`{${x}}\`` },
  'stacked-bar': { series: true, total: true, make: num, old: (x) => `\`${x}\``, rec: (x) => `\`{${x}}\`` },
  slope: { series: true, nestedOnly: true, make: (r) => `${Math.round(r() * 80) + 5}%`, old: (x) => `\`${x}\``, rec: (x) => `\`{${x}}\`` },
  piechart: { make: (r) => `${Math.round(r() * 40) + 5}%`, old: (x) => `\`${x}\``, rec: (x) => `\`{${x}}\`` },
  funnel: { make: (r) => String(Math.round(r() * 900) + 50), old: (x) => `\`${x}\``, rec: (x) => `\`{${x}}\`` },
  'word-cloud': { make: (r) => String(Math.round(r() * 9) + 1), old: (x) => `\`${x}\``, rec: (x) => `\`{${x}}\`` },
  bullet: { make: (r) => [num(r), num(r)], old: ([a, b]) => `\`${a}\` \`${b}\``, rec: ([a, b]) => `\`{${a}, target=${b}}\`` },
  progress: {
    make: (r) => [`${Math.round(r() * 90) + 5}%`, ['at-risk', 'on-track', 'done'][Math.floor(r() * 3)]],
    old: ([a, b]) => `\`${a}\` \`${b}\``, rec: ([a, b]) => `\`{${a}, ${b}}\``,
  },
  waterfall: {
    make: (r) => [`${r() < 0.3 ? '-' : '+'}${num(r)}`.replace('+-', '-'), r() < 0.2 ? 'total' : null].filter(Boolean),
    old: (x) => x.map((s) => `\`${s}\``).join(' '), rec: (x) => `\`{${x.join(', ')}}\``,
  },
};

const LABELS = ['EMEA', 'APAC', 'AMER', 'LATAM', 'Nordics', 'DACH', 'ANZ'];

/** One random slide body in both spellings. */
function slide(chart, r) {
  const c = CHARTS[chart];
  const n = 2 + Math.floor(r() * 4);
  const ordered = r() < 0.15;
  const loose = r() < 0.2;
  const nested = c.series && (c.nestedOnly || r() < 0.6);
  const mark = (i) => (ordered ? `${i + 1}.` : '-');
  const out = { old: [], rec: [] };
  const sep = loose ? '\n' : '';
  for (let i = 0; i < n; i++) {
    const label = LABELS[i % LABELS.length];
    const m = mark(i);
    const pad = ' '.repeat(m.length + 1);
    if (nested) {
      const total = c.total && r() < 0.5 ? c.make(r) : null;
      out.old.push(`${m} ${label}${total ? ` ${c.old(total)}` : ''}`);
      out.rec.push(`${m} ${label}${total ? ` ${c.rec(total)}` : ''}`);
      for (let k = 0; k < 2 + Math.floor(r() * 2); k++) {
        const v = c.make(r);
        out.old.push(`${pad}- Part ${k + 1} ${c.old(v)}`);
        out.rec.push(`${pad}- Part ${k + 1} ${c.rec(v)}`);
      }
    } else {
      const v = c.make(r);
      out.old.push(`${m} ${label} ${c.old(v)}`);
      out.rec.push(`${m} ${label} ${c.rec(v)}`);
      if (r() < 0.2) {
        // A description under the row: the chart reads it as the row's detail.
        out.old.push(`${pad}> note ${i}`);
        out.rec.push(`${pad}> note ${i}`);
      }
    }
    if (loose) { out.old.push(sep); out.rec.push(sep); }
  }
  return { old: out.old.join('\n'), rec: out.rec.join('\n') };
}

describe('generated slides: the record form equals the old form', () => {
  for (const chart of Object.keys(CHARTS)) {
    test(chart, () => {
      let drawn = 0;
      const N = Number(process.env.DIFF_N) || 40;
      for (let seed = 1; seed <= N; seed++) {
        const s = slide(chart, rng(seed * 7919 + chart.length));
        const was = engine.render(deck(chart, s.old), {}).html;
        const info = `${chart} seed ${seed}\n--- old ---\n${s.old}\n--- record ---\n${s.rec}`;
        const now = engine.render(deck(chart, s.rec), {}).html;
        if (/chart-frame/.test(was)) drawn++;
        // On a slide the chart declines the list shows as written, and the record form must show the old-form list.
        assert.equal(now, was, `HTML differs: ${info}`);
        assert.equal(narrateChart(deck(chart, s.rec)), narrateChart(deck(chart, s.old)), `narration differs: ${info}`);
      }
      // Anti-vacuity: most generated slides must draw a chart in the old form, or equality proves nothing.
      assert.ok(drawn >= N * 0.6, `${chart}: only ${drawn} of ${N} old-form slides drew a chart`);
    });
  }
});

// The other direction (the inversion's arm): decks that write NO record for the row's value but put a
// `{…}` pill in a detail bullet. Main drew these as pills and kept every data value; so must this.
describe('generated slides: a pill in a detail bullet is still a pill', () => {
  const FIELDS = { piechart: (r) => `${Math.round(r() * 40) + 5}%`, funnel: (r) => String(Math.round(r() * 900) + 50), waterfall: (r) => `+${num(r)}`, 'word-cloud': (r) => String(Math.round(r() * 9) + 1) };
  const SERIES = { bar: num, line: num };
  for (const [chart, make] of [...Object.entries(FIELDS), ...Object.entries(SERIES)]) {
    test(chart, () => {
      const N = Number(process.env.DIFF_N) || 40;
      for (let seed = 1; seed <= N; seed++) {
        const r = rng(seed * 104729 + chart.length);
        const n = 3 + Math.floor(r() * 3);
        const plain = [];
        const withPills = [];
        let injected = 0;
        for (let i = 0; i < n; i++) {
          const row = `- ${LABELS[i]} \`${make(r)}\``;
          plain.push(row);
          withPills.push(row);
          if (r() < 0.6) { withPills.push(`  - vs plan \`{${r() < 0.5 ? '+' : '-'}${Math.floor(r() * 9) + 1}}\``); injected++; }
        }
        // A fields chart also takes a detail bullet under a row with no value of its own.
        if (FIELDS[chart]) withPills.unshift('- Header row', '  - note `{+1}`'); // not counted: a row with no value draws no detail on main either
        const info = `${chart} seed ${seed}\n${withPills.join('\n')}`;
        const base = engine.render(deck(chart, plain.join('\n')), {}).html;
        const html = engine.render(deck(chart, withPills.join('\n')), {}).html;
        const values = (h) => [...h.matchAll(/data-value="([^"]*)"/g)].map((m) => m[1]);
        if (!/chart-frame/.test(base)) continue;
        if (!injected) continue;
        assert.match(html, /chart-frame/, `the chart stopped drawing: ${info}`);
        assert.ok((html.match(/lat-pill/g) || []).length >= injected, `a detail pill was lost: ${info}`);
        assert.doesNotMatch(html, /<code>\{[+-]?\d+\}<\/code>/, `raw braces: ${info}`);
        if (!FIELDS[chart]) assert.deepEqual(values(html).filter((v) => /^[+-]/.test(v) && !values(base).includes(v)), [], `a delta became data: ${info}`);
      }
    });
  }
});
