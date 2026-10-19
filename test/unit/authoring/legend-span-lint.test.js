/**
 * Unit: `lint:deck` rule `legend-span` (lib/authoring/lint-core.js `findLegendSpans`) — the legend
 * plugin's `@legend{…}` record, judged by the reader the engine uses (lib/core/legend.js).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { findLegendSpans, lintTextWith } = require('../../../lib/authoring/lint-core.js');

const heatmap = (span) => `---\nmarp: true\n---\n\n<!-- _class: heatmap -->\n\n## R\n\n| | A |\n|---|--:|\n| r | 1 |\n\n\`${span}\`\n`;

test('a clean anchored legend on a heatmap has nothing to say', () => {
  assert.deepEqual(findLegendSpans(heatmap('@legend{{Peak, for="r · A"}}')), []);
});

test('a legend on a slide no component reads it on is told it renders as code', () => {
  const f = findLegendSpans('---\nmarp: true\n---\n\n# Hi\n\n`@legend{{Peak, for=1}}`\n');
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'legend-span');
  assert.match(f[0].message, /no component on this slide reads a legend yet \(today: heatmap\)/);
});

test('the reader\'s own diagnostics come through: no target, and the `{1, lg}` shape', () => {
  const messages = findLegendSpans(heatmap('@legend{{1, lg}, anchored}')).map((x) => x.message);
  assert.ok(messages.some((m) => /reads as the label "1" with the style word `lg`/.test(m)));
  assert.ok(messages.some((m) => /nothing to anchor to/.test(m)));
});

test('a span that does not read is a warning that names why', () => {
  const [f] = findLegendSpans(heatmap('@legend{x}'));
  assert.equal(f.severity, 'warning');
  assert.match(f.message, /renders as code: `x` is not a legend entry/);
});

test('`@legend` is not reported as an unknown inline kind', () => {
  const all = lintTextWith(heatmap('@legend{{Peak, for=0}}'), { names: new Set(['heatmap']), modifiers: new Set() });
  assert.equal(all.filter((x) => x.rule === 'unknown-inline-kind').length, 0);
});

test('a key legend on a heatmap is told it is not drawn', () => {
  const [f] = findLegendSpans(heatmap('@legend{[{Poor, c1}], key}'));
  assert.match(f.message, /`key` legend is not drawn on this slide/);
});

test('a for= that names no cell of the slide\'s table is told so, with the names it could use', () => {
  const [f] = findLegendSpans(heatmap('@legend{{Lost, for="Mar · M9"}}'));
  assert.match(f.message, /"Lost" is not drawn: `for=Mar · M9` names no cell\. The rows are r; the columns are A\./);
  assert.deepEqual(findLegendSpans(heatmap('@legend{{Here, for=0}}')), []);
});

test('the component is any class word on the slide, not only the first', () => {
  const src = heatmap('@legend{{Peak, for=0}}').replace('_class: heatmap', '_class: compact heatmap');
  assert.deepEqual(findLegendSpans(src), []);
});

test('a callout the author switched off gets one info note, and legend-on on the slide wins', () => {
  const off = heatmap('@legend{{Peak, for=0}}').replace('marp: true', 'marp: true\nlegend: off');
  const [f] = findLegendSpans(off);
  assert.equal(f.rule, 'legend-off');
  assert.equal(f.severity, 'info');
  assert.deepEqual(findLegendSpans(off.replace('_class: heatmap', '_class: heatmap legend-on')), []);
  assert.equal(findLegendSpans(heatmap('@legend{{Peak, for=0}}').replace('_class: heatmap', '_class: heatmap legend-off'))[0].rule, 'legend-off');
});
