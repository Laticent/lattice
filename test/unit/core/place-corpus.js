// The corpus for the PLACE ORACLE (place-oracle.test.js, and the Compose arm in
// docs/src/lib/compose/inline-objects.test.ts): chart slides whose `{…}` record spans sit in every
// place the readers have disagreed about. Each slide is a { chart, body } pair; every record value is
// UNIQUE within a slide, so "which span did a reader call the record" compares as an ordered list of
// texts and two readers cannot agree by claiming different rows that happen to read the same.
//
// Seeded, so a failure reproduces: the message carries the seed and the slide source.

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

/** How each list chart writes one unique record value (n is unique within the slide). */
const VALUE = {
  bar: (n) => `{${n}.5}`,
  line: (n) => `{${n}.5}`,
  'stacked-bar': (n) => `{${n}.5}`,
  slope: (n) => `{${n}0%}`,
  piechart: (n) => `{${n}%}`,
  funnel: (n) => `{${n}00}`,
  'word-cloud': (n) => `{${n}}`,
  map: (n) => `{${n}}`,
  waterfall: (n) => `{+${n}.5}`,
  bullet: (n) => `{${n}.5, target=${n + 20}}`,
  progress: (n) => `{${n}%, on-track}`,
  radar: (n) => `{${n}}`,
};
const LIST_CHARTS = Object.keys(VALUE);
const LABELS = ['EMEA', 'APAC', 'AMER', 'LATAM', 'Nordics', 'DACH', 'ANZ', 'Iberia'];

/** One row's text for a shape; `v` is the record, `n` its unique number, `label` the row's label. */
const SHAPES = {
  plain: (c) => `${c.label} \`${c.v}\``,
  bold: (c) => `**${c.label}** \`${c.v}\``,
  wrapped: (c) => `${c.label} **\`${c.v}\`**`,
  link: (c) => `[${c.label}](https://example.test/${c.n}) \`${c.v}\``,
  heading: (c) => `### ${c.label} \`${c.v}\``,
  comment: (c) => `${c.label} \`${c.v}\` <!-- c${c.n} -->`,
  commentBefore: (c) => `${c.label} <!-- c${c.n} --> \`${c.v}\``,
  textAfter: (c) => `${c.label} \`${c.v}\` rest`,
  badgePlain: (c) => `\`${c.n}\` ${c.label} \`${c.v}\``,
  badgeRecord: (c) => `\`{${c.n}}\` ${c.label} \`${c.v}\``,
  badgeShaped: (c) => `\`{${c.n}, circle}\` ${c.label} \`${c.v}\``,
  badgeBold: (c) => `**\`${c.n}\`** ${c.label} \`${c.v}\``,
  twoSpans: (c) => `${c.label} \`${c.n}\` \`${c.v}\``,
  valueThenNote: (c) => `${c.label} \`${c.v}\` grew \`{+${c.n}}\``,
  continuation: (c) => `${c.label}\n  \`${c.v}\``,
  // The record sits in the item's SECOND paragraph (the first holds no code): not the row's value, the engine says.
  laterParagraph: (c) => `${c.label}\n\n  \`${c.v}\``,
  lazy: (c) => `${c.label}\n\`${c.v}\``,
  hardBreak: (c) => `${c.label}  \n\`${c.v}\``,
  escaped: (c) => `${c.label} \`\\${c.v}\``,
  doubleTick: (c) => `${c.label} \`\`${c.v}\`\``,
};
const SHAPE_NAMES = Object.keys(SHAPES);

/** Wrappers around the chart's list: where the list sits on the slide. */
const WRAPS = {
  none: (list) => list,
  quoted: (list) => list.split('\n').map((l) => `> ${l}`).join('\n'),
  afterRawUl: (list) => `<ul><li>x</li></ul>\n\n${list}`,
  afterInlineRaw: (list) => `Intro <ul><li>x</li></ul> text\n\n${list}`,
  insideRawOl: (list) => `<ol class="steps">\n\n${list}\n\n</ol>`,
  afterCodeFence: (list) => `\`\`\`\n- fenced \`{99}\`\n\`\`\`\n\n${list}`,
  afterQuote: (list) => `> aside \`{98}\`\n\n${list}`,
  afterOtherList: (list) => `1. other \`{97}\`\n\n${list}`,
  secondList: (list) => `${list}\n\nNext:\n\n1. later \`{96}\``,
  mixedBullets: (list) => `${list}\n* star \`{95}\``,
};
const WRAP_NAMES = Object.keys(WRAPS);

/** A list slide for a chart: rows in a random shape, optionally nested, wrapped, ordered or CRLF. */
function listSlide(chart, r) {
  const st = { n: 0 };
  const next = () => ++st.n;
  const ordered = r() < 0.15;
  const loose = r() < 0.2;
  const nested = r() < 0.4;
  const count = 2 + Math.floor(r() * 3);
  const shape = () => SHAPE_NAMES[Math.floor(r() * SHAPE_NAMES.length)];
  const row = (indent, i, kids) => {
    const n = next();
    const mark = ordered && !indent ? `${i + 1}.` : '-';
    const pad = ' '.repeat(indent + mark.length + 1);
    const text = SHAPES[shape()]({ v: VALUE[chart](n), n, label: LABELS[(i + indent) % LABELS.length] }).split('\n').join(`\n${pad}`);
    const out = [`${' '.repeat(indent)}${mark} ${text}`];
    for (const k of kids) out.push(k(pad.length));
    if (r() < 0.12) out.push(`${pad}> note \`{${next()}}\``); // a description under the row
    if (loose && !indent) out.push('');
    return out.join('\n');
  };
  const rows = [];
  for (let i = 0; i < count; i++) {
    const kids = nested
      ? Array.from({ length: 1 + Math.floor(r() * 2) }, (_, k) => (indent) => row(indent, k, []))
      : [];
    rows.push(row(0, i, kids));
  }
  const wrap = WRAP_NAMES[Math.floor(r() * WRAP_NAMES.length)];
  const list = rows.join('\n');
  let body = WRAPS[wrap](list);
  if (r() < 0.08) body = body.replace(/\n/g, '\r\n');
  return { chart, body, wrap };
}

/** A grid slide (heatmap, matrix-grid): the first table, cells that are the record, with and without a comment. */
function gridSlide(chart, r) {
  const st = { n: 0 };
  const cell = () => {
    const n = ++st.n;
    const v = `{${n}.5}`;
    const forms = [`\`${v}\``, `\`${v}\` <!-- c${n} -->`, `<!-- c${n} --> \`${v}\``, `x \`${v}\``, `\`${v}\` x`, ` \`${v}\` `, `\`${v}\` \`${n}\``,
      // A complete raw table INSIDE an earlier cell is nested in the chart's table, not ahead of it.
      `<table><tr><td>x</td></tr></table> | \`${v}\``];
    return forms[Math.floor(r() * forms.length)];
  };
  // A pipe inside a code span splits the row (markdown-it counts every unescaped pipe), so `x|y` is two cells.
  // A row wider than the header loses its extra cell (markdown-it drops it), so a record there is nobody's.
  const rows = Array.from({ length: 2 + Math.floor(r() * 2) }, (_, i) => (i === 0 && r() < 0.35 ? `| \`x|y\` | ${cell()} |` : i === 1 && r() < 0.4 ? `| ${LABELS[i]} | ${cell()} | ${cell()} | ${cell()} |` : i === 1 && r() < 0.25 ? `| ${LABELS[i]} <table><tr><td>y | ${cell()} | ${cell()} |` : `| ${LABELS[i]} | ${cell()} | ${cell()} |`));
  // A complete raw table in a HEADER cell nests like one in a body cell; an unclosed one in a body row (above) nests the rest of the slide.
  let table = `${r() < 0.2 ? '| <table><tr><td>x</td></tr></table> | A | B |' : '| | A | B |'}\n|---|---|---|\n${rows.join('\n')}`;
  const wraps = [(t) => t, (t) => t.split('\n').map((l) => `> ${l}`).join('\n'), (t) => `<table><tr><td>x</td></tr></table>\n\n${t}`, (t) => `${t}\n\n${t.replace(/\{(\d+)\.5\}/g, '{9$1.5}')}`]; // the second table is a decoy with its own values
  table = wraps[Math.floor(r() * wraps.length)](table);
  return { chart, body: table, wrap: 'table' };
}

// matrix-grid is not in this list: its three state words are not unique, so a log of record TEXTS cannot tell its cells apart.
// It has its own arm in the oracle (matrixCorpus below), which compares which CELLS became state cells.
const GRID_CHARTS = ['heatmap'];

/**
 * matrix-grid slides: the first table's cells are `{done}` / `{partial}` / `{todo}` records, bracket markers
 * (`[x]`), or text, with comments, padding and a second table, a quoted table or a raw table ahead. The state words
 * are not unique, so these are compared by which CELLS became state cells (matrix-grid arm of the oracle), in order.
 */
function matrixSlide(r) {
  const pick = (a) => a[Math.floor(r() * a.length)];
  const state = () => pick(['done', 'partial', 'todo', 'DONE', 'Partial']);
  const cell = () => pick([
    () => `\`{${state()}}\``, () => `\`{${state()}}\` <!-- c -->`, () => `<!-- c --> \`{${state()}}\``,
    () => ` \`{${state()}}\` `, () => `x \`{${state()}}\``, () => `\`{${state()}}\` x`, () => `\`{${state()}}\` \`1\``,
    () => '[x]', () => '[-]', () => '[ ]', () => 'text', () => '`{value=3}`',
    () => `<table><tr><td>x</td></tr></table> | \`{${state()}}\``,
  ])();
  const table = () => `${r() < 0.2 ? '| <table><tr><td>x</td></tr></table> | A | B |' : '| | A | B |'}\n|---|---|---|\n${Array.from({ length: 2 + Math.floor(r() * 2) }, (_, i) => (i === 0 && r() < 0.35 ? `| \`x|y\` | ${cell()} |` : i === 1 && r() < 0.25 ? `| ${LABELS[i]} <table><tr><td>y | ${cell()} | ${cell()} |` : `| ${LABELS[i]} | ${cell()} | ${cell()} |`)).join('\n')}`;
  const first = table();
  const wrap = pick([
    (t) => t, (t) => t.split('\n').map((l) => `> ${l}`).join('\n'), (t) => `<table><tr><td>x</td></tr></table>\n\n${t}`,
    (t) => `Intro <table><tr><td>x</td></tr></table> text\n\n${t}`, (t) => `${t}\n\n${table()}`, (t) => `> aside\n\n${t}`,
    // A raw section the author wrote around the table: the nearest `section` of its cells carries no chart class.
    (t) => `<section>\n\n${t}\n\n</section>`,
  ]);
  return { chart: 'matrix-grid', body: wrap(first) };
}

/** `count` seeded matrix-grid slides. */
function matrixCorpus(count = 60) {
  return Array.from({ length: count }, (_, i) => ({ ...matrixSlide(rng((i + 1) * 104729)), name: `matrix-grid #${i + 1}` }));
}

/** The deck source for a corpus slide. */
const deckOf = (s) => `---\nmarp: true\n---\n\n<!-- _class: ${s.chart} -->\n\n## A\n\n${s.body}\n`;

/** `count` seeded slides per chart. */
function corpus(count = 30) {
  const out = [];
  for (const chart of [...LIST_CHARTS, ...GRID_CHARTS]) {
    for (let seed = 1; seed <= count; seed++) {
      const r = rng(seed * 7919 + chart.length * 31);
      const s = GRID_CHARTS.includes(chart) ? gridSlide(chart, r) : listSlide(chart, r);
      out.push({ ...s, seed, name: `${chart} #${seed} (${s.wrap})` });
    }
  }
  return out;
}

/**
 * The record texts in table cells PAST the header's width: markdown-it drops those cells, so the engine neither claims
 * them nor draws them as pills. An arm that infers "not claimed, so a pill" (Compose's) leaves them out.
 */
function droppedTexts(body) {
  const out = new Set();
  const lines = body.replace(/\r/g, '').split('\n');
  const cells = (line) => {
    const parts = [];
    let from = 0;
    for (let i = 0; i < line.length; i++) if (line[i] === '|' && line[i - 1] !== '\\') { parts.push(line.slice(from, i)); from = i + 1; }
    parts.push(line.slice(from));
    if (/^\s*\|/.test(line)) parts.shift();
    if (/\|\s*$/.test(line)) parts.pop();
    return parts;
  };
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!/^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(lines[i + 1]) || !lines[i].includes('|')) continue;
    const width = cells(lines[i]).length;
    for (let r = i + 2; r < lines.length && lines[r].includes('|'); r++) {
      for (const cell of cells(lines[r]).slice(width)) for (const m of cell.matchAll(/`(\{[^{}`\n]*\})`/g)) out.add(m[1]);
    }
  }
  return out;
}

module.exports = { corpus, matrixCorpus, droppedTexts, deckOf, rng, LIST_CHARTS, GRID_CHARTS, SHAPE_NAMES, WRAP_NAMES };
