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
  const html = render('- Alert `pill` => Triage\n- Triage -done-> Close `dotted`\n  > Closes itself after a day.\n\n`[{"=>", Paging path}]`\n\n*Most alerts close themselves.*');

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
    assert.equal(m.notes, undefined, 'a blockquote is hidden detail, not a painted note');
    assert.equal(m.diagnostics, undefined);
  });

  test('a blockquote is HIDDEN DETAIL: a template on the shape\'s mark, and a speaker note', () => {
    assert.match(html, /<div class="chart-details" hidden><template class="chart-detail" data-mark="1"><li>Closes itself after a day\.<\/li><\/template><\/div>/);
    assert.doesNotMatch(html, /fc-note/, 'no visible note card, and no note in the harness');
    // Outside the figure: a template inside it would count as a mark.
    assert.ok(html.indexOf('chart-details') > html.indexOf('fc-key'));
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
    assert.match(html, /&lt;i&gt;note&lt;\/i&gt;|<li>note<\/li>/, 'the detail is escaped text');
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

  test('`curved` is a paint setting on the figure', () => {
    assert.match(render('- A -> B', 'flowchart curved'), /data-fc-style="curved"/);
    assert.doesNotMatch(render('- A -> B'), /data-fc-style/);
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
    const o = outlineFromMarkdown('- Box `{diamond, c2, fill=c4, border=c1, text=c3}`\n- Done `done`\n- Box -> Done `{c5, dashed, open, loose}`');
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
  const { graphLayoutKernel } = require('@laticent/trama');
  const figHtml = (names, dir) => {
    // Ids come from names, as the grammar makes them: a rename is a new id.
    const id = (n) => n.toLowerCase();
    const model = { shapes: names.map((n) => ({ id: id(n), name: n, shape: 'box' })), groups: [], edges: names.slice(1).map((n, i) => ({ from: id(names[i]), to: id(n), dir: 'out' })) };
    const attr = JSON.stringify(model).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    // An empty harness, as above: jsdom has no Range rects to measure text with.
    return `<div class="flowchart-figure"${dir ? ` data-fc-dir="${dir}"` : ''} data-fc-model="${attr}"><div class="fc-canvas"><div class="flowchart-scale"><div class="fc-harness"><ol class="fc-nodes"></ol></div>` +
      '<svg class="flowchart-svg"><title>Flowchart</title></svg></div></div></div>';
  };
  const setup = (liveAttr, mode = 'answer', wrap = (h) => `<section class="flowchart">${h}</section>`) => {
    const dom = new JSDOM(`<!doctype html><html${liveAttr ? ' data-lattice-live-layout' : ''}><head><script src="https://example.test/lattice-dagre.js"></script></head>` +
      `<body>${wrap(figHtml(['Alpha', 'Beta', 'Gamma']))}</body></html>`, { runScripts: 'outside-only' });
    const w = dom.window;
    w.__latticeDagre = globalThis.__latticeDagre;
    const K = graphLayoutKernel();
    const log = { posts: [], sources: [], answered: 0 };
    w.URL.createObjectURL = () => 'blob:test';
    w.URL.revokeObjectURL = () => {};
    const RealBlob = w.Blob;
    w.Blob = class extends RealBlob { constructor(parts, o) { super(parts, o); log.sources.push(parts.join('')); } };
    w.Worker = class {
      constructor() { log.worker = this; this.n = log.workers = (log.workers || 0) + 1; }
      postMessage(d) {
        log.posts.push({ ...d, via: this.n });
        if (mode === 'silent') return;
        // 'nolines': a search answers the way a search that picks dagre's layout does (no
        // `lines`); the first draw (synchronous, the real kernel) still pins a grid.
        const out = () => { const g = K.layout(d.model, d.sizes, d.opts, globalThis.__latticeDagre); if (mode === 'nolines' && g && d.opts.wrap) delete g.lines; return g; };
        setTimeout(() => { log.answered++; this.onmessage({ data: { id: d.id, geo: mode === 'null' ? null : JSON.parse(JSON.stringify(out())) } }); }, 5);
      }
      terminate() {}
    };
    const pass = () => w.eval(browserJs());
    // The Studio replaces the figure on every edit.
    const edit = (names, dir) => { (w.document.querySelector('section') || w.document.body).innerHTML = figHtml(names, dir); pass(); };
    pass();
    return { w, log, edit, fig: () => w.document.querySelector('.flowchart-figure'), text: () => w.document.querySelector('svg.flowchart-svg').textContent };
  };
  // Wait for the stand-in worker to answer every post and the figure to leave pending, not
  // for a fixed interval: a fixed 60 ms lost the race on a loaded machine. Bounded, so a
  // real hang still fails the test's own assertions rather than the runner's timeout.
  const settle = async (t) => {
    const tick = () => new Promise((r) => setTimeout(r, 10));
    for (const end = Date.now() + 2000; Date.now() < end;) {
      await tick();
      if (t.log.answered === t.log.posts.length && t.fig()?.getAttribute('data-fc-pending') == null) break;
    }
    await tick();
  };

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
    // The flowchart asks Trama to wrap, like the state chart: its first draw searched the
    // wraps, and a live keystroke lays out the grid that search pinned (sticky wrap). A
    // chart that did not ask for wrap has no pin, so this post would carry no grid.
    assert.ok(t.log.posts[0].opts.grid >= 1 && t.log.posts[0].opts.wrap === false, JSON.stringify(t.log.posts[0].opts));
    await settle(t);
    assert.equal(t.fig().getAttribute('data-fc-pending'), null);
    assert.match(t.text(), /Delta/);
    assert.doesNotMatch(t.text(), /Gamma/);
  });

  test('a burst paints only the newest edit, with at most one layout queued behind the one in flight', async () => {
    const t = setup(true);
    for (const n of ['D', 'De', 'Del', 'Delt', 'Delta']) t.edit(['Alpha', 'Beta', n]);
    assert.equal(t.log.posts.length, 1, 'the rest wait, and only the newest of them is kept');
    await settle(t);
    assert.equal(t.log.posts.length, 2);
    assert.equal(t.log.posts[1].model.shapes[2].name, 'Delta');
    assert.match(t.text(), /Delta/);
    assert.equal(t.fig().getAttribute('data-fc-pending'), null);
  });

  test('the worker source runs on its own: it loads dagre, lays a chart out and answers', async () => {
    const t = setup(true);
    t.edit(['Alpha', 'Beta', 'Delta']);
    assert.equal(t.log.sources.length, 1);
    assert.match(t.log.sources[0], /^importScripts\("https:\/\/example\.test\/lattice-dagre\.js"\);/);
    // A worker's globals, nothing of the page's: importScripts stands in for loading dagre.
    const vm = require('node:vm');
    const replies = [];
    const self = { postMessage: (m) => replies.push(m) };
    self.self = self;
    self.importScripts = () => { self.__latticeDagre = globalThis.__latticeDagre; };
    vm.createContext(self);
    vm.runInContext(t.log.sources[0], self);
    const job = t.log.posts[0];
    self.onmessage({ data: job });
    assert.equal(replies.length, 1);
    assert.equal(replies[0].id, job.id);
    assert.ok(replies[0].geo?.nodes?.delta, 'a layout came back');
    await settle(t);
  });

  test('another slide\'s chart at the same position draws at once, never showing the last slide\'s drawing', () => {
    // The Studio patches one section in place as the author moves between slides.
    const t = setup(true);
    t.edit(['Hire', 'Train', 'Retain']);
    assert.equal(t.log.posts.length, 0);
    assert.equal(t.fig().getAttribute('data-fc-pending'), null);
    assert.match(t.text(), /Retain/);
  });

  test('a worker that answers with no layout leaves the measuring tiles, not the old drawing', async () => {
    const t = setup(true, 'null');
    t.edit(['Alpha', 'Beta', 'Delta']);
    await settle(t);
    assert.equal(t.fig().getAttribute('data-fc-pending'), null);
    assert.equal(t.fig().getAttribute('data-fc-drawn'), null);
    t.edit(['Alpha', 'Beta', 'Delta']);
    await settle(t);
    // The first edit laid out the pinned grid, which answered nothing, so it searched once
    // and dropped the pin; the second edit searches. None from the passes between.
    assert.equal(t.log.posts.length, 3, 'a pinned try, its search, then one search');
    assert.ok(t.log.posts[0].opts.grid >= 1);
    assert.equal(t.log.posts[1].opts.grid, undefined);
    assert.equal(t.log.posts[2].opts.grid, undefined);
  });

  // STICKY WRAP (pipeline.ts): a keystroke lays out the grid the last search picked; the
  // search runs again once the author pauses; a newer key cancels that search.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  test('a keystroke lays out the pinned grid, and one search follows the pause', async () => {
    const t = setup(true);
    t.edit(['Alpha', 'Beta', 'Delta']);
    await settle(t);
    assert.equal(t.log.posts.length, 1);
    await sleep(360);
    await settle(t);
    assert.equal(t.log.posts.length, 2, 'one search after the pause');
    assert.equal(t.log.posts[1].opts.wrap, true);
    assert.equal(t.log.posts[1].opts.grid, undefined);
    assert.match(t.text(), /Delta/);
    // Nothing more: the search kept the wrap, so no further round is asked for.
    await sleep(360);
    assert.equal(t.log.posts.length, 2);
  });

  test('a key inside the pause cancels the search; only the newest text is searched', async () => {
    const t = setup(true);
    t.edit(['Alpha', 'Beta', 'Delt']);
    await settle(t);
    t.edit(['Alpha', 'Beta', 'Delta']);
    await settle(t);
    await sleep(360);
    await settle(t);
    const searches = t.log.posts.filter((p) => p.opts.wrap === true);
    assert.equal(searches.length, 1);
    assert.equal(searches[0].model.shapes[2].name, 'Delta');
    // The second key was pinned too: a pinned drawing never clears the pin it drew from.
    assert.ok(t.log.posts[1].opts.grid >= 1 && t.log.posts[1].opts.wrap === false, JSON.stringify(t.log.posts[1].opts));
  });

  test('a search that picks dagre pins dagre: the next key lays out dagre, with no search', async () => {
    const t = setup(true, 'nolines');
    t.edit(['Alpha', 'Beta', 'Delta']);
    await settle(t);
    await sleep(360);
    await settle(t);
    assert.equal(t.log.posts.length, 2, 'a pinned key, then the pause search');
    t.edit(['Alpha', 'Beta', 'Delt']);
    await settle(t);
    assert.equal(t.log.posts.length, 3);
    const o = t.log.posts[2].opts;
    assert.ok(o.wrap === false && o.grid === undefined && (o.dir === 'lr' || o.dir === 'tb'), JSON.stringify(o));
  });

  test('the pause search runs in its own worker, so a key never queues behind it', async () => {
    const t = setup(true);
    t.edit(['Alpha', 'Beta', 'Delta']);
    await settle(t);
    await sleep(360);
    await settle(t);
    assert.equal(t.log.posts.length, 2);
    assert.equal(t.log.posts[0].via, 1, 'the key on the live worker');
    assert.equal(t.log.posts[1].via, 2, 'the pause search on a second one');
    assert.equal(t.log.posts[1].opts.wrap, true);
  });

  test('a new direction searches at once; the pin holds only for the direction it was chosen under', async () => {
    const t = setup(true);
    t.edit(['Alpha', 'Beta', 'Delta'], 'tb');
    await settle(t);
    assert.equal(t.log.posts[0].opts.wrap, true);
    assert.equal(t.log.posts[0].opts.dir, 'tb');
  });

  test('a worker dropped during the pause is never posted to again; the figure is not left pending', async () => {
    const t = setup(true);
    t.edit(['Alpha', 'Beta', 'Delta']);
    await settle(t);
    assert.equal(t.log.posts.length, 1);
    t.log.worker.onerror();
    await sleep(360);
    await settle(t);
    assert.equal(t.log.posts.length, 1, 'no search posted to the dropped worker');
    assert.equal(t.fig().getAttribute('data-fc-pending'), null);
    assert.match(t.text(), /Delta/);
  });

  test('a worker that stops answering is dropped and the chart draws in place', async () => {
    const t = setup(true, 'silent');
    t.edit(['Alpha', 'Beta', 'Delta']);
    assert.equal(t.fig().getAttribute('data-fc-pending'), '1');
    await new Promise((r) => setTimeout(r, 3200));
    assert.equal(t.fig().getAttribute('data-fc-pending'), null);
    assert.match(t.text(), /Delta/);
    t.edit(['Alpha', 'Beta', 'Epsilon']);
    assert.equal(t.log.posts.length, 1, 'no worker after it failed');
    assert.match(t.text(), /Epsilon/);
  });

  test('no dagre tag yet is asked again, not cached: the worker starts once the host adds it', async () => {
    const t = setup(true);
    const tag = t.w.document.querySelector('script[src]');
    tag.remove();
    t.edit(['Alpha', 'Beta', 'Delta']);
    assert.equal(t.log.posts.length, 0, 'no dagre to load into a worker, so the edit draws in place');
    assert.match(t.text(), /Delta/);
    t.w.document.head.appendChild(tag);
    t.edit(['Alpha', 'Beta', 'Epsilon']);
    assert.equal(t.log.posts.length, 1, 'the worker starts once the tag is there');
    await settle(t);
    assert.match(t.text(), /Epsilon/);
  });

  test('a figure outside any section never goes live', () => {
    const t = setup(true, 'answer', (h) => h);
    t.edit(['Alpha', 'Beta', 'Delta']);
    assert.equal(t.log.posts.length, 0);
    assert.match(t.text(), /Delta/);
  });

  test('without the host flag every redraw stays synchronous', () => {
    const t = setup(false);
    t.edit(['Alpha', 'Beta', 'Delta']);
    assert.equal(t.log.posts.length, 0);
    assert.equal(t.fig().getAttribute('data-fc-pending'), null);
    assert.match(t.text(), /Delta/);
  });
});
