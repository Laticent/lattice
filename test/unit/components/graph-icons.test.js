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

describe('graph icons — the empty-name advice fits the row', () => {
  test('a row with an unusable name and `icon-only` gets the ordinary advice, not "keep the words"', () => {
    const m = parse('- + `{icon=database, icon-only}`');
    const d = m.diagnostics.find((x) => x.rule === 'flowchart-empty-name');
    assert.ok(d, JSON.stringify(m.diagnostics));
    assert.doesNotMatch(d.message, /icon-only shape has no name/);
  });
});
