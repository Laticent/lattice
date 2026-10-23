// A NATIVE chart (`rows.native`: bullet, progress) reads a row's `{…}` record through the row schema in its transform AND its
// narrator (lib/core/chart-rows.js `takeRecord` / `recordFields`), so a field no old span spells is drawn and said: bullet's
// `band=` and `floor=`, progress's `note=`. The old form of those fields is a nested row, so the record is compared with that.
// Every arm carries its control: the field is not vacuously equal because both sides dropped it.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const MarkdownIt = require('markdown-it');

const ROOT = path.join(__dirname, '..', '..', '..');
const rows = require('../../../lib/core/chart-rows.js');
const engine = require('../../../lib/engine');
const { narrateChart } = require('../../../lib/core/chart-narration.js');
const lintCore = require('../../../lib/authoring/lint-core.js');
const { buildVocab } = require('../../../lib/authoring/lint');
const { loadAll } = require('../../../lib/components');

const vocab = buildVocab(loadAll(path.join(ROOT, 'lib', 'components')));
const slide = (cls, body) => `<!-- _class: ${cls} -->\n\n## KPIs\n\n${body}\n`;
const deck = (cls, body) => `---\nmarp: true\n---\n\n${slide(cls, body)}`;
const render = (src) => engine.render(src, {}).html;
// Ids differ per document position only; the markup is otherwise byte for byte.
const norm = (h) => h.replace(/\s+/g, ' ').replace(/ id="[^"]*"/g, '').replace(/(aria-labelledby|aria-describedby)="[^"]*"/g, '');

const CASES = {
  bullet: {
    old: '- Uptime `99.4%` `99.9%`\n  - Floor `99.0%`\n  - Band `99.5%`\n- Latency `180` `200`',
    rec: '- Uptime `{99.4%, target=99.9%, floor=99.0%, band=[99.5%]}`\n- Latency `{180, target=200}`',
    bare: '- Uptime `{99.4%, target=99.9%}`\n- Latency `{180, target=200}`',
  },
  progress: {
    old: '- Build `68%` `at-risk`\n  - Q4 slip, again\n- Docs `90%` `on-track`',
    rec: '- Build `{68%, at-risk, note="Q4 slip, again"}`\n- Docs `{90%, on-track}`',
    bare: '- Build `{68%, at-risk}`\n- Docs `{90%, on-track}`',
  },
  // The other fourteen charts (phase 2, slice 4): the old spans and the record draw and say the same, and a changed value does not.
  bar: {
    old: '- EMEA `4.2`\n- APAC `3.1`\n- AMER `5.6`',
    rec: '- EMEA `{4.2}`\n- APAC `{3.1}`\n- AMER `{5.6}`',
    bare: '- EMEA `{4.2}`\n- APAC `{3.1}`\n- AMER `{5.9}`',
  },
  line: {
    old: '- Q1 `4.2`\n- Q2 `5.1`\n- Q3 `6.3`\n- Q4 `7.4`',
    rec: '- Q1 `{4.2}`\n- Q2 `{5.1}`\n- Q3 `{6.3}`\n- Q4 `{7.4}`',
    bare: '- Q1 `{4.2}`\n- Q2 `{5.1}`\n- Q3 `{6.3}`\n- Q4 `{9.4}`',
  },
  slope: {
    old: '- EMEA\n  - 2024 `40%`\n  - 2025 `55%`\n- APAC\n  - 2024 `30%`\n  - 2025 `35%`',
    rec: '- EMEA\n  - 2024 `{40%}`\n  - 2025 `{55%}`\n- APAC\n  - 2024 `{30%}`\n  - 2025 `{35%}`',
    bare: '- EMEA\n  - 2024 `{40%}`\n  - 2025 `{55%}`\n- APAC\n  - 2024 `{30%}`\n  - 2025 `{60%}`',
  },
  'stacked-bar': {
    old: '- FY24\n  - Product `3`\n  - Services `2`\n- FY25\n  - Product `4`\n  - Services `3`',
    rec: '- FY24\n  - Product `{3}`\n  - Services `{2}`\n- FY25\n  - Product `{4}`\n  - Services `{3}`',
    bare: '- FY24\n  - Product `{3}`\n  - Services `{2}`\n- FY25\n  - Product `{4}`\n  - Services `{7}`',
  },
  piechart: {
    old: '- Enterprise `52%`\n- Mid-market `31%`\n- SMB `17%`',
    rec: '- Enterprise `{52%}`\n- Mid-market `{31%}`\n- SMB `{17%}`',
    bare: '- Enterprise `{52%}`\n- Mid-market `{31%}`\n- SMB `{40%}`',
  },
  funnel: {
    old: '- Visits `1200`\n- Signups `340`\n- Paid `85`',
    rec: '- Visits `{1200}`\n- Signups `{340}`\n- Paid `{85}`',
    bare: '- Visits `{1200}`\n- Signups `{340}`\n- Paid `{185}`',
  },
  map: {
    old: '- France `42`\n- Germany `31`\n- Spain `18`',
    rec: '- France `{42}`\n- Germany `{31}`\n- Spain `{18}`',
    bare: '- France `{42}`\n- Germany `{31}`\n- Spain `{88}`',
  },
  'word-cloud': {
    old: '- growth `9`\n- margin `6`\n- churn `4`\n- cash `2`',
    rec: '- growth `{9}`\n- margin `{6}`\n- churn `{4}`\n- cash `{2}`',
    bare: '- growth `{9}`\n- margin `{6}`\n- churn `{4}`\n- cash `{8}`',
  },
  waterfall: {
    old: '- Start `10` `total`\n- Upsell `+4`\n- Churn `-3`\n- End `11` `total`',
    rec: '- Start `{10, total}`\n- Upsell `{+4}`\n- Churn `{-3}`\n- End `{11, total}`',
    bare: '- Start `{10, total}`\n- Upsell `{+4}`\n- Churn `{-8}`\n- End `{11, total}`',
  },
  // Scatter and quadrant write a point as a record already: the old form IS the record, so the first arm is the same source twice.
  scatter: {
    old: '- Atlas `{4.2, 62}`\n- Borealis `{2.1, 38, size=14}`\n- Cirrus `{3.3, 51}`',
    rec: '- Atlas `{4.2, 62}`\n- Borealis `{2.1, 38, size=14}`\n- Cirrus `{3.3, 51}`',
    bare: '- Atlas `{4.2, 62}`\n- Borealis `{2.1, 38, size=14}`\n- Cirrus `{3.3, 91}`',
  },
  quadrant: {
    old: '- Now\n  - Alpha `{3, 70}`\n  - Beta `{6, 40}`\n- Later\n  - Gamma `{8, 85}`',
    rec: '- Now\n  - Alpha `{3, 70}`\n  - Beta `{6, 40}`\n- Later\n  - Gamma `{8, 85}`',
    bare: '- Now\n  - Alpha `{3, 70}`\n  - Beta `{6, 40}`\n- Later\n  - Gamma `{8, 15}`',
  },
  radar: {
    old: '- Us\n  - Speed `4`\n  - Cost `3`\n  - Reach `5`\n  - Trust `2`',
    rec: '- Us\n  - Speed `{4}`\n  - Cost `{3}`\n  - Reach `{5}`\n  - Trust `{2}`',
    bare: '- Us\n  - Speed `{4}`\n  - Cost `{3}`\n  - Reach `{5}`\n  - Trust `{4}`',
  },
  heatmap: {
    old: '| | Jan | Feb |\n|---|---|---|\n| EMEA | 10 | 20 |\n| APAC | 30 | 40 |',
    rec: '| | Jan | Feb |\n|---|---|---|\n| EMEA | `{10}` | `{20}` |\n| APAC | `{30}` | `{40}` |',
    bare: '| | Jan | Feb |\n|---|---|---|\n| EMEA | `{10}` | `{20}` |\n| APAC | `{30}` | `{90}` |',
  },
  'matrix-grid': {
    old: '| | Reach | Depth |\n|---|---|---|\n| Seed | [x] | [-] |\n| Grow | [ ] | [x] |',
    rec: '| | Reach | Depth |\n|---|---|---|\n| Seed | `{done}` | `{partial}` |\n| Grow | `{todo}` | `{done}` |',
    bare: '| | Reach | Depth |\n|---|---|---|\n| Seed | `{done}` | `{partial}` |\n| Grow | `{todo}` | `{todo}` |',
  },
};

describe('the native charts are the ones the manifests say', () => {
  test('every chart with a row schema declares rows.native (PRIVATE_ROW_READER_BUDGET is 0)', () => {
    assert.deepEqual([...rows.NATIVE_CHARTS].sort(), [...rows.ROW_CHARTS].sort());
    assert.equal(rows.ROW_CHARTS.length, 16);
  });
});

describe('recordFields: what a record holds, as typed', () => {
  test('bullet keeps the author\'s spelling and a list field is an array', () => {
    assert.deepEqual(rows.recordFields('bullet', '{4.2M, target=5.0M, band=[3M, 4M], floor=1M}'),
      { value: '4.2M', target: '5.0M', band: ['3M', '4M'], floor: '1M' });
  });
  test('progress: a vocabulary word is the status, a quoted note keeps its comma', () => {
    assert.deepEqual(rows.recordFields('progress', '{68%, AT-RISK, note="a, b"}'), { value: '68%', status: 'AT-RISK', note: 'a, b' });
  });
  test('a span that is not a record that reads gives null', () => {
    assert.equal(rows.recordFields('bullet', '{nope}'), null);
    assert.equal(rows.recordFields('bar', '{4.2'), null);
  });
});

for (const [chart, c] of Object.entries(CASES)) {
  describe(`${chart}: the transform draws every field of a record`, () => {
    const was = render(deck(chart, c.old));
    test('a record draws what the old nested rows drew (HTML)', () => {
      assert.match(was, /chart-frame/);
      assert.equal(norm(render(deck(chart, c.rec))), norm(was));
    });
    test('control: dropping the field changes the picture', () => {
      assert.notEqual(norm(render(deck(chart, c.bare))), norm(was));
    });
    test('no claim stamp survives', () => {
      assert.doesNotMatch(render(deck(chart, c.rec)), /data-lat-record/);
    });
  });

  describe(`${chart}: the narrator says every field of a record`, () => {
    test('the voice equals the old form\'s', () => {
      const said = narrateChart(slide(chart, c.old));
      assert.ok(said && said.length > 40);
      assert.equal(narrateChart(slide(chart, c.rec)), said);
    });
    test('control: dropping the field changes the voice', () => {
      assert.notEqual(narrateChart(slide(chart, c.bare)), narrateChart(slide(chart, c.old)));
    });
  });
}

describe('the picture and the voice agree on a record they both read', () => {
  test('progress: the note is drawn and spoken', () => {
    assert.match(render(deck('progress', CASES.progress.rec)), /<div class="progress-note">Q4 slip, again<\/div>/);
    assert.match(narrateChart(slide('progress', CASES.progress.rec)), /Q4 slip, again\./);
  });
  test('bullet: the floor moves the scale in both', () => {
    assert.match(render(deck('bullet', CASES.bullet.rec)), /on a scale from 99%/);
    assert.match(narrateChart(slide('bullet', CASES.bullet.rec)), /on a scale starting at ninety-nine percent/);
  });
  test('a record and a nested keyword row: the keyword row wins, as it always overrode the row\'s own pills', () => {
    const mixed = '- Uptime `{99.4%, target=99.9%, floor=99.0%}`\n  - Floor `98.0%`\n- Latency `{180, target=200}`';
    assert.match(render(deck('bullet', mixed)), /on a scale from 98%/);
    assert.match(narrateChart(slide('bullet', mixed)), /starting at ninety-eight percent/);
  });
});

describe('shapes where the record is not the lead\'s trailing element read as the old spans do', () => {
  test('a progress row with a `>` quote under it (progress takes no quote) draws as the old spans draw it', () => {
    const old = '- EMEA `61%` `at-risk`\n  > note 0\n- APAC `18%` `at-risk`';
    const rec = '- EMEA `{61%, at-risk}`\n  > note 0\n- APAC `{18%, at-risk}`';
    assert.equal(norm(render(deck('progress', rec))), norm(render(deck('progress', old))));
  });
  test('a record on a continuation line reads as the old spans do', () => {
    const old = '- APAC\n  `9` `3.3`\n- AMER `3.4` `3.3`';
    const rec = '- APAC\n  `{9, target=3.3}`\n- AMER `{3.4, target=3.3}`';
    assert.equal(norm(render(deck('bullet', rec))), norm(render(deck('bullet', old))));
    assert.equal(narrateChart(slide('bullet', rec)), narrateChart(slide('bullet', old)));
  });
});

describe('lint: the fields are drawn now, so there is nothing to warn about', () => {
  const unread = (src) => lintCore.lintTextWith(src, vocab).filter((f) => f.rule === 'chart-row-record-unread');
  test('band, floor and note are silent; a record after another span still warns', () => {
    assert.deepEqual(unread(deck('bullet', CASES.bullet.rec)), []);
    assert.deepEqual(unread(deck('progress', CASES.progress.rec)), []);
    assert.equal(unread(deck('bullet', '- E `{NEW, tag}` `{2}`')).length, 1);
  });
});

describe('runtime: the browser draws a record\'s extra fields as the engine does', () => {
  const md = new MarkdownIt();
  async function boot(cls, body) {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body><section class="${cls}">${md.render(`## KPIs\n\n${body}`)}</section></body></html>`, {
      url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true,
    });
    dom.window.fetch = () => Promise.reject(new Error('no network in this test'));
    const el = dom.window.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'), 'utf8');
    dom.window.document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 300));
    return dom.window.document.querySelector('section').innerHTML;
  }
  for (const [chart, c] of Object.entries(CASES)) {
    test(chart, async () => {
      const was = await boot(chart, c.old);
      assert.match(was, /chart-body|-figure|progress-bars/, `${chart}: the control is drawn`);
      const rec = await boot(chart, c.rec);
      assert.equal(rec, was);
      assert.doesNotMatch(rec, /data-lat-record/);
    });
  }
});

describe('lint and the chart agree on where a native record is read (inversion finding, 2026-10-23)', () => {
  const unread = (src) => lintCore.lintTextWith(src, vocab).filter((f) => f.rule === 'chart-row-record-unread');
  test('a progress note record with a `>` quote after it is not read, so lint warns (the quote is not a description on progress)', () => {
    const src = deck('progress', '- EMEA `{61%, at-risk, note="slip"}`\n  > note 0\n- APAC `{18%, at-risk}`');
    const [f, ...rest] = unread(src);
    assert.equal(rest.length, 0);
    assert.match(f.message, /followed by other content/);
    assert.match(render(src), /\{61%, at-risk, note=/, 'control: the chart really does show the braces');
  });
  test('a bullet band record with a second paragraph is warned; a `>` quote is lifted off the row, so it is read and silent', () => {
    assert.equal(unread(deck('bullet', '- U `{99%, band=[98%]}`\n\n  second paragraph\n- A `{1}`')).length, 1);
    const quoted = deck('bullet', '- U `{99%, target=99.9%, band=[98%]}`\n  > a description\n- A `{1, target=2}`');
    assert.deepEqual(unread(quoted), []);
    assert.match(render(quoted), /data-value="99%"/);
  });
  test('a nested list after the record is the usual shape and silent', () => {
    assert.deepEqual(unread(deck('progress', '- EMEA `{61%, at-risk, note="slip"}`\n  - nested\n- A `{1%}`')), []);
  });
});

describe('review round (2026-10-23): shapes the native readers must leave as the old readers did', () => {
  test('heatmap: a record in the row-label or the `{>}` column is settled, never shown as raw braces', () => {
    const label = render(deck('heatmap', '| | Jan | Feb |\n|---|---|---|\n| `{10}` | 1 | 2 |\n| APAC | 3 | 4 |'));
    assert.match(label, /<th scope="row">10<\/th>/);
    assert.doesNotMatch(label, /\{10\}/);
    const desc = render(deck('heatmap', '| | Jan | Feb | `{>}` |\n|---|---|---|---|\n| EMEA | 1 | 2 | `{10}` |\n| APAC | 3 | 4 | note |'));
    assert.match(desc, /Row EMEA: 10\./);
  });
  test('quadrant: a record in a loose list item is the item\'s trailing span only when nothing follows it, as before', () => {
    const loose = '- Now\n\n  - Alpha `{3, 70}`\n\n  - Beta `{6, 40}`\n\n- Later\n\n  - Gamma `{8, 85}`';
    assert.match(render(deck('quadrant', loose)), /Alpha \{3, 70\} at x 0, y 0/);
  });
  test('narration: a callout line between two lists does not make the second list part of the chart', () => {
    const said = narrateChart(slide('line', '- Q1 `{4}`\n- Q2 `{5}`\n\n`@callout{{Big, for=Q1}}`\n\n- Q3 `{6}`'));
    assert.match(said, /from four to five/);
    assert.doesNotMatch(said, /Q3, six/);
  });
  test('waterfall: an item that binds to no field (`Total` for `total`) is not read, so the record stays as the old reader left it', () => {
    const src = '- Start `{10, total}`\n- Mid `{20, Total}`\n- End `{30, total}`';
    assert.match(narrateChart(slide('waterfall', src)), /Mid, twenty, Total/);
    assert.equal(rows.recordFields('waterfall', '{20, Total}'), null);
  });
  test('matrix-grid: a claimed cell the decoder left is read through the schema and shows the marker it spells', () => {
    const kernel = require('../../../lib/components/chart/matrix-grid/matrix-grid.transform.js');
    const table = '<table><thead><tr><th></th><th>A</th></tr></thead><tbody><tr><td>r</td><td> <code data-lat-record="">{done}</code> </td><td><code>x</code> <code data-lat-record="">{done}</code></td></tr></tbody></table>';
    const out = kernel.buildMatrixGridSection(`<h2>T</h2>${table}`, { cls: 'matrix-grid' }).html;
    assert.match(out, /<td> \[x\] <\/td>/);
    assert.doesNotMatch(out, /data-lat-record/);
  });
});
