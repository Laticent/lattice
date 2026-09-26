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
    assert.doesNotMatch(html, /<script\b/i);
    assert.doesNotMatch(html, /<img\b/i);
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

describe('flowchart — a forged model cannot inject markup (HARD RULE #22)', () => {
  // `data-fc-model` survives the slide sanitizer (DOMPurify keeps data-*), so a deck can
  // write a figure by hand. The painter must treat every field as hostile. This runs the
  // REAL pass against a jsdom document, with dagre installed as the page would have it.
  const { JSDOM } = require('jsdom');
  require('../../../lib/core/dagre-layout.js');
  const evil = '"/><image href="data:," onerror="top.__pwned=1"/><g data-q="';
  const forged = {
    shapes: [
      { id: 'a', name: `A ${evil}`, shape: `x${evil}`, status: `fail${evil}`, slot: `1${evil}`, fill: 99, text: '2' },
      { id: `b${evil}`, name: 'B', shape: 'box' },
    ],
    groups: [{ id: 'g', name: `G${evil}`, slot: `3${evil}` }],
    edges: [{ from: 'a', to: `b${evil}`, dir: `out${evil}`, label: `L${evil}`, style: { pattern: `dotted${evil}`, slot: `4${evil}`, head: `dot${evil}` } }],
    notes: [{ on: 'a', text: `N${evil}` }],
  };
  const attr = JSON.stringify(forged).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  const dom = new JSDOM(`<!doctype html><section class="flowchart"><div class="flowchart-figure" data-fc-model="${attr}">` +
    '<div class="fc-canvas"><div class="flowchart-scale"><div class="fc-harness"><ol class="fc-nodes"></ol></div>' +
    '<svg class="flowchart-svg"><title>Flowchart</title></svg></div></div></div></section>', { runScripts: 'outside-only' });
  const { document } = dom.window;
  // THE SERIALIZED PASS, not the imported function: this is the script the emulator ships,
  // so running it here also proves it closes over nothing (a free variable throws).
  dom.window.__latticeDagre = globalThis.__latticeDagre;
  dom.window.eval(browserJs());
  const svg = document.querySelector('svg.flowchart-svg');

  test('the serialized pass runs and paints (or the assertions below prove nothing)', () => {
    assert.ok(svg.querySelector('.fc-node-group'), svg.innerHTML.slice(0, 200));
  });

  test('no element outside the painter\'s own vocabulary reaches the SVG', () => {
    const allowed = new Set(['title', 'desc', 'g', 'rect', 'path', 'ellipse', 'circle', 'text', 'tspan']);
    for (const el of svg.querySelectorAll('*')) assert.ok(allowed.has(el.tagName.toLowerCase()), el.outerHTML.slice(0, 120));
    assert.equal(svg.querySelector('[onerror]'), null);
    assert.equal(svg.querySelector('[data-q]'), null);
  });

  test('structural fields outside their closed sets are dropped, not passed on', () => {
    const shape = svg.querySelector('.fc-shape');
    assert.equal(shape.getAttribute('data-shape'), 'box');
    assert.equal(shape.getAttribute('data-s'), null);
    assert.equal(shape.getAttribute('data-slot'), null);
    assert.equal(shape.getAttribute('data-fill'), null, 'out of range');
    assert.equal(shape.getAttribute('data-text'), null, 'a string is not a slot');
  });
});


describe('flowchart — live layout: a redraw in the typing preview runs in a worker', () => {
  // The REAL serialized pass in jsdom, with a stand-in Worker that runs the real kernel a
  // tick later, the way a worker answers: what the figure shows meanwhile, which request
  // gets painted, and that the first draw never waits.
  const { JSDOM } = require('jsdom');
  require('../../../lib/core/dagre-layout.js');
  const { graphLayoutKernel } = require('../../../lib/components/chart/_chart-family/graph-layout.js');
  const figHtml = (names) => {
    const model = { shapes: names.map((n, i) => ({ id: `s${i}`, name: n, shape: 'box' })), groups: [], edges: names.slice(1).map((_n, i) => ({ from: `s${i}`, to: `s${i + 1}`, dir: 'out' })) };
    const attr = JSON.stringify(model).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    // An empty harness, as above: jsdom has no Range rects to measure text with.
    return `<div class="flowchart-figure" data-fc-model="${attr}"><div class="fc-canvas"><div class="flowchart-scale"><div class="fc-harness"><ol class="fc-nodes"></ol></div>` +
      '<svg class="flowchart-svg"><title>Flowchart</title></svg></div></div></div>';
  };
  const setup = (liveAttr) => {
    const dom = new JSDOM(`<!doctype html><html${liveAttr ? ' data-lattice-live-layout' : ''}><head><script src="https://example.test/lattice-dagre.js"></script></head>` +
      `<body><section class="flowchart">${figHtml(['Alpha', 'Beta', 'Gamma'])}</section></body></html>`, { runScripts: 'outside-only' });
    const w = dom.window;
    w.__latticeDagre = globalThis.__latticeDagre;
    const K = graphLayoutKernel();
    const log = { posts: [], sources: [] };
    w.URL.createObjectURL = () => 'blob:test';
    w.URL.revokeObjectURL = () => {};
    const RealBlob = w.Blob;
    w.Blob = class extends RealBlob { constructor(parts, o) { super(parts, o); log.sources.push(parts.join('')); } };
    w.Worker = class {
      postMessage(d) {
        log.posts.push(d);
        setTimeout(() => this.onmessage({ data: { id: d.id, geo: JSON.parse(JSON.stringify(K.layout(d.model, d.sizes, d.opts, globalThis.__latticeDagre))) } }), 5);
      }
      terminate() {}
    };
    const pass = () => w.eval(browserJs());
    // The Studio replaces the figure on every edit.
    const edit = (names) => { w.document.querySelector('section').innerHTML = figHtml(names); pass(); };
    pass();
    return { w, log, edit, fig: () => w.document.querySelector('.flowchart-figure'), text: () => w.document.querySelector('svg.flowchart-svg').textContent };
  };
  const settle = () => new Promise((r) => setTimeout(r, 60));

  test('the first draw is synchronous and starts no worker', () => {
    const t = setup(true);
    assert.equal(t.fig().getAttribute('data-fc-drawn'), '1');
    assert.match(t.text(), /Alpha/);
    assert.equal(t.log.posts.length, 0);
  });

  test('an edit shows the last drawing until the worker answers, then paints the new one', async () => {
    const t = setup(true);
    t.edit(['Alpha', 'Beta', 'Delta']);
    assert.equal(t.fig().getAttribute('data-fc-pending'), '1');
    assert.equal(t.fig().getAttribute('data-fc-drawn'), '1', 'the old drawing is up, not the tiles');
    assert.match(t.text(), /Gamma/);
    assert.equal(t.log.posts.length, 1);
    await settle();
    assert.equal(t.fig().getAttribute('data-fc-pending'), null);
    assert.match(t.text(), /Delta/);
    assert.doesNotMatch(t.text(), /Gamma/);
  });

  test('a burst paints only the newest edit, with at most one layout queued behind the one in flight', async () => {
    const t = setup(true);
    for (const n of ['D', 'De', 'Del', 'Delt', 'Delta']) t.edit(['Alpha', 'Beta', n]);
    assert.equal(t.log.posts.length, 1, 'the rest wait, and only the newest of them is kept');
    await settle();
    assert.equal(t.log.posts.length, 2);
    assert.equal(t.log.posts[1].model.shapes[2].name, 'Delta');
    assert.match(t.text(), /Delta/);
    assert.equal(t.fig().getAttribute('data-fc-pending'), null);
  });

  test('the worker source compiles and closes over nothing but dagre', () => {
    const t = setup(true);
    t.edit(['Alpha', 'Beta', 'Delta']);
    assert.equal(t.log.sources.length, 1);
    assert.match(t.log.sources[0], /^importScripts\("https:\/\/example\.test\/lattice-dagre\.js"\);/);
    assert.doesNotThrow(() => new Function(t.log.sources[0]));
  });

  test('without the host flag every redraw stays synchronous', () => {
    const t = setup(false);
    t.edit(['Alpha', 'Beta', 'Delta']);
    assert.equal(t.log.posts.length, 0);
    assert.equal(t.fig().getAttribute('data-fc-pending'), null);
    assert.match(t.text(), /Delta/);
  });
});
