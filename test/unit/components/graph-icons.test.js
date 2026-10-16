/**
 * Icons on graph-chart nodes — `icon=` and `icon-only` on the flowchart and the state chart
 * (engineering/decisions/2026-09-29-inline-icons.md § 5.3; lib/components/chart/_chart-family/
 * graph-icons.js). The grammar resolves and coaches the name, the transform draws it into the
 * harness, the browser pass repaints it from a closed vocabulary (HARD RULE #22), and with the
 * icons plugin off nothing changes from a chart that never wrote an icon.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const { parseFlowchart, outlineFromMarkdown } = require('../../../lib/core/flowchart-grammar');
const fc = require('../../../lib/components/chart/flowchart/flowchart.transform');
const sc = require('../../../lib/components/chart/state-chart/state-chart.transform');
const { browserJs: fcBrowserJs } = require('../../../lib/components/chart/flowchart/flowchart.layout');
const { browserJs: scBrowserJs } = require('../../../lib/components/chart/state-chart/state-chart.layout');
// The engine registers the icons plugin's lazy data loader (lib/plugins/data.generated.js).
require('../../../lib/engine');

const parse = (md, host) => parseFlowchart(outlineFromMarkdown(md).items, host ? { host } : {});
const rules = (m) => m.diagnostics.map((d) => d.rule);
const OFF = new Set(['icons']);

/** A rendered list, as the chart family hands it to a kernel. */
const html = (rows) => `<h2>T</h2><ul>${rows.map((r) => `<li>${r}</li>`).join('')}</ul>`;

describe('graph icons — the grammar', () => {
  test('`icon=` resolves to the canonical name, aliases included', () => {
    const m = parse('- Orders `{icon=db, c2}`\n- API `{#api, diamond, icon=gateway}`');
    assert.equal(m.shapes[0].icon, 'database');
    assert.equal(m.shapes[0].slot, 2);
    assert.equal(m.shapes[1].icon, 'gateway');
    assert.equal(m.shapes[1].shape, 'diamond');
    assert.deepEqual(rules(m), []);
  });

  test('`icon-only` is a flag that rides with the icon', () => {
    const m = parse('- Bucket `{icon=bucket, icon-only}`');
    assert.equal(m.shapes[0].icon, 'bucket');
    assert.equal(m.shapes[0].iconOnly, true);
    assert.equal(m.shapes[0].name, 'Bucket', 'the name stays: it is the accessible name');
  });

  test('a name the set does not have is coached and dropped, never guessed', () => {
    const m = parse('- Fn `{icon=lambda}`');
    assert.equal(m.shapes[0].icon, undefined);
    const d = m.diagnostics.find((x) => x.rule === 'flowchart-unknown-icon');
    assert.ok(d && /function/.test(d.message), d?.message);
  });

  test('`icon-only` with no icon warns and shows the text', () => {
    const m = parse('- Store `icon-only`');
    assert.equal(m.shapes[0].iconOnly, undefined);
    assert.ok(rules(m).includes('flowchart-icon-only-without-icon'));
  });

  test('an icon-only shape with no words is refused: it would have no name', () => {
    const m = parse('- `{icon=database, icon-only}`');
    assert.equal(m.shapes.length, 0);
    const d = m.diagnostics.find((x) => x.rule === 'flowchart-empty-name');
    assert.match(d.message, /icon-only shape has no name/);
  });

  test('a group draws no icon, and says so', () => {
    const m = parse('- Platform `{icon=server}`\n  - API');
    assert.equal(m.groups[0].icon, undefined);
    assert.ok(rules(m).includes('flowchart-icon-on-group'));
  });

  test('on a connection target, an icon is a shape word and is refused there', () => {
    const m = parse('- A -> B `{icon=database}`');
    assert.ok(rules(m).includes('flowchart-shape-word-on-line'));
  });

  test('the state chart reads the same two words alongside its lead words', () => {
    const m = parse('- Cart `{start, icon=cart}`\n  - -pay-> Paid\n- Paid `{done, icon=card, icon-only}`', 'state-chart');
    assert.equal(m.shapes[0].icon, 'cart');
    assert.deepEqual(m.shapes[0].lead, ['start']);
    assert.equal(m.shapes[1].iconOnly, true);
  });
});

describe('graph icons — the transform', () => {
  test('the flowchart draws the icon into the harness tile, before the name', () => {
    const out = fc.transformSection(html(['API <code>{icon=gateway}</code> -&gt; DB', 'DB <code>{cylinder, icon=database, icon-only}</code>']), { classTokens: ['flowchart'] });
    assert.match(out, /<li class="fc-node"[^>]* data-icon="gateway"[^>]*><span class="graph-icon" aria-hidden="true"><svg[^>]*class="fc-icon-svg"/);
    assert.match(out, /data-icon="database" data-icon-only=""/);
    const model = JSON.parse(out.match(/data-fc-model="([^"]*)"/)[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&'));
    assert.equal(model.shapes.find((s) => s.name === 'API').icon, 'gateway');
    assert.equal(model.shapes.find((s) => s.name === 'DB').iconOnly, true);
  });

  test('the state chart draws it in the tile and in the inline rows', () => {
    const rows = ['Cart <code>{start, icon=cart}</code><ul><li>-pay-&gt; Paid</li></ul>', 'Paid <code>{end, icon=card}</code>'];
    assert.match(sc.transformSection(html(rows), { classTokens: ['state-chart'] }), /<li class="state-node"[^>]* data-icon="cart"/);
    assert.match(sc.transformSection(html(rows), { classTokens: ['state-chart', 'inline'] }), /<span class="state-label"><span class="graph-icon"/);
  });

  test('with the icons plugin off, a chart is exactly the chart that wrote no icon', () => {
    const withIcon = fc.transformSection(html(['API <code>{icon=gateway, icon-only}</code> -&gt; DB']), { classTokens: ['flowchart'], pluginsOff: OFF });
    const plain = fc.transformSection(html(['API -&gt; DB']), { classTokens: ['flowchart'] });
    assert.equal(withIcon, plain);
    const sWith = sc.transformSection(html(['A <code>{start, icon=cart}</code>']), { classTokens: ['state-chart'], pluginsOff: OFF });
    const sPlain = sc.transformSection(html(['A <code>start</code>']), { classTokens: ['state-chart'] });
    assert.equal(sWith, sPlain);
  });
});

describe('graph icons — a forged harness cannot inject markup (HARD RULE #22)', () => {
  // The harness is markup the sanitizer kept, and a deck can write one by hand. The pass
  // rebuilds the drawing from six shape elements and their geometry; nothing else survives.
  const { JSDOM } = require('jsdom');
  require('../../../lib/core/dagre-layout.js');
  const evil = '<script>top.__pwned=1</script><image href="data:," onerror="top.__pwned=1"/><foreignObject><div>x</div></foreignObject>' +
    '<path d="M1 1L5 5" onclick="top.__pwned=1" style="fill:red" stroke="red"/><path d="M1 1&quot; onload=&quot;x"/>' +
    '<circle cx="12" cy="12" r="3" fill="url(https://evil)"/><a href="https://evil"><rect x="1" y="1" width="2" height="2"/></a><use href="#x"/>';
  const run = (kind) => {
    const fcFig = kind === 'fc';
    const model = fcFig
      ? { shapes: [{ id: 'a', name: 'A', icon: 'database' }, { id: 'b', name: 'B', icon: 'x"><script>', iconOnly: true }, { id: 'c', name: 'C', icon: 'database', iconOnly: true }], groups: [], edges: [{ from: 'a', to: 'b', style: {} }] }
      : { states: [{ id: 'a', name: 'A', icon: 'database', start: true }, { id: 'c', name: 'C', icon: 'database', iconOnly: true }], groups: [], edges: [{ from: 'a', to: 'c', style: {} }], badges: true };
    const attr = JSON.stringify(model).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const tile = (id, cls, name) => `<li class="${cls}" data-id="${id}" data-icon="database"><span class="graph-icon"><svg>${evil}</svg></span><span class="${name}">${id.toUpperCase()}</span></li>`;
    const body = fcFig
      ? `<div class="flowchart-figure" data-fc-model="${attr}"><div class="fc-canvas"><div class="flowchart-scale"><div class="fc-harness"><ol class="fc-nodes">${tile('a', 'fc-node', 'fc-name')}${tile('b', 'fc-node', 'fc-name')}${tile('c', 'fc-node', 'fc-name')}</ol></div><svg class="flowchart-svg"><title>Flowchart</title></svg></div></div></div>`
      : `<div class="state-chart-figure" data-variant="default" data-sc-model="${attr}"><div class="sc-canvas"><div class="state-chart-scale"><div class="sc-harness"><ol class="state-nodes">${tile('a', 'state-node', 'state-label')}${tile('c', 'state-node', 'state-label')}</ol></div><svg class="state-chart-edges"><title>State chart</title></svg></div></div></div>`;
    const dom = new JSDOM(`<!doctype html><section class="${fcFig ? 'flowchart' : 'state-chart'}">${body}</section>`, { runScripts: 'outside-only' });
    dom.window.__latticeDagre = globalThis.__latticeDagre;
    // jsdom lays nothing out: give every box a size (an icon a small square) and Range the
    // rect list it lacks, so the pass measures a populated harness as a browser would.
    dom.window.Element.prototype.getBoundingClientRect = function rect() {
      const w = this.classList.contains('graph-icon') ? 20 : 100;
      return { left: 0, top: 0, right: w, bottom: w / 2, width: w, height: w / 2, x: 0, y: 0 };
    };
    dom.window.Range.prototype.getClientRects = () => [];
    dom.window.eval(fcFig ? fcBrowserJs() : scBrowserJs());
    return { dom, svg: dom.window.document.querySelector(fcFig ? 'svg.flowchart-svg' : 'svg.state-chart-edges') };
  };

  for (const kind of ['fc', 'sc']) {
    const { dom, svg } = run(kind);
    const icons = svg.querySelectorAll(kind === 'fc' ? 'svg.fc-icon' : 'svg.sc-icon');

    test(`${kind}: the pass paints the icon (or the assertions below prove nothing)`, () => {
      assert.ok(icons.length >= 1, svg.innerHTML.slice(0, 300));
    });

    test(`${kind}: only geometry survives the rebuild`, () => {
      const allowed = new Set(['title', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline']);
      for (const ic of icons) {
        for (const el of ic.querySelectorAll('*')) {
          assert.ok(allowed.has(el.tagName.toLowerCase()), el.outerHTML.slice(0, 120));
          for (const a of el.attributes) assert.match(a.name, /^(d|cx|cy|r|rx|ry|x|y|width|height|x1|y1|x2|y2|points)$/, el.outerHTML.slice(0, 120));
        }
      }
      // The good path and circle are kept; the path whose `d` tried to break out is not.
      const first = icons[0];
      assert.ok(first.querySelector('path[d="M1 1L5 5"]'));
      assert.ok(first.querySelector('circle[r="3"]'));
      assert.equal(first.querySelectorAll('path').length, 1);
      assert.equal(first.querySelector('rect'), null, 'a shape inside a forged <a> is not a child of the drawing');
      assert.equal(dom.window.top.__pwned, undefined);
    });

    test(`${kind}: icon-only paints the drawing alone, titled with the name`, () => {
      const only = [...icons].find((ic) => ic.querySelector('title'));
      assert.ok(only, 'the icon-only node has a titled drawing');
      assert.equal(only.querySelector('title').textContent, 'C');
      assert.equal(only.parentNode.querySelector('text.fc-name, text.state-label-t'), null, 'no painted name beside it');
    });
  }

  test('a forged icon name outside the set\'s spelling is dropped from the model', () => {
    const { svg } = run('fc');
    // `b` forged `icon: 'x"><script>'`, so it is not an icon node: its name is painted as text.
    const b = svg.querySelector('.fc-node-group[data-id="b"]');
    assert.ok(b.querySelector('text.fc-name'));
    assert.equal(b.querySelector('svg.fc-icon'), null);
  });
});

describe('graph icons — the cases the red team probed are pinned (HARD RULE #22)', () => {
  // #2558's red team attacked `drawing()` (docs/src/lib/trama/pipeline.ts) by hand and it held;
  // these keep it held. Each case is a forged drawing in the harness, run through the real
  // serialized pass of both charts. `keep` names what must survive; nothing else may.
  const { JSDOM } = require('jsdom');
  const cases = [
    { name: 'an <animate> or <set> inside a kept shape does not ride along',
      drawing: '<path d="M1 1L5 5"><animate attributeName="d" to="M0 0" begin="0s"/><set attributeName="onclick" to="top.__pwned=1"/></path>',
      keep: ['path[d="M1 1L5 5"]'] },
    { name: 'an entity-encoded quote in a coordinate drops that shape',
      drawing: '<circle cx="1&quot; onload=&quot;top.__pwned=1" cy="2" r="3"/><circle cx="4" cy="4" r="2"/>',
      keep: ['circle[cx="4"]'] },
    { name: 'a value past the 4000-character cap drops that shape',
      drawing: `<path d="M${'1 '.repeat(2001)}"/><path d="M2 2L3 3"/>`,
      keep: ['path[d="M2 2L3 3"]'] },
    { name: 'a prefixed tag is dropped, and an uppercase one is the shape it names (the parser lowercases it)',
      drawing: '<svg:path d="M1 1L9 9"/><xlink:circle cx="1" cy="1" r="1"/><PATH d="M2 2L3 3"/>',
      keep: ['path[d="M2 2L3 3"]'] },
    { name: 'a tag named after a prototype key reads nothing off the prototype',
      drawing: '<__proto__ d="M1 1"/><constructor d="M1 1"/><toString d="M1 1"/><path d="M2 2L3 3"/>',
      keep: ['path[d="M2 2L3 3"]'] },
    { name: 'a huge or non-finite coordinate cannot paint over the chart',
      drawing: '<circle cx="12" cy="12" r="1e308"/><rect x="-99999" y="0" width="2" height="2"/><path d="M1 1L1e9 1"/>' +
        '<line x1="0" y1="0" x2="1e5" y2="0"/><polyline points="1,1 2,2 99999,3"/><ellipse cx="1" cy="1" rx="1e400" ry="1"/><circle cx="12" cy="12" r="3"/>',
      keep: ['circle[r="3"]'] },
  ];
  const render = (kind, drawingHtml, nameC) => {
    // The same forged-harness runner as the block above, with a drawing of the case's own.
    const fcFig = kind === 'fc';
    const model = fcFig
      ? { shapes: [{ id: 'c', name: nameC, icon: 'database', iconOnly: true }], groups: [], edges: [] }
      : { states: [{ id: 'c', name: nameC, icon: 'database', iconOnly: true }], groups: [], edges: [], badges: true };
    const attr = JSON.stringify(model).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const tile = (cls, name) => `<li class="${cls}" data-id="c" data-icon="database"><span class="graph-icon"><svg>${drawingHtml}</svg></span><span class="${name}">C</span></li>`;
    const body = fcFig
      ? `<div class="flowchart-figure" data-fc-model="${attr}"><div class="fc-canvas"><div class="flowchart-scale"><div class="fc-harness"><ol class="fc-nodes">${tile('fc-node', 'fc-name')}</ol></div><svg class="flowchart-svg"><title>Flowchart</title></svg></div></div></div>`
      : `<div class="state-chart-figure" data-variant="default" data-sc-model="${attr}"><div class="sc-canvas"><div class="state-chart-scale"><div class="sc-harness"><ol class="state-nodes">${tile('state-node', 'state-label')}</ol></div><svg class="state-chart-edges"><title>State chart</title></svg></div></div></div>`;
    const dom = new JSDOM(`<!doctype html><section class="${fcFig ? 'flowchart' : 'state-chart'}">${body}</section>`, { runScripts: 'outside-only' });
    dom.window.__latticeDagre = globalThis.__latticeDagre;
    dom.window.Element.prototype.getBoundingClientRect = function rect() {
      const w = this.classList.contains('graph-icon') ? 20 : 100;
      return { left: 0, top: 0, right: w, bottom: w / 2, width: w, height: w / 2, x: 0, y: 0 };
    };
    dom.window.Range.prototype.getClientRects = () => [];
    dom.window.eval(fcFig ? fcBrowserJs() : scBrowserJs());
    const svg = dom.window.document.querySelector(fcFig ? 'svg.flowchart-svg' : 'svg.state-chart-edges');
    return { dom, icon: svg.querySelector(fcFig ? 'svg.fc-icon' : 'svg.sc-icon') };
  };
  for (const kind of ['fc', 'sc']) {
    test(`${kind}: the drawing is clipped two units past its 24-unit grid, whatever its numbers`, () => {
      // Per-number caps lose to a relative path that walks off by many small steps, so the bound
      // is the wrapper's: `overflow="hidden"` on a viewBox two units wider each side, at the
      // drawing's own scale. A forged shape cannot paint past the icon's box.
      const walk = `<path d="M0 0${' l9999 0'.repeat(400)}"/><path d="M-9999 -9999L9999 9999"/><circle cx="12" cy="12" r="9999"/>`;
      const { icon } = render(kind, walk, 'C');
      assert.equal(icon.getAttribute('overflow'), 'hidden');
      assert.equal(icon.getAttribute('viewBox'), '-2 -2 28 28');
      const side = Number(icon.getAttribute('width'));
      assert.equal(Number(icon.getAttribute('height')), side);
    });
    for (const c of cases) {
      test(`${kind}: ${c.name}`, () => {
        const { dom, icon } = render(kind, c.drawing, 'C');
        assert.ok(icon, 'the pass paints the icon');
        const shapes = [...icon.children].filter((el) => el.localName !== 'title');
        assert.equal(shapes.length, c.keep.length, icon.innerHTML.slice(0, 300));
        for (const sel of c.keep) assert.ok(icon.querySelector(sel), `${sel} survives: ${icon.innerHTML.slice(0, 300)}`);
        for (const el of shapes) assert.equal(el.children.length, 0, `a kept <${el.localName}> carries no children`);
        assert.equal(dom.window.top.__pwned, undefined);
      });
    }
    test(`${kind}: a </title> in the icon-only name stays text`, () => {
      const { dom, icon } = render(kind, '<path d="M1 1L5 5"/>', 'A</title><script>top.__pwned=1</script><title>');
      const title = icon.querySelector('title');
      assert.equal(title.textContent, 'A</title><script>top.__pwned=1</script><title>');
      assert.equal(icon.querySelectorAll('title').length, 1);
      assert.equal(icon.querySelector('script'), null);
      assert.equal(dom.window.top.__pwned, undefined);
    });
  }

  test('the 265 shipped icons survive the rebuild whole', () => {
    // Every shape of every shipped drawing passes drawing()'s vocabulary and its geometry cap,
    // so hardening it cannot cost a real icon a stroke.
    const { pluginData } = require('../../../lib/plugins/plugin-data.js');
    const data = pluginData('icons');
    const names = Object.keys(data.icons);
    assert.equal(names.length, 265);
    const svgOf = (name) => data.icons[name].map(([tag, attrs]) => `<${tag}${Object.entries(attrs).map(([k, v]) => ` ${k}="${v}"`).join('')}/>`).join('');
    for (const name of names) {
      const { icon } = render('fc', svgOf(name), 'C');
      const shapes = [...icon.children].filter((el) => el.localName !== 'title');
      assert.equal(shapes.length, data.icons[name].length, `${name}: ${icon.innerHTML.slice(0, 200)}`);
    }
  });
});

describe('graph icons — the empty-name advice fits the row', () => {
  test('a row with an unusable name and `icon-only` gets the ordinary advice, not "keep the words"', () => {
    const m = parse('- + `{icon=database, icon-only}`');
    const d = m.diagnostics.find((x) => x.rule === 'flowchart-empty-name');
    assert.ok(d, JSON.stringify(m.diagnostics));
    assert.doesNotMatch(d.message, /icon-only shape has no name/);
  });
});
