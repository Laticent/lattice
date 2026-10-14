// `chart-list-split-quote` (lib/authoring/lint-core.js): a `>` at the left margin between two
// items of a chart's list ends the list, so every row after it drops out of the chart and nothing
// said so. Born from the adversarial trio on #2686 (followups.d/2686-p1); the `>` blockquote is
// the description form for every chart list in the chart authoring model
// (engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §3 decision 5).
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const lintCore = require('../../../lib/authoring/lint-core.js');
const { buildVocab } = require('../../../lib/authoring/lint');
const { loadAll } = require('../../../lib/components');
const engine = require('../../../lib/engine');

const manifests = loadAll(path.join(__dirname, '../../../lib/components'));
const vocab = buildVocab(manifests);
const deck = (cls, body) => `---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n## A\n\n${body}\n`;
const splits = (src) => lintCore.lintTextWith(src, vocab).filter((f) => f.rule === 'chart-list-split-quote');
const html = (src) => { const o = engine.render(src, {}); return typeof o === 'string' ? o : o.html; };

// The red team's repro: a quote at the margin before the last row ends the list, and End, a row
// no edge names, is no longer a node.
const FLOW = deck('flowchart', '- Start\n  - -> Middle\n- Middle\n> Middle waits on review\n- End');

describe('chart-list-split-quote', () => {
  test('a flowchart: the warning names the dropped row, and the fix indents the quote under its item', () => {
    const [f, ...rest] = splits(FLOW);
    assert.equal(rest.length, 0);
    assert.equal(f.severity, 'warning');
    assert.equal(f.classToken, 'flowchart');
    assert.equal(f.line, '> Middle waits on review');
    assert.match(f.message, /`- End`/);
    assert.equal(f.autofixable, true);
    const fixed = lintCore.applyAllFixes(FLOW, vocab);
    assert.match(fixed, /\n {2}> Middle waits on review\n- End/);
    assert.deepEqual(splits(fixed), []);
  });

  test('the render proves it: before the fix End is a stray list below the chart, after it End is a node', () => {
    const before = html(FLOW);
    assert.match(before, /data-shapes="2"/);
    assert.match(before, /<\/blockquote>\s*<ul>\s*<li>End<\/li>/, 'End renders as a stray list below the chart');
    const after = html(lintCore.applyAllFixes(FLOW, vocab));
    assert.match(after, /data-shapes="3"/);
    assert.doesNotMatch(after, /<li>End<\/li>/);
  });

  test('a state chart, and a bar chart: the same mistake, the same fix', () => {
    const state = deck('state-chart', '- Idle\n  - -> Busy\n> Waits for a job\n- Busy');
    assert.equal(splits(state).length, 1);
    assert.deepEqual(splits(lintCore.applyAllFixes(state, vocab)), []);
    const bar = deck('bar', '- EMEA `4.2`\n> Two renewals landed\n- APAC `1.8`');
    const [f] = splits(bar);
    assert.match(f.message, /bar list: `- APAC `1.8`` and every row after it/);
    assert.match(lintCore.applyAllFixes(bar, vocab), /- EMEA `4.2`\n {2}> Two renewals landed\n- APAC/);
  });

  test('the indent follows the item above: a nested row and an ordered row', () => {
    const nested = deck('flowchart', '- Start\n  - -> End\n> note\n- End');
    assert.equal(splits(nested)[0].indent, 4, 'under `  - -> End`, whose text starts at column 4');
    const ordered = deck('funnel', '1. Visitors `1200`\n> note\n2. Signups `480`');
    assert.equal(splits(ordered)[0].indent, 3);
  });

  test('a quote of several lines warns once, with no one-line fix', () => {
    const [f, ...rest] = splits(deck('bar', '- EMEA `4.2`\n> one\n> two\n- APAC `1.8`'));
    assert.equal(rest.length, 0);
    assert.equal(f.autofixable, undefined);
    assert.match(f.fix, /each of the quote's 2 lines/);
  });

  test('no warning where nothing splits', () => {
    for (const [why, src] of [
      ['indented under its item', deck('bar', '- EMEA `4.2`\n  > note\n- APAC `1.8`')],
      ['a quote above the list', deck('bar', '> Source: ERP\n\n- EMEA `4.2`\n- APAC `1.8`')],
      ['a quote after the list, with no list after it', deck('bar', '- EMEA `4.2`\n- APAC `1.8`\n\n> Source: ERP')],
      ['not a chart', '---\nmarp: true\n---\n\n## A\n\n- One\n> note\n- Two\n'],
      ['a table chart', deck('heatmap', '| | M0 |\n|---|--:|\n| Jan | 100 |\n\n> note\n\n- stray')],
    ]) assert.deepEqual(splits(src), [], why);
  });

  test('LIST_CHARTS is every chart whose rows are a list: the chart bucket less its three tables', () => {
    const charts = manifests.filter((m) => m.bucket === 'chart').map((m) => m.name);
    const tables = ['heatmap', 'matrix-grid', 'roadmap'];
    assert.ok(charts.length >= 24, `the chart bucket loads (${charts.length})`);
    assert.deepEqual([...lintCore.LIST_CHARTS].sort(), charts.filter((c) => !tables.includes(c)).sort());
  });
});
