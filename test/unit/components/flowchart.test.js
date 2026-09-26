/**
 * Unit: the flowchart component's server half and the shape of its browser pass.
 *
 * The grammar has its own suite (test/unit/core/flowchart-grammar.test.js) and the
 * router its own (graph-layout.test.js). This one holds what the component adds on top:
 * the figure it emits through the real engine, the escaping of author text, the key
 * span it consumes, and a browser pass that can be serialized at all.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../../../lib/engine');
const { transformSection, payload } = require('../../../lib/components/chart/flowchart/flowchart.transform');
const { browserJs, installFlowchartLayout } = require('../../../lib/components/chart/flowchart/flowchart.layout');
const { parseFlowchart, outlineFromMarkdown } = require('../../../lib/core/flowchart-grammar');

const render = (body, cls = 'flowchart') => String((engine.render(`<!-- _class: ${cls} -->\n\n## A flow.\n\n${body}\n`)).html);
const modelOf = (html) => {
  const m = /data-fc-model="([^"]*)"/.exec(html);
  assert.ok(m, 'the figure carries its model');
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
};

describe('flowchart — the figure through the real engine', () => {
  const html = render('- Alert `:pill` => Triage\n- Triage -done-> Close `:dotted`\n  > Closes itself after a day.\n\n`[{=>, Paging path}]`\n\n*Most alerts close themselves.*');

  test('the chart frame wraps one figure, with the harness and an empty svg', () => {
    assert.match(html, /class="[^"]*\bchart-frame\b/);
    assert.equal((html.match(/class="flowchart-figure"/g) || []).length, 1);
    assert.match(html, /<ol class="fc-nodes">/);
    assert.match(html, /<svg class="flowchart-svg" role="img"[^>]*><title[^>]*>Flowchart<\/title><desc[^>]*>/);
  });

  test('the model payload is the grammar\'s model, minus diagnostics', () => {
    const m = modelOf(html);
    assert.deepEqual(m.shapes.map((s) => s.id), ['alert', 'triage', 'close']);
    assert.equal(m.shapes[0].shape, 'pill');
    assert.deepEqual(m.edges.map((e) => `${e.from}>${e.to}`), ['alert>triage', 'triage>close']);
    assert.equal(m.edges[0].heavy, true);
    assert.deepEqual(m.edges[1].style, { pattern: 'dotted' });
    assert.deepEqual(m.notes, [{ on: 'triage', text: 'Closes itself after a day.' }]);
    assert.equal(m.diagnostics, undefined);
  });

  test('the key span is consumed and drawn as the key; the caption is left to the frame', () => {
    assert.doesNotMatch(html, /\[\{=&gt;, Paging path\}\]/, 'the bracketed span must not print as text');
    assert.match(html, /<ol class="fc-key">.*Paging path/s);
    assert.match(html, /<p class="chart-caption"[^>]*>Most alerts close themselves\.<\/p>/);
  });

  test('the key sits inside the figure, so the caption follows it', () => {
    assert.ok(html.indexOf('fc-key') < html.indexOf('chart-caption'));
  });
});

describe('flowchart — untrusted text never becomes markup', () => {
  test('a name, a label and a note that look like HTML are escaped everywhere', () => {
    const html = render('- `<img>` \\<script> -a<b-> B\n- B\n  > <i>note</i>');
    assert.doesNotMatch(html, /<script>/);
    assert.doesNotMatch(html, /<img>/);
    assert.doesNotMatch(html, /<i>note<\/i>/);
  });

  test('the payload survives a quote and an ampersand in a name', () => {
    const html = render('- Say "hi" \\& wave -> B');
    assert.equal(modelOf(html).shapes[0].name, 'Say "hi" & wave');
  });
});

describe('flowchart — pass-through', () => {
  test('a slide with no list is left alone', () => {
    const inner = '<h2>Title</h2><p>No list here.</p>';
    assert.equal(transformSection(inner, { classTokens: ['flowchart'] }), inner);
  });

  test('`lr` pins the direction, and a portrait deck turns it to `tb`', () => {
    assert.match(render('- A -> B', 'flowchart lr'), /data-fc-dir="lr"/);
    assert.match(render('- A -> B'), /data-fc-dir="auto"/);
    const inner = '<h2>T</h2><ul><li>A -&gt; B</li></ul>';
    assert.match(transformSection(inner, { classTokens: ['flowchart', 'lr'], orientation: 'portrait' }), /data-fc-dir="tb"/);
  });
});

describe('flowchart — payload', () => {
  test('carries every styled fact the painter reads', () => {
    const o = outlineFromMarkdown('- Box `:c2:diamond:fill-c4:border-c1:text-c3`\n- Done `done`\n- Box -> Done `:dashed:c5:open:loose`');
    const p = payload(parseFlowchart(o.items, {}));
    assert.deepEqual(p.shapes[0], { id: 'box', name: 'Box', parent: null, shape: 'diamond', slot: 2, fill: 4, border: 1, text: 3 });
    assert.equal(p.shapes[1].status, 'done');
    assert.deepEqual(p.edges[0].style, { slot: 5, pattern: 'dashed', head: 'open', loose: true });
  });
});

describe('flowchart — the browser pass', () => {
  test('serializes into a self-invoking script that parses and imports nothing', () => {
    const js = browserJs();
    assert.doesNotMatch(js, /\brequire\(/);
    assert.doesNotThrow(() => new Function(js));
  });

  test('with no figures in the document it does nothing and throws nothing', () => {
    const doc = { querySelectorAll: () => [], readyState: 'complete' };
    assert.doesNotThrow(() => installFlowchartLayout(doc, () => ({ layout: () => null })));
  });
});
