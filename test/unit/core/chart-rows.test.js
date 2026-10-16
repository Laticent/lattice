// The one chart row reader (lib/core/chart-rows.js): each chart's row schema in its manifest's
// `segno` block drives the detail list, the markless rows, record reading and the old-form spans,
// for the transforms' detail kernel, the narrator, lint and Compose (the chart authoring model,
// engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §2, §10 phase 2).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const rows = require('../../../lib/core/chart-rows.js');
const lintCore = require('../../../lib/authoring/lint-core.js');
const { buildVocab } = require('../../../lib/authoring/lint');
const { loadAll } = require('../../../lib/components');
const engine = require('../../../lib/engine');

const manifests = loadAll(path.join(__dirname, '../../../lib/components'));
const vocab = buildVocab(manifests);
const deck = (cls, body) => `---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n## A\n\n${body}\n`;
const recordFindings = (src) => lintCore.lintTextWith(src, vocab).filter((f) => f.rule === 'chart-row-record-unread');
const { narrateChart } = require('../../../lib/core/chart-narration.js');
const { CHART_STATUS } = require('../../../lib/core/chart-status.js');
const { componentReads } = require('../../../lib/core/segno-slots.js');
const marks = (h) => (h.match(/<(?!template)[a-z]+\b[^>]*\bdata-mark="\d+"/g) || []).length;
const html = (src) => engine.render(src, {}).html;

// The 16 charts the model covers (model note §2, census note §2).
const IN_SCOPE = ['bar', 'bullet', 'funnel', 'heatmap', 'line', 'map', 'matrix-grid', 'piechart', 'progress',
  'quadrant', 'radar', 'scatter', 'slope', 'stacked-bar', 'waterfall', 'word-cloud'];

describe('the row schemas', () => {
  test('every chart in the model declares one, and no chart outside it does', () => {
    assert.deepEqual([...rows.ROW_CHARTS], [...IN_SCOPE].sort());
  });

  test('the schema lives in the manifest: the generated catalog is the manifests\' `segno` blocks', () => {
    for (const c of IN_SCOPE) {
      const m = manifests.find((x) => x.name === c);
      const s = rows.rowSchema(c);
      assert.deepEqual(m.segno[s.slot], s.spec, c);
    }
  });

  test('a grid chart\'s schema is its cell, every other chart\'s is its row', () => {
    for (const c of IN_SCOPE) {
      const grid = c === 'heatmap' || c === 'matrix-grid';
      assert.equal(rows.rowSchema(c).slot, grid ? 'cell' : 'row', c);
      assert.equal([].concat(rows.rowSchema(c).rows.shape).includes('grid'), grid, c);
    }
  });

  test('`rows.quotes` agrees with the transforms, both ways, on the list charts', () => {
    // A list chart reads a row's `>` exactly when its kernel lifts it (mark-detail's
    // takeRowDescription, directly or through splitDetail; bar, line, slope and stacked-bar through
    // the shared Cartesian kernel). Progress shows its nested note on the slide face and lifts
    // nothing; the two tables have no list row to quote under.
    const read = (f) => fs.readFileSync(path.join(__dirname, '../../../lib/components/chart', f), 'utf8');
    const cartesian = /splitDetail|takeRowDescription/.test(read('_chart-family/cartesian.js'));
    assert.ok(cartesian, 'the Cartesian kernel lifts descriptions');
    for (const c of IN_SCOPE.filter((x) => x !== 'heatmap' && x !== 'matrix-grid')) {
      const src = read(`${c}/${c}.transform.js`);
      const lifts = /splitDetail|takeRowDescription/.test(src) || /cart\.parseSeries|parseSeries\(/.test(src) && /_chart-family\/cartesian/.test(src);
      assert.equal(rows.DETAIL_CHARTS.includes(c), lifts, c);
    }
    for (const c of rows.DETAIL_CHARTS) {
      const src = read(`${c}/${c}.transform.js`);
      assert.ok(/detailPayload/.test(src) || /_chart-family\/cartesian/.test(src), `${c} emits its detail through the shared payload`);
    }
    for (const c of ['progress', 'heatmap', 'matrix-grid']) assert.ok(!rows.DETAIL_CHARTS.includes(c), c);
  });

  test('progress\'s status is the shared status vocabulary, as on flowchart and state-chart', () => {
    const status = rows.rowSchema('progress').spec.positional.find((p) => p.name === 'status');
    assert.deepEqual(status.type.values, [...CHART_STATUS]);
    assert.equal(rows.readRecord('progress', '{68%, bogus}').ok, false);
  });

  test('a schema the chart does not draw yet does not silence the pill lint', () => {
    assert.equal(componentReads('map', '{EMEA region}'), false);
    assert.equal(componentReads('bar', '{4.2}'), false);
    // scatter and quadrant draw their record today.
    assert.equal(componentReads('scatter', '{1, 2}'), true);
  });

  test('markless rows: a radar series, a quadrant group, and radar quadrant\'s group too', () => {
    assert.deepEqual([...rows.marklessDepths('radar', ['radar'])], [1]);
    assert.deepEqual([...rows.marklessDepths('radar', ['radar', 'quadrant'])], [1, 2]);
    assert.deepEqual([...rows.marklessDepths('quadrant', ['quadrant', 'bubble'])], [1]);
    assert.deepEqual([...rows.marklessDepths('bar', ['bar'])], []);
  });
});

describe('a row record', () => {
  test('reads through the chart\'s schema, ISO numbers included', () => {
    const r = rows.readRecord('bullet', '{4.2M, target=5.0M, band=[60%, 80%], floor=90%}');
    assert.equal(r.ok, true);
    assert.equal(r.value.value.value, 4.2e6);
    assert.equal(r.value.target.value, 5e6);
    assert.deepEqual(r.value.band.map((b) => b.value), [60, 80]);
    assert.equal(rows.readRecord('bar', '{1 234}').value.value.value, 1234);
    assert.equal(rows.readRecord('waterfall', '{+2.1M, total}').value.kind, 'total');
    assert.equal(rows.readRecord('progress', '{68%, at-risk}').value.status, 'at-risk');
    // Quadrant's trail end (`to=`) is left out until the chart reads it: readPoint does not.
    assert.equal(rows.readRecord('quadrant', '{2, 82, to={3, 5}}').ok, false);
  });

  test('a pill is not a row record, and a chart outside the model has none', () => {
    assert.equal(rows.readRecord('bar', '{NEW, tag}').ok, false);
    assert.equal(rows.readRecord('bar', '4.2'), null);
    assert.equal(rows.readRecord('gantt', '{1, 2}'), null);
  });

  test('legacySpans: the spans the chart reads today, as the author spelled them', () => {
    assert.deepEqual(rows.legacySpans('bullet', '{4.2M, target=5.0M}'), ['4.2M', '5.0M']);
    assert.deepEqual(rows.legacySpans('bullet', '{4.2M}'), ['4.2M']);
    assert.deepEqual(rows.legacySpans('waterfall', '{+2.1M, total}'), ['+2.1M', 'total']);
    assert.deepEqual(rows.legacySpans('map', '{"say \\"hi\\""}'), ['say "hi"'], 'a quoted string is unescaped');
    assert.deepEqual(rows.legacySpans('bar', '{1 234}'), ['1 234']);
    assert.deepEqual(rows.legacySpans('map', '{EU}'), ['EU']);
  });

  test('legacySpans is null where there is no one-span old form', () => {
    assert.equal(rows.legacySpans('bullet', '{4.2M, band=[60%, 80%]}'), null, 'a band was a named nested row');
    assert.equal(rows.legacySpans('scatter', '{1, 2}'), null, 'scatter\'s old form already is the record');
    assert.equal(rows.legacySpans('bar', '{NEW, tag}'), null, 'not a row record');
    assert.equal(rows.legacySpans('map', '{"tick`s"}'), null, 'a backtick has no single-backtick span');
  });
});

describe('readChartRows', () => {
  test('lifts each description out of the slide and hands it back by row', () => {
    const src = '## A\n\n- A `1`\n\n  > hi **bold**\n  > - li\n- B `2`\n  - Sub `3`\n    > sub desc\n';
    const r = rows.readChartRows(src, 'bar');
    assert.equal(r.markdown, '## A\n\n- A `1`\n- B `2`\n  - Sub `3`\n');
    assert.deepEqual(r.rows.map((x) => [x.line, x.depth]), [[2, 1], [3, 1], [4, 2]]);
    assert.deepEqual(r.descriptions.map((d) => [d.anchor, d.at, d.blocks]), [
      [2, 3, [{ kind: 'para', text: 'hi **bold**' }, { kind: 'item', text: 'li' }]],
      [4, 5, [{ kind: 'para', text: 'sub desc' }]],
    ]);
  });

  test('a quote at the margin is not a description, and stays where it is', () => {
    const src = '- A `1`\n> margin\n- B `2`';
    assert.equal(rows.readChartRows(src, 'bar').markdown, src);
    assert.deepEqual(rows.readChartRows(src, 'bar').descriptions, []);
  });

  test('a description under a markless row says so', () => {
    const r = rows.readChartRows('- Meridian\n  > series\n  - X `9`\n    > axis', 'radar', ['radar']);
    assert.deepEqual(r.descriptions.map((d) => [d.depth, d.markless]), [[1, true], [2, false]]);
  });
});

describe('lint: chart-row-record-unread', () => {
  test('a row written as one record warns, and the fix names the spans the chart reads today', () => {
    const src = deck('bullet', '- Uptime `{4.2M, target=5.0M}`\n- Cost `3` `5`');
    const [f, ...rest] = recordFindings(src);
    assert.equal(rest.length, 0);
    assert.equal(f.severity, 'warning');
    assert.equal(f.line, '- Uptime `{4.2M, target=5.0M}`');
    assert.match(f.message, /does not draw yet/);
    assert.match(f.fix, /`4\.2M` `5\.0M`/);
    // No machine fix: phase 4's codemod writes the record, so "Fix all" must not undo it.
    assert.equal(f.autofixable, undefined);
    assert.equal(lintCore.applyAllFixes(src, vocab), src);
  });

  test('the render proves it: the record row loses its bar, the spans the fix names draw it', () => {
    assert.equal(marks(html(deck('bar', '- EMEA `{4.2}`\n- APAC `1.8`'))), 1, 'today the record row draws no bar');
    assert.equal(marks(html(deck('bar', '- EMEA `4.2`\n- APAC `1.8`'))), 2);
  });

  test('data rows only: a series point and a radar axis warn, a detail bullet does not', () => {
    assert.equal(recordFindings(deck('stacked-bar', '- FY24\n  - Licenses `{19}`\n  - Services `9`')).length, 1);
    assert.equal(recordFindings(deck('radar', '- Meridian\n  - Speed `{9}`\n  - Cost `7`\n  - Fit `8`')).length, 1);
    assert.deepEqual(recordFindings(deck('bar', '- North `40`\n  - Driven by renewals `{12}`')), [], 'detail under a row with a value');
  });

  test('spans before the record: no span suggestion, because they shift the old reading', () => {
    const [f] = recordFindings(deck('bullet', '- E `1` `{2}`'));
    assert.match(f.fix, /as the row's only spans/);
    assert.doesNotMatch(f.fix, /`1` `2`/);
  });

  test('no one-span form: the fix says so', () => {
    const [f] = recordFindings(deck('bullet', '- Uptime `{4.2M, target=5.0M, band=[60%, 80%]}`'));
    assert.match(f.fix, /no one-span form yet/);
  });

  test('silent where the row is not a record the chart reads', () => {
    for (const [why, src] of [
      ['the old form', deck('bar', '- EMEA `4.2`\n- APAC `1.8`')],
      ['a pill in a label', deck('bar', '- EMEA `{NEW, tag}` `4.2`')],
      ['a pill that is not this chart\'s record', deck('bar', '- EMEA `{NEW, tag}`')],
      ['a span that is not last on its row', deck('bar', '- EMEA `{4.2}` and more')],
      ['inside a description', deck('bar', '- EMEA `4.2`\n  > see `{4.2}`')],
      ['scatter already reads a record', deck('scatter', '- A `{1, 2}`\n- B `{3, 4}`')],
      ['a chart outside the model', deck('gantt', '- Build `{Q1..Q2}`')],
    ]) assert.deepEqual(recordFindings(src), [], why);
  });
});

describe('every description is said', () => {
  test('on every detail chart, a description under a data row reaches the narration', () => {
    const rowsOf = {
      bar: ['`12`', '`8`'], line: ['`12`', '`8`'], piechart: ['`60%`', '`40%`'], funnel: ['`12`', '`8`'],
      waterfall: ['`12`', '`-3`'], map: ['`12`', '`8`'], scatter: ['`{1, 2}`', '`{3, 4}`'],
      bullet: ['`4` `5`', '`3` `5`'], 'word-cloud': ['`5`', '`3`'],
    };
    for (const [chart, [a, b]] of Object.entries(rowsOf)) {
      const names = chart === 'map' ? ['India', 'Kenya'] : ['Alpha', 'Beta'];
      const said = narrateChart(deck(chart, `- ${names[0]} ${a}\n  > zebra crossing\n- ${names[1]} ${b}`));
      assert.match(said, /zebra crossing/, chart);
    }
    const series = '- FY24\n  - Licenses `19`\n    > zebra crossing\n  - Services `9`\n- FY25\n  - Licenses `20`\n  - Services `15`';
    for (const chart of ['stacked-bar', 'slope']) assert.match(narrateChart(deck(chart, series)), /zebra crossing/, chart);
    assert.match(narrateChart(deck('radar', '- M\n  - X `9`\n    > zebra crossing\n  - Y `7`\n  - Z `8`')), /zebra crossing/);
    assert.match(narrateChart(deck('quadrant', '- Quick Wins\n  - Alpha `{2, 8}`\n    > zebra crossing')), /zebra crossing/);
    assert.deepEqual([...rows.DETAIL_CHARTS].sort(), [...Object.keys(rowsOf), 'stacked-bar', 'slope', 'radar', 'quadrant'].sort(), 'every detail chart is covered here');
  });
});
