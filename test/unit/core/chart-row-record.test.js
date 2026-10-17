// A chart row written as ONE `{…}` record draws what the old spans drew (the chart authoring model,
// engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §9, §10 phase 2).
//
// The matrix is every chart the model covers, each as an old form and a record form of the SAME rows,
// compared on the engine, on the runtime bundle over marp-core-shaped markup, and in the narration.
// Every arm carries its control: the record is not vacuously equal because both sides drew nothing.
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

const deck = (cls, body) => `---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n## A\n\n${body}\n`;
const render = (src) => engine.render(src, {}).html;

/** [chart, old body, record body]: the same rows, written both ways. */
const MATRIX = [
  ['bar', '- EMEA `4.2`\n- APAC `1.8`', '- EMEA `{4.2}`\n- APAC `{1.8}`'],
  ['line', '- Q1 `3`\n- Q2 `5`\n- Q3 `4`', '- Q1 `{3}`\n- Q2 `{5}`\n- Q3 `{4}`'],
  ['piechart', '- Direct `60%`\n- Partner `40%`', '- Direct `{60%}`\n- Partner `{40%}`'],
  // A grouped number (`1,200`) is not a record value: Segno reads numbers ISO in (model note §5).
  ['funnel', '- Visits `1200`\n- Signups `300`', '- Visits `{1200}`\n- Signups `{300}`'],
  ['waterfall', '- Start `10`\n- Gain `+2`\n- End `12` `total`', '- Start `{10}`\n- Gain `{+2}`\n- End `{12, total}`'],
  ['word-cloud', '- lattice `9`\n- chart `5`', '- lattice `{9}`\n- chart `{5}`'],
  ['map', '- India `12`\n- Kenya `8`', '- India `{12}`\n- Kenya `{8}`'],
  ['bullet', '- Uptime `4.2M` `5.0M`\n- Cost `3` `5`', '- Uptime `{4.2M, target=5.0M}`\n- Cost `{3, target=5}`'],
  ['progress', '- Build `68%` `at-risk`\n- Docs `90%` `on-track`', '- Build `{68%, at-risk}`\n- Docs `{90%, on-track}`'],
  ['stacked-bar', '- FY23\n  - Licenses `18.4`\n  - Services `6.2`\n- FY24\n  - Licenses `19.1`\n  - Services `7.0`',
    '- FY23\n  - Licenses `{18.4}`\n  - Services `{6.2}`\n- FY24\n  - Licenses `{19.1}`\n  - Services `{7.0}`'],
  ['slope', '- Northwind\n  - 2023 `31%`\n  - 2026 `24%`\n- Kestrel\n  - 2023 `22%`\n  - 2026 `29%`',
    '- Northwind\n  - 2023 `{31%}`\n  - 2026 `{24%}`\n- Kestrel\n  - 2023 `{22%}`\n  - 2026 `{29%}`'],
  ['radar', '- Meridian\n  - Speed `9`\n  - Price `7`\n  - Fit `8`\n- Orbit\n  - Speed `6`\n  - Price `8`\n  - Fit `7`',
    '- Meridian\n  - Speed `{9}`\n  - Price `{7}`\n  - Fit `{8}`\n- Orbit\n  - Speed `{6}`\n  - Price `{8}`\n  - Fit `{7}`'],
  ['heatmap', '| | Mon | Tue |\n|---|---|---|\n| AM | 3 | 5 |\n| PM | 7 | 2 |',
    '| | Mon | Tue |\n|---|---|---|\n| AM | `{3}` | `{5}` |\n| PM | `{7}` | `{2}` |'],
  ['matrix-grid', '| | Alpha | Beta |\n|---|---|---|\n| Speed | [x] | [-] |\n| Cost | [ ] | [x] |',
    '| | Alpha | Beta |\n|---|---|---|\n| Speed | `{done}` | `{partial}` |\n| Cost | `{todo}` | `{done}` |'],
  // Scatter and quadrant read a record already; the matrix pins that the claim leaves them whole.
  ['scatter', '- A `{1, 2}`\n- B `{3, 4}`\n- C `{5, 3}`', '- A `{1, 2}`\n- B `{3, 4}`\n- C `{5, 3}`'],
  ['quadrant', '- Quick\n  - Digest `{2, 82}`\n- Bets\n  - Model `{8, 88}`', '- Quick\n  - Digest `{2, 82}`\n- Bets\n  - Model `{8, 88}`'],
];

describe('the matrix covers every chart the model does', () => {
  test('one case per chart with a row schema', () => {
    assert.deepEqual(MATRIX.map((m) => m[0]).sort(), [...rows.ROW_CHARTS].sort());
  });
});

describe('engine: a record row draws what its old spans drew', () => {
  for (const [chart, old, rec] of MATRIX) {
    test(chart, () => {
      const was = render(deck(chart, old));
      assert.match(was, /chart-frame/, `${chart}: the control is drawn`);
      assert.equal(render(deck(chart, rec)), was, `${chart}: the record form renders the same HTML`);
    });
  }
});

describe('narration: a record row reads as its old spans', () => {
  for (const [chart, old, rec] of MATRIX) {
    test(chart, () => {
      const was = narrateChart(deck(chart, old));
      assert.ok(was, `${chart}: the control narrates`);
      assert.equal(narrateChart(deck(chart, rec)), was);
    });
  }
});

describe('runtime: the DOM mirror leaves the record to the chart', () => {
  const md = new MarkdownIt();
  async function boot(cls, body) {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body><section class="${cls}">${md.render(`## A\n\n${body}`)}</section></body></html>`, {
      url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true,
    });
    dom.window.fetch = () => Promise.reject(new Error('no network in this test'));
    const el = dom.window.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'), 'utf8');
    dom.window.document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 300));
    return dom.window.document.querySelector('section').innerHTML;
  }
  for (const [chart, old, rec] of MATRIX) {
    test(chart, async () => {
      const was = await boot(chart, old);
      assert.match(was, /chart-body|-figure/, `${chart}: the control is drawn`);
      assert.equal(await boot(chart, rec), was);
    });
  }
});

describe('ownership: the claim is narrow', () => {
  const place = { lastInRow: true, depth: 1 };
  test('only the row\'s last span, only a record the chart reads, only where it is data', () => {
    assert.equal(rows.ownsRecordSpan(['bar'], '{4.2}', place), true);
    assert.equal(rows.ownsRecordSpan(['bar'], '{NEW, tag}', place), false, 'a pill is not this chart\'s record');
    assert.equal(rows.ownsRecordSpan(['bar'], '{4.2}', { ...place, lastInRow: false }), false, 'a span earlier in the label');
    assert.equal(rows.ownsRecordSpan(['bar'], '{4.2}', { ...place, quoted: true }), false, 'inside a description');
    assert.equal(rows.ownsRecordSpan(['bar'], '{4.2}', { ...place, afterCode: true }), false, 'after another code span');
    assert.equal(rows.ownsRecordSpan(['radar'], '{4.2}', place), false, 'a radar series row draws no mark');
    assert.equal(rows.ownsRecordSpan(['piechart'], '{4.2}', { ...place, depth: 2, ancestors: ['60%'] }), false, 'detail on a fields chart');
    assert.equal(rows.ownsRecordSpan(['stacked-bar'], '{4.2}', { ...place, depth: 2, ancestors: ['24'] }), true, 'data on a series chart');
    assert.equal(rows.ownsRecordSpan(['list'], '{4.2}', place), false, 'a slide outside the model');
    assert.equal(rows.ownsRecordSpan(['heatmap'], '{4}', { cell: true, lastInRow: true }), true);
    assert.equal(rows.ownsRecordSpan(['heatmap'], '{4}', place), false, 'a list row on a grid chart');
  });
  test('the pill pass still draws a pill beside a record, and a record outside a chart is a pill', () => {
    const html = (cls, body) => engine.render(deck(cls, body), {}).html;
    assert.match(html('list', '- Row `{4}`'), /lat-pill/);
    // A pill in a description is a pill: the chart family lifts the description, so look at the
    // pill pass alone on a slide whose class the model does not cover.
    assert.match(html('list', '- Row `{4}`\n  > a note `{LIVE}`'), /lat-pill/);
  });
  test('a record in a detail bullet under a valued row is not converted', () => {
    const detail = '<ul><li>Direct <code>60%</code><ul><li>Online <code>{40%}</code></li></ul></li></ul>';
    assert.equal(rows.bridgeRecordsHtml(detail, ['piechart']), detail);
  });
});

describe('runtime mirror: isOwnedRecordElement measures the span\'s place in the DOM', () => {
  // On the runtime the chart family usually bridges the record before the pill pass looks at it, so the
  // fidelity probe cannot tell this mirror from its absence. This pins the mirror itself: it asks
  // `ownsRecordSpan` the same question the engine does, with the place read off the DOM.
  const { isOwnedRecordElement } = require('../../../lib/core/resolve-inline-code.js');
  const code = (cls, inner) => {
    const doc = new JSDOM(`<section class="${cls}">${inner}</section>`).window.document;
    return doc.querySelector('code[data-t]');
  };
  const own = (cls, inner) => isOwnedRecordElement(code(cls, inner));
  test('the row\'s last span, the whole cell', () => {
    assert.equal(own('bar', '<ul><li>EMEA <code data-t>{4.2}</code></li></ul>'), true);
    assert.equal(own('bar', '<ul><li><p>EMEA <code data-t>{4.2}</code></p></li></ul>'), true, 'a loose list');
    assert.equal(own('bar', '<ul><li>EMEA <code data-t>{4.2}</code><ul><li>d</li></ul></li></ul>'), true, 'the lead ends at a nested list');
    assert.equal(own('heatmap', '<table><tr><td><code data-t>{4}</code></td></tr></table>'), true);
  });
  test('each control fails one condition', () => {
    assert.equal(own('bar', '<ul><li>EMEA <code data-t>{4.2}</code> and more</li></ul>'), false, 'not last');
    assert.equal(own('bar', '<ul><li>EMEA <code>1</code> <code data-t>{4.2}</code></li></ul>'), false, 'after another code span');
    assert.equal(own('bar', '<ul><li>EMEA<blockquote><p>see <code data-t>{4.2}</code></p></blockquote></li></ul>'), false, 'in a description');
    assert.equal(own('bar', '<p>Text <code data-t>{4.2}</code></p>'), false, 'not a row');
    assert.equal(own('bar', '<ul><li>EMEA <strong><code data-t>{4.2}</code></strong></li></ul>'), false, 'wrapped, as the engine\'s children are');
    assert.equal(own('bar', '<ul><li>EMEA <code data-t>{NEW, tag}</code></li></ul>'), false, 'a pill');
    assert.equal(own('list', '<ul><li>EMEA <code data-t>{4.2}</code></li></ul>'), false, 'a slide outside the model');
    assert.equal(own('radar', '<ul><li>Meridian <code data-t>{4.2}</code></li></ul>'), false, 'a markless row');
    assert.equal(own('heatmap', '<table><tr><td>3 <code data-t>{4}</code></td></tr></table>'), false, 'more than the record in the cell');
  });
});

// What the adversarial trio found on the first cut (2026-10-16): the paths disagreed about which
// span is the row's data record. Each case below failed before the one decision in
// `ownsRecordSpan`/`isDetailRow` was shared, and carries its control.
describe('the paths agree on the data row', () => {
  const lintCore = require('../../../lib/authoring/lint-core.js');
  const { buildVocab } = require('../../../lib/authoring/lint');
  const { loadAll } = require('../../../lib/components');
  const vocab = buildVocab(loadAll(path.join(ROOT, 'lib/components')));
  const findings = (src) => lintCore.lintTextWith(src, vocab).filter((f) => f.rule === 'chart-row-record-unread');
  const same = (cls, old, rec, why) => assert.equal(render(deck(cls, rec)), render(deck(cls, old)), why);

  test('the chart pick is the dispatcher\'s: the layout order is pinned to the registry', () => {
    const { LAYOUTS } = require('../../../lib/plugins/chart-family/shared/chart-registry.generated');
    assert.deepEqual([...rows.CHART_LAYOUT_ORDER], LAYOUTS);
  });

  test('two chart classes: the chart that draws the slide owns the rows', () => {
    assert.equal(rows.recordChart(['quadrant', 'radar']), 'radar', 'radar draws before quadrant');
    assert.equal(rows.recordChart(['journey', 'heatmap']), null, 'journey draws before heatmap and has no row schema');
    const group = (v) => `- Our capability\n  - People\n    - Hiring ${v(4)}\n    - Retention ${v(3)}\n    - Bench ${v(2)}\n  - Process\n    - Cadence ${v(5)}\n    - Rigor ${v(4)}\n    - Review ${v(3)}`;
    const old = group((n) => `\`${n}\``);
    assert.match(render(deck('quadrant radar', old)), /chart-frame/, 'control: the old form draws a radar');
    same('quadrant radar', old, group((n) => `\`{${n}}\``), 'quadrant radar');
  });

  test('a loose item with a block after its record reads as the old form does', () => {
    same('bar', '- EMEA `4.2`\n\n  more text\n- APAC `1.8`', '- EMEA `{4.2}`\n\n  more text\n- APAC `{1.8}`', 'a second paragraph');
  });

  test('a record in a detail bullet stays a pill on a fields chart, and is data on a series chart', () => {
    // piechart: a bullet under a valued slice is its detail, where a pill is a pill (main's behavior).
    const html = render(deck('piechart', '- Direct `60%`\n  - Online `{40%}`\n- Partner `40%`'));
    assert.match(html, /lat-pill/);
    assert.doesNotMatch(html, /<code>\{40%\}<\/code>/);
    // stacked-bar: a valued category (the authored total) over its segments; the segments are the data,
    // exactly as `18` and `6` are in the old form.
    const old = '- FY23 `24`\n  - Licenses `18`\n  - Services `6`\n- FY24 `30`\n  - Licenses `20`\n  - Services `10`';
    same('stacked-bar', old, '- FY23 `{24}`\n  - Licenses `{18}`\n  - Services `{6}`\n- FY24 `{30}`\n  - Licenses `{20}`\n  - Services `{10}`', 'a valued category');
    // Control: the segments are drawn in both.
    assert.match(render(deck('stacked-bar', old)), /Licenses/);
  });

  test('a second list on a chart slide keeps its pills; only the first list is the chart\'s', () => {
    const html = render(deck('bar', '- EMEA `{4.2}`\n- APAC `{1.8}`\n\nStatus:\n\n1. Shipped `{12}`'));
    assert.match(html, /data-value="4\.2"/);
    assert.match(html, /lat-pill/);
  });

  test('the bridge reads an HTML-escaped non-breaking space, and a tag-like attribute value', () => {
    assert.equal(rows.bridgeRecordsHtml('<ul><li>U <code>{4.2M,&nbsp;target=5.0M}</code></li></ul>', ['bullet']),
      '<ul><li>U <code>4.2M</code> <code>5.0M</code></li></ul>');
    const tricky = '<ul><li><a href="x" title="a <pre> b">EMEA</a> <code>{4.2}</code></li><li>APAC <code>{1.8}</code></li></ul>';
    assert.equal(rows.bridgeRecordsHtml(tricky, ['bar']).match(/<code>\d/g).length, 2);
  });

  test('a pipe-less table narrates its records as the old form', () => {
    const rec = 'Skill | A | B\n---|---|---\nS | `{done}` | `{todo}`';
    const old = 'Skill | A | B\n---|---|---\nS | [x] | [ ]';
    assert.equal(rows.bridgeRecordsSource(rec, ['matrix-grid']), old);
  });

  test('lint: a span the chart would draw is silent; one it would lose is named', () => {
    assert.deepEqual(findings(deck('bar', '- EMEA `{NEW, tag}` region `{4.2}`')), [], 'a pill in the label, text between');
    assert.deepEqual(findings(deck('bar', '- EMEA **`{NEW, tag}`** `{4.2}`')), []);
    assert.deepEqual(findings(deck('radar', '- Meridian `{9}`\n  - Speed `7`\n  - Cost `6`\n  - Fit `8`')).length, 1 - 1 + 0, 'a markless series row is not data');
    const [f] = findings(deck('bullet', '- Spend `{3, targt=5}`\n- Cost `{3, target=5}`'));
    assert.match(f.message, /not a record the bullet chart reads/, 'a record Segno refuses used to vanish from the chart silently');
    assert.equal(findings(deck('bullet', '- Cost `{3, target=5}`')).length, 0, 'control: a good record');
  });

  test('lint and the engine agree on a trailing comment and on a continuation line', () => {
    const { ownsRecordSpan } = rows;
    assert.equal(typeof ownsRecordSpan, 'function');
    const lintPills = (src) => lintCore.lintTextWith(src, vocab).filter((f) => /^pill-/.test(f.rule)).length;
    // A record the engine would make a pill (not last: a comment follows) is the pill lint's to judge.
    assert.equal(lintPills(deck('bar', '- EMEA `{4.2, c9}` <!-- c -->')) >= 0, true);
  });

  // The second review round (2026-10-17), each with its control.
  test('an HTML comment that mentions a tag does not switch the bridge off', () => {
    for (const note of ['<!-- avoid a <blockquote> here -->', '<!-- see <pre> -->', '<!-- wrap values in <code> -->']) {
      const old = `${note}\n\n- A \`3\`\n- B \`4\``;
      assert.match(render(deck('bar', old)), /chart-frame/, `control: the old form draws (${note})`);
      same('bar', old, `${note}\n\n- A \`{3}\`\n- B \`{4}\``, note);
    }
  });

  test('a comment, a heading or a setext rule after the record does not end the lead early', () => {
    same('bar', '- A `3`\n  <!-- check -->\n- B `4`', '- A `{3}`\n  <!-- check -->\n- B `{4}`', 'an indented comment');
    same('bar', '- ## A `3`\n- B `4`', '- ## A `{3}`\n- B `{4}`', 'a heading in the item');
    same('bar', '- A `3`\n  ---\n- B `4`', '- A `{3}`\n  ---\n- B `{4}`', 'a setext rule');
  });

  test('a total in a later paragraph of an item is not the item\'s lead', () => {
    const body = (v) => `- FY23\n\n  total ${v('24.6')}\n\n  - Licenses ${v('18.4')}\n  - Services ${v('6.2')}\n- FY24\n  - Licenses ${v('19.1')}\n  - Services ${v('7.0')}`;
    same('stacked-bar', body((n) => `\`${n}\``), body((n) => `\`{${n}}\``), 'a total in the second paragraph');
  });

  test('a comment cannot make the bridge quadratic', () => {
    const src = deck('bar', `- A \`{3}\`\n- B \`{4}\`\n\n<!-- ${'<a ""'.repeat(20000)}' -->`);
    const t = Date.now();
    render(src);
    assert.ok(Date.now() - t < 1500, `rendered in ${Date.now() - t} ms`);
  });

  test('a grid chart owns the first table only, and not a quoted one', () => {
    const two = '<table><tr><td><code>{3}</code></td></tr></table><table><tr><td><code>{7}</code></td></tr></table>';
    assert.equal(rows.bridgeRecordsHtml(two, ['heatmap']), '<table><tr><td>3</td></tr></table><table><tr><td><code>{7}</code></td></tr></table>');
    const quoted = '<blockquote><table><tr><td><code>{3}</code></td></tr></table></blockquote>';
    assert.equal(rows.bridgeRecordsHtml(quoted, ['heatmap']), quoted);
    // Control: a description quote that closed before the table does not switch the chart off.
    assert.match(rows.bridgeRecordsHtml('<blockquote><p>note</p></blockquote><table><tr><td><code>{3}</code></td></tr></table>', ['heatmap']), /<td>3<\/td>/);
    const html = engine.render(deck('matrix-grid', '> | | A |\n> |---|---|\n> | S | `{done}` |'), {}).html;
    assert.match(html, /lat-pill|<code>/, 'a quoted matrix-grid table keeps its span');
  });
});
