/**
 * The Mermaid stand-in a preview frame installs when its page offers a draw host
 * (lib/plugins/mermaid/shared/draw-shim.mjs, lib/plugins/draw-shims.mjs, host-browser.mjs `ensureLibrary`), in jsdom with a fake
 * host. The real library, the real frame and the real sanitizer are the integration tier's
 * (test/integration/export/draw-frame-mermaid.test.js) and the Studio e2e's (docs/e2e/draw-frame-preview.spec.ts).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { installHydrateHost, releaseFigure } = require('../../../lib/plugins/host-browser.mjs');
const { fromBase64 } = require('../../../lib/core/base64-utf8');
const { HYDRATORS } = require('../../../lib/plugins/hydrate.generated.js');
const { createMermaidShim, fontAsks, tooltipBinder } = require('../../../lib/plugins/mermaid/shared/draw-shim.mjs');
const { drawShimFor } = require('../../../lib/plugins/draw-shims.mjs');

const win = (html = '') => {
  const w = new JSDOM(`<!doctype html><body>${html}</body>`, { pretendToBeVisual: true }).window;
  // The loader declines mid-parse; a built page is past it.
  Object.defineProperty(w.document, 'readyState', { value: 'complete' });
  return w;
};
const host = (answer) => {
  const jobs = [];
  const draw = async (job) => {
    jobs.push(job);
    return typeof answer === 'function' ? answer(job) : answer;
  };
  return { jobs, draw };
};
const figure = (over = {}) => JSON.stringify({ svg: '<svg id="x"><g class="node clickable" title="tip"/></svg>', type: 'flowchart-v2', links: [], ...over });

describe('the Mermaid stand-in', () => {
  test('is the shape the runtime pass checks, and `drawShimFor` names it for mermaid alone', () => {
    const w = win();
    const shim = createMermaidShim(host(figure()), w.document);
    assert.equal(typeof shim.initialize, 'function');
    assert.equal(typeof shim.render, 'function');
    assert.equal(typeof shim.mermaidAPI.getDiagramFromText, 'function');
    assert.equal(drawShimFor('mermaid', host(figure()), w.document) && typeof drawShimFor('mermaid', host(figure()), w.document).render, 'function');
    assert.equal(drawShimFor('function-plot', host(figure()), w.document), null);
    assert.equal(drawShimFor('constructor', host(figure()), w.document), null);
  });

  test('sends the definition, its id, the last config passed to initialize and the page width; answers the figure', async () => {
    const w = win();
    const h = host(figure());
    const shim = createMermaidShim(h, w.document);
    shim.initialize({ startOnLoad: false, theme: 'base', themeVariables: { fontFamily: 'Outfit, sans-serif' } });
    shim.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'strict' });
    const out = await shim.render('lattice-mmd-3', 'flowchart LR\n A-->B');
    assert.equal(h.jobs.length, 1);
    assert.equal(h.jobs[0].kind, 'mermaid');
    assert.equal(h.jobs[0].definition, 'flowchart LR\n A-->B');
    assert.equal(h.jobs[0].svgId, 'lattice-mmd-3');
    assert.equal(h.jobs[0].config.securityLevel, 'strict', 'the LAST config wins: the runtime always passes the whole of it');
    assert.equal(h.jobs[0].stage, 1200, 'a body with no width asks for the default stage');
    assert.match(out.svg, /^<svg/);
    assert.equal(out.diagramType, 'flowchart-v2');
    assert.equal(typeof out.bindFunctions, 'function', 'a flowchart carries the tooltip binder');
  });

  test('a draw that fails rejects with the host\'s reason, and a reply that is not a figure is an error', async () => {
    const w = win();
    const bad = createMermaidShim({ draw: async () => { throw new Error('Parse error on line 2'); } }, w.document);
    await assert.rejects(bad.render('a', 'x'), /Parse error on line 2/);
    await assert.rejects(createMermaidShim(host('not json'), w.document).render('a', 'x'), /not a figure/);
    await assert.rejects(createMermaidShim(host('{"nope":1}'), w.document).render('a', 'x'), /no SVG/);
  });

  test('a gantt\'s links come back through getDiagramFromText, and its bars open them', async () => {
    const w = win();
    const links = [['d1', 'https://example.com/design']];
    const shim = createMermaidShim(host(figure({ type: 'gantt', svg: '<svg><rect id="g-d1"/><text id="g-d1-text"/><rect id="g-d2"/></svg>', links })), w.document);
    const out = await shim.render('g', 'gantt\n click d1 href "https://example.com/design"');
    assert.equal((await shim.mermaidAPI.getDiagramFromText('gantt\n click d1 href "https://example.com/design"')).db.getLinks().get('d1'), 'https://example.com/design');
    assert.equal((await shim.mermaidAPI.getDiagramFromText('another')).db.getLinks().size, 0);
    const root = w.document.createElement('div');
    root.innerHTML = '<svg><rect id="g-d1"/><text id="g-d1-text"/><rect id="g-d2"/></svg>';
    const opened = [];
    w.open = (u) => opened.push(u);
    global.window = w;
    try {
      out.bindFunctions(root);
      for (const id of ['g-d1', 'g-d1-text', 'g-d2']) root.querySelector(`#${id}`).dispatchEvent(new w.Event('click'));
    } finally {
      delete global.window;
    }
    assert.deepEqual(opened, ['https://example.com/design', 'https://example.com/design'], 'the bar and its label, and not the task with no link');
  });

  test('the tooltip binder shows a node\'s title on hover, takes its look from the diagram\'s sheet and binds only inside its target', () => {
    const w = win();
    const root = w.document.createElement('div');
    root.innerHTML = '<style>#x div.mermaidTooltip{background:hsl(220, 100%, 98%);border:1px solid red;position:absolute;z-index:1}</style><svg><g class="node clickable" title="Where it starts"></g></svg>';
    w.document.body.appendChild(root);
    tooltipBinder(w.document)(root);
    const node = root.querySelector('g.clickable');
    assert.equal(node.hasAttribute('title'), false, 'the native tooltip would double ours');
    assert.equal(node.getAttribute('data-lattice-tip'), 'Where it starts');
    node.dispatchEvent(new w.MouseEvent('mouseover', { clientX: 10, clientY: 20 }));
    const tip = w.document.querySelector('body > .mermaidTooltip');
    assert.equal(tip.textContent, 'Where it starts');
    assert.equal(tip.style.opacity, '0.9');
    assert.match(tip.style.background, /hsl|rgb/, 'the diagram\'s own colour');
    assert.equal(tip.style.position, 'fixed', 'a rule from the diagram\'s sheet cannot move it out of the pinned place');
    node.dispatchEvent(new w.MouseEvent('mouseout'));
    assert.equal(tip.style.opacity, '0');
    // a second bind (a cache hand-back) reuses the one tooltip
    tooltipBinder(w.document)(root);
    assert.equal(w.document.querySelectorAll('body > .mermaidTooltip').length, 1);
  });

  test('fontAsks reads only the families asked for, with a weight, a style and the first url', () => {
    // jsdom's stylesheet parser drops a face's `src`, so the rules are stood in for; the real parse is the e2e's.
    const face = (family, weight, style, src) => ({ type: 5, cssText: `@font-face{src:${src}}`, style: { getPropertyValue: (p) => ({ 'font-family': family, 'font-weight': weight, 'font-style': style, src: src })[p] || '' } });
    const doc = {
      styleSheets: [
        { cssRules: [face('"Outfit"', '400', 'normal', 'url("https://x.test/fonts/outfit-400.woff2") format("woff2")'), face('Outfit', '700', 'italic', 'url(https://x.test/fonts/outfit-700i.woff2)'), face('"Other"', '400', 'normal', 'url(https://x.test/fonts/other.woff2)'), { type: 4, style: null }] },
        { get cssRules() { throw new Error('a sheet from another origin'); } },
      ],
    };
    const asks = fontAsks(doc, ['Outfit']);
    assert.deepEqual(asks.map((a) => `${a.family}|${a.weight}|${a.style}|${a.url.split('/').pop()}`), ['Outfit|400|normal|outfit-400.woff2', 'Outfit|700|italic|outfit-700i.woff2']);
    assert.deepEqual(fontAsks(doc, []), []);
  });
});

describe('the plugin host installs the stand-in where the library would have landed', () => {
  const opts = (extra) => ({ fromBase64, releaseFigure, baseUrl: 'https://example.test/rt/lattice-runtime.js', runtimeDrawn: [{ name: 'mermaid', payload: { file: 'mermaid.min.js', global: 'mermaid' } }], ...extra });
  const ready = (w) => () => !!w.mermaid && typeof w.mermaid.render === 'function' && typeof w.mermaid.initialize === 'function';

  test('with a draw host and a shim: the global is the stand-in, the answer is ready, and no script is added', () => {
    const w = win();
    const dh = host(figure());
    const run = installHydrateHost(w, HYDRATORS, opts({ drawHost: () => dh, drawShim: (name, h) => (name === 'mermaid' ? createMermaidShim(h, w.document) : null) }));
    assert.equal(run.ensureLibrary('mermaid', ready(w), () => {}), 'ready');
    assert.equal(w.mermaid.version, 'draw-host');
    assert.equal(w.document.querySelectorAll('script').length, 0);
  });

  test('with no draw host, or no shim for the plugin: the library loads as before', () => {
    for (const extra of [{ drawHost: () => null, drawShim: () => ({}) }, { drawHost: () => host(figure()), drawShim: () => null }, {}]) {
      const w = win();
      const run = installHydrateHost(w, HYDRATORS, opts(extra));
      const state = run.ensureLibrary('mermaid', ready(w), () => {});
      assert.equal(state, 'loading', JSON.stringify(Object.keys(extra)));
      assert.equal(w.document.querySelectorAll('script[src$="mermaid.min.js"]').length, 1);
    }
  });
});
