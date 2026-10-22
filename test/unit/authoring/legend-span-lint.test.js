/**
 * Unit: `lint:deck` rule `legend-span` (lib/authoring/lint-core.js `findLegendSpans`) — the legend
 * plugin's `@callout{…}` record, judged by the reader the engine uses (lib/core/legend.js).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const { findLegendSpans, lintTextWith } = require('../../../lib/authoring/lint-core.js');

const heatmap = (span) => `---\nmarp: true\n---\n\n<!-- _class: heatmap -->\n\n## R\n\n| | A |\n|---|--:|\n| r | 1 |\n\n\`${span}\`\n`;

test('a clean anchored legend on a heatmap has nothing to say', () => {
  assert.deepEqual(findLegendSpans(heatmap('@callout{{Peak, for="r · A"}}')), []);
});

test('a legend on a slide no component reads it on is told it renders as code', () => {
  const f = findLegendSpans('---\nmarp: true\n---\n\n# Hi\n\n`@callout{{Peak, for=1}}`\n');
  assert.equal(f.length, 1);
  assert.equal(f[0].rule, 'legend-span');
  assert.match(f[0].message, /`@callout\{…\}` renders as code here: no component on this slide reads one yet \(today: heatmap, /);
});

test('the reader\'s own diagnostics come through: no target, and the `{1, lg}` shape', () => {
  const messages = findLegendSpans(heatmap('@legend{{1, lg}, anchored}')).map((x) => x.message);
  assert.ok(messages.some((m) => /reads as the label "1" with the style word `lg`/.test(m)));
  assert.ok(messages.some((m) => /nothing to point at/.test(m)));
});

test('a span that does not read is a warning that names why', () => {
  const [f] = findLegendSpans(heatmap('@callout{x}'));
  assert.equal(f.severity, 'warning');
  assert.match(f.message, /renders as code: `x` is not a legend entry/);
});

test('`@callout` and `@legend` are not reported as unknown inline kinds', () => {
  for (const span of ['@callout{{Peak, for=0}}', '@legend{[{Poor, c1}], key}']) {
    const all = lintTextWith(heatmap(span), { names: new Set(['heatmap']), modifiers: new Set() });
    assert.equal(all.filter((x) => x.rule === 'unknown-inline-kind').length, 0, span);
  }
});

test('a key legend on a heatmap is told it is not drawn', () => {
  const [f] = findLegendSpans(heatmap('@legend{[{Poor, c1}], key}'));
  assert.match(f.message, /`key` legend is not drawn on this slide/);
});

test('a for= that names no cell of the slide\'s table is told so, with the names it could use', () => {
  const [f] = findLegendSpans(heatmap('@callout{{Lost, for="Mar · M9"}}'));
  assert.match(f.message, /"Lost" is not drawn: `for=Mar · M9` names no cell\. The rows are r; the columns are A\./);
  assert.deepEqual(findLegendSpans(heatmap('@callout{{Here, for=0}}')), []);
});

test('the component is any class word on the slide, not only the first', () => {
  const src = heatmap('@callout{{Peak, for=0}}').replace('_class: heatmap', '_class: compact heatmap');
  assert.deepEqual(findLegendSpans(src), []);
});

test('a callout the author switched off gets one info note, and callout-on on the slide wins', () => {
  const off = heatmap('@callout{{Peak, for=0}}').replace('marp: true', 'marp: true\ncallout: off');
  const [f] = findLegendSpans(off);
  assert.equal(f.rule, 'legend-off');
  assert.equal(f.severity, 'info');
  assert.deepEqual(findLegendSpans(off.replace('_class: heatmap', '_class: heatmap callout-on')), []);
  assert.equal(findLegendSpans(heatmap('@callout{{Peak, for=0}}').replace('_class: heatmap', '_class: heatmap callout-off'))[0].rule, 'legend-off');
});

test('the deck switch reads as the render reads it, and the off note only where a component reads legends', () => {
  const withFm = (fm, cls = 'heatmap') => heatmap('@callout{{Peak, for=0}}').replace('marp: true', `marp: true\n${fm}`).replace('_class: heatmap', `_class: ${cls}`);
  assert.equal(findLegendSpans(withFm('callout: OFF'))[0].rule, 'legend-off');
  assert.equal(findLegendSpans(withFm('callout: [off]'))[0].rule, 'legend-off');
  // A nested key is not the deck's switch.
  assert.deepEqual(findLegendSpans(withFm('pptx:\n  callout: off')), []);
  // No reader on the slide: the span shows as code whatever the switch says, so the warning stands.
  assert.equal(findLegendSpans(withFm('callout: off', 'lead'))[0].rule, 'legend-span');
  assert.equal(findLegendSpans(withFm('', 'lead callout-off'))[0].rule, 'legend-span');
});

test('row= and col= are the taught form: a clean pair says nothing, a half or a double target is told', () => {
  assert.deepEqual(findLegendSpans(heatmap('@callout{{Peak, row=r, col=A}}')), []);
  const half = findLegendSpans(heatmap('@callout{{Peak, row=r}}'));
  assert.equal(half.length, 1);
  assert.match(half[0].message, /names only its row: add `col=` too/);
  assert.match(findLegendSpans(heatmap('@callout{{Peak, row=r, col=A, for=0}}'))[0].message, /names its cell twice/);
  const miss = findLegendSpans(heatmap('@callout{{Peak, row=q, col=A}}'));
  assert.match(miss[0].message, /`row=q, col=A` names no cell\. The rows are r; the columns are A\./);
});

test('past six callouts on one slide, each extra one is told it is not drawn, across spans', () => {
  const six = Array.from({ length: 6 }, (_, i) => `{C${i + 1}, for=0}`).join(', ');
  assert.deepEqual(findLegendSpans(heatmap(`@callout{[${six}]}`)), []);
  const deck = heatmap(`@callout{[${six}]}`).replace(/\n$/, '\n\n`@callout{{C7, for=0}}`\n');
  const f = findLegendSpans(deck);
  assert.equal(f.length, 1);
  assert.equal(f[0].severity, 'warning');
  assert.match(f[0].message, /"C7" is not drawn: a chart draws at most 6 callouts, one marker shape each, and this is callout 7\./);
});

test('a legend inside a sentence is not counted toward the six: the chart does not draw it', () => {
  const six = Array.from({ length: 6 }, (_, i) => `{C${i + 1}, for=0}`).join(', ');
  const deck = heatmap(`@callout{[${six}]}`).replace('\n\n`@legend', '\n\nSee `@callout{{Inline, for=0}}` here.\n\n`@legend');
  assert.equal(findLegendSpans(deck).filter((f) => /at most 6 callouts/.test(f.message)).length, 0);
});

test('a @legend span that pins a cell is the pre-split callout spelling: one info note, and it still draws', () => {
  const f = findLegendSpans(heatmap('@legend{{Peak, row=r, col=A}}'));
  assert.deepEqual(f.map((x) => [x.rule, x.severity]), [['callout-spelling', 'info']]);
  assert.match(f[0].fix, /@callout/);
});

test('a layout word in a @callout span is reported and the callout still reads anchored', () => {
  const messages = findLegendSpans(heatmap('@callout{{Peak, row=r, col=A}, key}')).map((x) => x.message);
  assert.ok(messages.some((m) => /`key` is not a callout layout/.test(m)));
  assert.ok(!messages.some((m) => /legend is not drawn/.test(m)));
});


test('a @callout span with no layout word gets no layout note, even when its entry names no mark', () => {
  // The reader defaults an untargeted record to `key`; only a word the author wrote is reported.
  for (const span of ['@callout{{Peak}}', '@callout{{Peak, row=r, col=A}}', '@callout{{Peak, row=r, col=A}, anchored}', '@callout{{Peak, row=r, col=A}, layout=anchored}']) {
    const messages = findLegendSpans(heatmap(span)).map((x) => x.message);
    assert.ok(!messages.some((m) => /is not a callout layout/.test(m)), `${span}: ${messages.join(' | ')}`);
  }
  const named = findLegendSpans(heatmap('@callout{{Peak, row=r, col=A}, layout=along-path}')).map((x) => x.message);
  assert.ok(named.some((m) => /`along-path` is not a callout layout/.test(m)));
});

// The charts that name their marks by label (callout-layer.js): the list's items are the names.
const listChart = (cls, list, span) => `---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n## R\n\n${list}\n\n\`${span}\`\n`;
const BAR_LIST = '- Q1 `1`\n- Q2 `2`\n- Q3 `3`';

test('a callout on a bar that names a category the list has says nothing', () => {
  assert.deepEqual(findLegendSpans(listChart('bar', BAR_LIST, '@callout{{Peak, for=Q2}}')), []);
});

test('a callout on a bar that names no category is told so, with the names it could have used', () => {
  const [f] = findLegendSpans(listChart('bar', BAR_LIST, '@callout{{Peak, for=Q9}}'));
  assert.equal(f.rule, 'legend-span');
  assert.match(f.message, /"Peak" is not drawn: `for=Q9` names no mark\. The marks are Q1, Q2, Q3\./);
});

test('an index or Category/Series form is accepted', () => {
  assert.deepEqual(findLegendSpans(listChart('bar', BAR_LIST, '@callout{{A, for=1}}')), []);
  assert.deepEqual(findLegendSpans(listChart('bar', BAR_LIST, '@callout{{A, for="Q2/North"}}')), []);
});

test('where the marks are nested, a name at any depth is a mark', () => {
  const quad = '- Quick Wins\n  - Slack bot `{3, 72}`\n- Defer\n  - Old UI `{2, 28}`';
  assert.deepEqual(findLegendSpans(listChart('quadrant', quad, '@callout{{Ship, for=Slack bot}}')), []);
});

test('a chart named by a pill (ep-curve) is not checked', () => {
  const ep = '- OEP\n  - `{10, $120M}`\n  - `{100, $410M}`';
  assert.deepEqual(findLegendSpans(listChart('ep-curve', ep, '@callout{{Plan, for=1-in-100}}')), []);
});

test('a `key` legend on a bar says the chart draws anchored labels', () => {
  const fs = findLegendSpans(listChart('bar', BAR_LIST, '@legend{[{A, c1}, {B, c2}], key}'));
  assert.ok(fs.some((f) => /a bar chart draws anchored labels, each with `for=` naming a mark/.test(f.message)));
});

test('a seventh callout past the cap is named, for a chart that names its marks', () => {
  const many = Array.from({ length: 7 }, (_, i) => `{N${i}, for=Q1}`).join(', ');
  const fs = findLegendSpans(listChart('bar', BAR_LIST, `@callout{[${many}]}`));
  assert.equal(fs.filter((f) => /is not drawn: a chart draws at most 6 callouts/.test(f.message)).length, 1);
});

test('a mark name with its own `<` or `>` still matches what the list says', () => {
  const list = '- Age < 30 `120`\n- Age 30+ `180`\n- Cost > plan `90`';
  assert.deepEqual(findLegendSpans(listChart('bar', list, '@callout{{Peak, for="Age < 30"}}')), []);
  assert.deepEqual(findLegendSpans(listChart('bar', list, '@callout{{Over, for="Cost > plan"}}')), []);
});

test('a tag in a mark name is dropped, as it is in the drawn label', () => {
  assert.deepEqual(findLegendSpans(listChart('bar', '- <b>Q1</b> `1`\n- Q2 `2`', '@callout{{Peak, for=Q1}}')), []);
});
