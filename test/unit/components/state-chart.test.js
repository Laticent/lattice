/**
 * Unit: the state chart (v2, on Trama).
 *
 * The grammar has its own suite (test/unit/core/flowchart-grammar.test.js), the kernel and
 * router theirs (graph-layout.test.js, test/unit/trama/). This one holds what the state
 * chart adds on top: the parse into a machine (ordinals, roles), the figure it emits
 * through the real engine, the escaping of author text, the `inline` rows, the adapter
 * (its sanitizer, its markers, a paint in a real DOM), the export's dagre gate, and the
 * quality counts over every state-chart slide the repo ships.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const engine = require('../../../lib/engine');
const { transformSection, parseStateChart, payload, STATE_CHART_VARIANTS } = require('../../../lib/components/chart/state-chart/state-chart.transform');
const { stateChartAdapter, browserJs, installStateChartLayout, fitInlineStateCharts } = require('../../../lib/components/chart/state-chart/state-chart.layout');
const { htmlNeedsDagre, figureNeedsDagre, machineBranches } = require('../../../lib/components/chart/state-chart/state-chart.adoption');
const { outlineFromMarkdown } = require('../../../lib/core/flowchart-grammar');
const { STATUS_TONE } = require('../../../lib/components/chart/_chart-family/graph-key');

const ROOT = path.join(__dirname, '../../..');
const render = (body, cls = 'state-chart') => String(engine.render(`<!-- _class: ${cls} -->\n\n## A machine.\n\n${body}\n`).html);
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
const modelOf = (html) => {
  const m = /data-sc-model="([^"]*)"/.exec(html);
  assert.ok(m, 'the figure carries its model');
  return JSON.parse(unesc(m[1]));
};
const parse = (md) => parseStateChart(outlineFromMarkdown(md));

const APPROVAL = [
  '- Draft `start`',
  '  - -submit-> Submitted',
  '  - -discard-> Archived',
  '- Submitted `on-track`',
  '  - -review-> In Review',
  '- In Review',
  '  - -approve-> Approved',
  '  - -reject-> Draft',
  '  - -revise-> In Review',
  '  > Two reviewers sign off.',
  '- Approved `done`',
  '  - -publish-> Published',
  '- Published `live`',
  '  - -archive-> Archived',
  '- Archived `end`',
].join('\n');

describe('state chart — the parse', () => {
  test('every list item is a state, numbered in list order', () => {
    const m = parse(APPROVAL);
    assert.deepEqual(m.states.map((s) => [s.index, s.name]), [[1, 'Draft'], [2, 'Submitted'], [3, 'In Review'], [4, 'Approved'], [5, 'Published'], [6, 'Archived']]);
  });

  test('a transition names its target; a state\'s own name is a self-loop', () => {
    const m = parse(APPROVAL);
    assert.deepEqual(m.transitions.map((t) => `${t.from}>${t.to}:${t.event}`), ['1>2:submit', '1>6:discard', '2>3:review', '3>4:approve', '3>1:reject', '3>3:revise', '4>5:publish', '5>6:archive']);
    assert.equal(m.transitions.find((t) => t.event === 'revise').isSelf, true);
  });

  test('`start` and `end` are the roles when said', () => {
    const m = parse(APPROVAL);
    assert.deepEqual(m.states.filter((s) => s.isStart).map((s) => s.name), ['Draft']);
    assert.deepEqual(m.states.filter((s) => s.isTerminal).map((s) => s.name), ['Archived']);
  });

  test('unsaid, the first state starts and every state with no way out ends (state-graph-facts inferRoles)', () => {
    const m = parse('- A\n  - -> B\n  - -> C\n- B\n- C\n  - -> C');
    assert.equal(m.states.find((s) => s.isStart).name, 'A');
    assert.deepEqual(m.states.filter((s) => s.isTerminal).map((s) => s.name), ['B']);
  });

  test('a status word folds case, as every chart\'s does', () => {
    assert.equal(parse('- Review `AT-RISK`').states[0].status, 'at-risk');
  });

  test('a sub-list of states is a composite state', () => {
    const m = parse('- Running\n  - Loading\n    - -> Ready\n  - Ready\n- Stopped');
    assert.deepEqual(m.groups.map((g) => g.name), ['Running']);
    assert.deepEqual(m.states.filter((s) => s.parent === 'running').map((s) => s.name), ['Loading', 'Ready']);
  });

  test('a blockquote is hidden detail on its state', () => {
    assert.deepEqual(parse(APPROVAL).notes, [{ on: 'in-review', text: 'Two reviewers sign off.' }]);
  });
});

describe('state chart — the figure through the real engine', () => {
  const html = render(`${APPROVAL}\n\n\`[{on-track, Moving}]\`\n\n*Rejected drafts return to the author.*`);

  test('one figure: the harness, an svg with its name and description, the model', () => {
    assert.equal((html.match(/class="state-chart-figure"/g) || []).length, 1);
    assert.match(html, /<ol class="state-nodes">/);
    assert.match(html, /<svg class="state-chart-edges" role="img"[^>]*><title[^>]*>State chart<\/title><desc[^>]*>States — 1\. Draft \(start\); 2\. Submitted, on-track;/);
    const m = modelOf(html);
    assert.deepEqual(m.states.map((s) => s.index), [1, 2, 3, 4, 5, 6]);
    assert.equal(m.states[0].start, true);
    assert.equal(m.states[5].end, true);
    assert.equal(m.edges.length, 8);
    assert.equal(m.badges, true);
  });

  test('each state tile carries its badge, its mark and its role', () => {
    assert.match(html, /<li class="state-node" data-id="draft" data-index="1" data-kind="start" data-mark="0" data-label="Draft"><span class="state-index" role="img" aria-label="State 1">1<\/span><span class="state-label">Draft<\/span><\/li>/);
    assert.match(html, /data-index="2" data-s="on-track" data-mark="1" data-label="Submitted" data-value="on-track"><span class="state-index" data-s="on-track" role="img" aria-label="State 2, on-track">2/);
    assert.match(html, /data-kind="terminal"/);
  });

  test('every label is a measured harness box', () => {
    assert.equal((html.match(/<li class="sc-elabel" data-edge="\d+">/g) || []).length, 8);
  });

  test('the key is derived, renamed by the authored span, and shared with the flowchart', () => {
    assert.match(html, /<ol class="fc-key" data-chart="state-chart">.*Moving · Done.*Live/s, 'on-track and done paint alike, so they share one entry');
    assert.doesNotMatch(html, /\[\{on-track/, 'the key span is consumed');
    assert.match(html, /<p class="chart-caption"[^>]*>Rejected drafts return to the author\.<\/p>/);
  });

  test('the hidden detail rides a template after the figure', () => {
    assert.match(html, /<div class="chart-details" hidden><template class="chart-detail" data-mark="2"><li>Two reviewers sign off\.<\/li><\/template><\/div><!-- In Review: Two reviewers sign off\. -->/);
    assert.ok(html.indexOf('chart-details') > html.indexOf('fc-key'), 'after the figure, never inside it');
    assert.doesNotMatch(html.slice(0, html.indexOf('chart-details')), /Two reviewers sign off/, 'the slide never shows it');
  });
});

describe('state chart — variants', () => {
  test('the declared modifiers', () => {
    assert.deepEqual(STATE_CHART_VARIANTS, ['lr', 'tb', 'inline', 'curved', 'unnumbered']);
  });

  test('no direction token lets the fit choose; `lr` / `tb` pin; portrait turns `lr` to `tb`', () => {
    assert.match(render('- A\n  - -> B\n- B'), /data-sc-dir="auto"/);
    assert.match(render('- A\n  - -> B\n- B', 'state-chart lr'), /data-sc-dir="lr"/);
    assert.match(render('- A\n  - -> B\n- B', 'state-chart tb'), /data-sc-dir="tb"/);
    const inner = '<h2>T</h2><ul><li>A<ul><li>-&gt; B</li></ul></li><li>B</li></ul>';
    assert.match(transformSection(inner, { classTokens: ['state-chart', 'lr'], orientation: 'portrait' }), /data-sc-dir="tb"/);
  });

  test('`curved` is a paint setting; `unnumbered` drops the badges', () => {
    assert.match(render('- A\n  - -> B\n- B', 'state-chart curved'), /data-sc-style="curved"/);
    const off = render('- A\n  - -> B\n- B', 'state-chart unnumbered');
    assert.match(off, /data-sc-badges="off"/);
    assert.doesNotMatch(off, /class="state-index"/);
    assert.equal(modelOf(off).badges, false);
  });

  test('`inline` renders rows with chips citing the target\'s number; no model, no pass', () => {
    const html = render('- Connecting `start`\n  - -retry-> Connecting\n  - -ok-> Connected\n- Connected `live`\n  - -drop-> Connecting', 'state-chart inline');
    assert.match(html, /data-variant="inline"/);
    assert.doesNotMatch(html, /data-sc-model/);
    assert.match(html, /<span class="state-chip" data-dir="self"><span class="state-chip-event">retry<\/span><span class="state-chip-arrow" role="img" aria-label="to itself"><span class="state-chip-mark" aria-hidden="true"><\/span><\/span><\/span>/);
    assert.match(html, /<span class="state-chip" data-dir="forward"><span class="state-chip-event">ok<\/span><span class="state-chip-arrow" role="img" aria-label="to state 2"><span class="state-chip-mark" aria-hidden="true"><\/span><span class="state-chip-to">2<\/span>/);
    assert.match(html, /data-dir="back"/);
    // The arrow is drawn, never typed (HARD RULE #29).
    assert.doesNotMatch(html, /[→↺]/);
  });

  test('`horizontal` is still `lr inline`', () => {
    assert.match(render('- A\n  - -> B\n- B', 'state-chart horizontal'), /data-variant="inline" data-sc-dir="lr"/);
  });
});

describe('state chart — untrusted text never becomes markup', () => {
  test('a name, a label and a detail that look like HTML are escaped everywhere', () => {
    const html = render('- `<img>` \\<script>\n  - -a<b-> B\n- B\n  > <i>note</i>');
    assert.doesNotMatch(html, /<script\b/i);
    assert.doesNotMatch(html, /<img\b/i);
    assert.doesNotMatch(html, /<i>note<\/i>/);
  });

  test('a slide with no list is left alone', () => {
    const inner = '<h2>Title</h2><p>No list here.</p>';
    assert.equal(transformSection(inner, { classTokens: ['state-chart'] }), inner);
  });
});

describe('state chart — the adapter', () => {
  const A = stateChartAdapter();

  test('the markers join the kernel\'s input: a dot before the first state, one ring after the last', () => {
    const km = A.kernelModel(A.sanitize(payload(parse(APPROVAL), {})));
    assert.equal(km.shapes[0].id, 'sc-start');
    assert.equal(km.shapes[0].shape, 'start');
    assert.equal(km.shapes[km.shapes.length - 1].id, 'sc-end');
    assert.ok(km.edges.some((e) => e.from === 'sc-start' && e.to === 'draft'));
    assert.ok(km.edges.some((e) => e.from === 'archived' && e.to === 'sc-end'));
  });

  test('two ends share one ring', () => {
    const km = A.kernelModel(A.sanitize(payload(parse('- A\n  - -> B\n  - -> C\n- B\n- C'), {})));
    assert.equal(km.shapes.filter((s) => s.shape === 'end').length, 1);
    assert.equal(km.edges.filter((e) => e.to === 'sc-end').length, 2);
  });

  test('the sanitizer rebuilds every structural field from a closed set', () => {
    const m = A.sanitize({
      states: [{ id: 'a', name: 'A', shape: 'x"/>', status: 'fail"', slot: '3', fill: 99, start: 'yes' }, { id: 'sc-start', name: 'forged marker' }],
      groups: [{ id: 'g', name: 'G', slot: 2.5 }],
      edges: [{ from: 'a', to: 'a', dir: 'up', style: { pattern: 'x', head: 'dot', slot: 4 } }],
      badges: 'no',
    });
    assert.deepEqual(m.shapes, [{ id: 'a', name: 'A', parent: null, index: 1, shape: 'box' }]);
    assert.deepEqual(m.groups, [{ id: 'g', name: 'G', parent: null }]);
    assert.deepEqual(m.edges, [{ from: 'a', to: 'a', dir: 'out', style: { slot: 4, head: 'dot' } }]);
    assert.equal(m.badges, true);
    assert.equal(A.sanitize({ nope: 1 }), null);
  });

  test('its tone table is the key\'s and the stylesheet\'s', () => {
    const src = fs.readFileSync(path.join(ROOT, 'lib/components/chart/state-chart/state-chart.layout.js'), 'utf8');
    const block = /const STATUS_TONE = (\{[\s\S]*?\});/.exec(src)[1];
    // eslint-disable-next-line no-new-func
    assert.deepEqual(new Function(`return ${block}`)(), STATUS_TONE);
    const css = fs.readFileSync(path.join(ROOT, 'lib/components/chart/state-chart/state-chart.styles.css'), 'utf8');
    for (const [word, tone] of Object.entries(STATUS_TONE)) {
      if (tone === 'mute') continue;
      assert.match(css, new RegExp(`\\[data-s="${word}"\\][^{]*\\{ --fill-hue: var\\(--state-${tone}-hue\\)`), `${word} -> ${tone} in the stylesheet`);
    }
  });

  test('the serialized pass parses, imports nothing and closes over nothing', () => {
    const js = browserJs();
    assert.doesNotMatch(js, /\brequire\(/);
    assert.doesNotThrow(() => new Function(js));
    for (const fn of [stateChartAdapter, fitInlineStateCharts]) assert.doesNotThrow(() => new Function(`return (${fn.toString()})`)()());
  });

  test('with no figures in the document it does nothing and throws nothing', () => {
    const doc = { querySelectorAll: () => [], readyState: 'complete' };
    assert.doesNotThrow(() => installStateChartLayout(doc, () => ({ layout: () => null })));
  });
});

describe('state chart — the serialized pass in a real DOM', () => {
  const { JSDOM } = require('jsdom');
  const page = (model, { dagre = true } = {}) => {
    const attr = JSON.stringify(model).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
    const dom = new JSDOM(`<!doctype html><section class="state-chart"><div class="state-chart-figure" data-variant="default" data-sc-dir="auto" data-sc-model="${attr}">` +
      '<div class="sc-canvas"><div class="state-chart-scale"><div class="sc-harness"><ol class="state-nodes"></ol></div>' +
      '<svg class="state-chart-edges"><title>State chart</title><desc>d</desc></svg></div></div></div></section>', { runScripts: 'outside-only' });
    require('../../../lib/core/dagre-layout.js');
    if (dagre) dom.window.__latticeDagre = globalThis.__latticeDagre;
    // THE SERIALIZED PASS, the script the emulator ships: running it here also proves it
    // closes over nothing (a free variable throws).
    dom.window.eval(browserJs());
    return dom.window.document;
  };

  test('a machine paints: markers, one tile per state with its mark and role, labeled lines', () => {
    const doc = page(payload(parse(APPROVAL), { badges: true }));
    const svg = doc.querySelector('svg.state-chart-edges');
    assert.equal(doc.querySelector('.state-chart-figure').getAttribute('data-sc-drawn'), '1');
    assert.equal(svg.querySelectorAll('.state-node-shape').length, 6);
    assert.equal(svg.querySelector('.state-node-shape[data-mark="0"]').getAttribute('data-kind'), 'start');
    assert.equal(svg.querySelector('.state-node-shape[data-mark="0"]').getAttribute('data-anima-role'), 'region');
    assert.ok(svg.querySelector('.state-marker[data-kind="start"] .state-marker-disc'));
    assert.ok(svg.querySelector('.state-marker[data-kind="terminal"] .state-marker-ring'));
    assert.equal(svg.querySelectorAll('.state-edge-group').length, 8 + 2, 'eight transitions, and the two marker lines');
    assert.ok([...svg.querySelectorAll('.state-edge-label')].some((t) => t.textContent === 'approve'));
    assert.equal(svg.querySelector('.state-edge').getAttribute('data-anima-role'), 'bar');
    assert.equal(svg.querySelector('title').textContent, 'State chart', 'the accessible name survives the paint');
    for (const el of svg.children) if (!['title', 'desc'].includes(el.tagName.toLowerCase())) assert.equal(el.getAttribute('aria-hidden'), 'true');
  });

  test('a CHAIN draws with no dagre at all, on the grid', () => {
    const doc = page(payload(parse('- A `start`\n  - -go-> B\n- B\n  - -go-> C\n- C `end`'), {}), { dagre: false });
    assert.equal(doc.querySelector('.state-chart-figure').getAttribute('data-sc-drawn'), '1');
    assert.equal(doc.querySelectorAll('.state-node-shape').length, 3);
  });

  test('a machine that branches, with no dagre, still draws on the grid', () => {
    const doc = page(payload(parse('- A\n  - -> B\n  - -> C\n- B\n  - -> D\n- C\n  - -> D\n- D'), {}), { dagre: false });
    assert.equal(doc.querySelectorAll('.state-node-shape').length, 4);
  });

  test('a forged model paints nothing outside the painter\'s vocabulary (HARD RULE #22)', () => {
    // `data-sc-model` survives the slide sanitizer (DOMPurify keeps data-*), so a deck can
    // forge a figure by hand. Every field is hostile here.
    const evil = '"/><image href="data:," onerror="top.__pwned=1"/><g data-q="';
    const doc = page({
      states: [
        { id: 'a', name: `A ${evil}`, shape: `x${evil}`, status: `fail${evil}`, slot: `1${evil}`, fill: 99, text: '2', start: true },
        { id: `b${evil}`, name: 'B', end: true },
      ],
      groups: [{ id: 'g', name: `G${evil}`, slot: `3${evil}` }],
      edges: [{ from: 'a', to: `b${evil}`, dir: `out${evil}`, label: `L${evil}`, style: { pattern: `dotted${evil}`, slot: `4${evil}`, head: `dot${evil}` } }],
      badges: true,
    });
    const svg = doc.querySelector('svg.state-chart-edges');
    assert.ok(svg.querySelector('.state-node-shape'), 'the pass ran, or the checks below prove nothing');
    const allowed = new Set(['title', 'desc', 'defs', 'lineargradient', 'stop', 'g', 'rect', 'path', 'ellipse', 'circle', 'text', 'tspan']);
    for (const el of svg.querySelectorAll('*')) assert.ok(allowed.has(el.tagName.toLowerCase()), el.outerHTML.slice(0, 120));
    assert.equal(svg.querySelector('[onerror]'), null);
    assert.equal(svg.querySelector('[data-q]'), null);
    const shape = svg.querySelector('.state-node-shape');
    assert.equal(shape.getAttribute('data-s'), null);
    assert.equal(shape.getAttribute('data-slot'), null);
  });
});

describe('state chart — the export\'s dagre gate reads Trama', () => {
  const figure = (md, cls) => render(md, cls);

  test('a chain needs no dagre', () => {
    assert.equal(htmlNeedsDagre(figure(APPROVAL.replace('  - -discard-> Archived\n', '').replace('  - -reject-> Draft\n', ''))), false);
  });

  test('a chain with skips and back edges is still a chain', () => {
    assert.equal(htmlNeedsDagre(figure(APPROVAL)), false);
  });

  test('a chain dense with skips that the grid cannot draw cleanly still ships dagre', () => {
    const n = 10;
    const body = Array.from({ length: n }, (_, i) => [`- S${i}`, ...Array.from({ length: n - i - 1 }, (_x, j) => `  - -> S${i + j + 1}`), ...(i > 1 ? ['  - -> S0'] : [])].join('\n')).join('\n');
    assert.equal(htmlNeedsDagre(render(body)), true);
  });

  test('a fan-out needs dagre', () => {
    assert.equal(htmlNeedsDagre(figure('- A\n  - -> B\n  - -> C\n- B\n  - -> D\n- C\n  - -> D\n- D')), true);
  });

  test('a composite state needs dagre', () => {
    assert.equal(htmlNeedsDagre(figure('- Running\n  - Loading\n    - -> Ready\n  - Ready\n- Stopped')), true);
  });

  test('an inline figure never asks; no figure, no engine', () => {
    assert.equal(htmlNeedsDagre(figure('- A\n  - -> B\n  - -> C\n- B\n- C', 'state-chart inline')), false);
    assert.equal(htmlNeedsDagre('<p>no chart</p>'), false);
  });

  test('anything unreadable ships the engine', () => {
    assert.equal(figureNeedsDagre('not json'), true);
    assert.equal(figureNeedsDagre('{&quot;states&quot;:[]}'), true);
  });

  test('`machineBranches` is Trama\'s own predicate on the adapter\'s input', () => {
    const A = stateChartAdapter();
    const m = A.sanitize(payload(parse('- A\n  - -> B\n- B'), {}));
    assert.equal(machineBranches(m), false);
  });
});

describe('state chart — every shipped slide lays out with zero quality faults', () => {
  // The kernel's never-rules, held on the real corpus: every state-chart slide in the repo,
  // at a wide and a tall stage, with sizes from the text. (The router's own suites hold the
  // rules on random graphs.)
  require('../../../lib/core/dagre-layout.js');
  const { graphLayoutKernel } = require('@laticent/trama');
  const A = stateChartAdapter();
  const decks = [
    'examples/state-chart.md', 'examples/state-chart-branching.md', 'examples/state-chart-polish.md',
    'examples/state-chart-polish-followups.md', 'examples/state-chart-stress.md', 'examples/state-chart-paint.md',
    'lib/components/chart/state-chart/state-chart.gallery.md', 'examples/portrait-gantt-statechart.md',
  ];
  let slides = 0;
  for (const deck of decks) {
    const parts = fs.readFileSync(path.join(ROOT, deck), 'utf8').split(/\n---\n/);
    parts.forEach((md, i) => {
      if (!/_class:[^>]*\bstate-chart\b/.test(md) || /_class:[^>]*\binline\b/.test(md)) return;
      const m = parseStateChart(outlineFromMarkdown(md.replace(/^[\s\S]*?\n## .*\n/, '')));
      if (!m.states.length) return;
      slides++;
      test(`${deck} slide ${i}`, () => {
        const km = A.kernelModel(A.sanitize(payload(m, {})));
        const sizes = {};
        for (const s of km.shapes) sizes[s.id] = s.shape === 'start' ? { w: 14, h: 14, kind: 'start' } : s.shape === 'end' ? { w: 20, h: 20, kind: 'end' } : { w: 9 * s.name.length + 46, h: 40, kind: 'box' };
        const labelSizes = {};
        km.edges.forEach((e, k) => { if (e.label) labelSizes[k] = { w: 7 * e.label.length + 12, h: 16 }; });
        for (const stage of [{ w: 1072, h: 440 }, { w: 620, h: 900 }]) {
          const geo = graphLayoutKernel().layout(km, sizes, { wrap: true, labelSizes, stage, maxScale: 1.25 }, globalThis.__latticeDagre);
          assert.ok(geo, 'it lays out');
          assert.deepEqual(Object.entries(geo.quality).filter(([, v]) => v), [], JSON.stringify(stage));
        }
      });
    });
  }
  test('the corpus is the real one', () => assert.ok(slides >= 45, `${slides} slides`));
});

describe('state chart — lint reads the same grammar', () => {
  const { findFlowchartIssues } = require('../../../lib/authoring/lint-core');
  const lint = (body) => findFlowchartIssues(`<!-- _class: state-chart -->\n\n## X.\n\n${body}\n`);

  test('a near-duplicate target is named, since a target is a state\'s name', () => {
    const f = lint('- Draft `start`\n  - -submit-> Aproved\n- Approved `end`');
    assert.deepEqual(f.map((x) => [x.rule, x.classToken]), [['flowchart-near-duplicate', 'state-chart']]);
  });

  test('`start` and `end` are words, not unknown modifiers, on a state chart only', () => {
    assert.deepEqual(lint('- A `start`\n  - -> B\n- B `end`'), []);
  });

  test('the retired v1 spellings are named with their v2 fix', () => {
    const rules = lint('1. Draft\n   - `submit => 2`\n2. Done `end`:::state-pass-hue').map((x) => x.rule);
    assert.ok(rules.includes('state-chart-v1-transition'));
    assert.ok(rules.includes('state-chart-v1-tint'));
  });
});

describe('state chart — composites in the facts', () => {
  const COMPOSITE = [
    '- Cart `start`', '  - -checkout-> Payment',
    '- Payment', '  - Authorize', '    - -ok-> Capture', '  - Capture', '  - -paid-> Shipped',
    '- Shipped', '  - -deliver-> Delivered', '- Delivered',
  ].join('\n');

  test('a line into a composite enters its first state; a line out leaves from each state in it', () => {
    const m = parse(COMPOSITE);
    const t = m.transitions.map((x) => [x.from, x.to, x.event]);
    assert.deepEqual(t, [[1, 2, 'checkout'], [2, 3, 'ok'], [2, 4, 'paid'], [3, 4, 'paid'], [4, 5, 'deliver']]);
    assert.deepEqual(m.states.map((x) => [x.name, x.isStart, x.isTerminal]),
      [['Cart', true, false], ['Authorize', false, false], ['Capture', false, false], ['Shipped', false, false], ['Delivered', false, true]]);
  });

  test('the narration reads the same roles: the start is not an end, nothing is unreachable', () => {
    const { narrateStateChart } = require('../../../lib/core/chart-narration');
    const said = narrateStateChart(`<!-- _class: state-chart -->\n\n## Orders.\n\n${COMPOSITE}\n`);
    assert.doesNotMatch(said, /Cart is an end state/);
    assert.doesNotMatch(said, /never reaches|Nothing leads to/);
  });

  test('`inline` names the composite and keeps its lines', () => {
    const html = render(COMPOSITE, 'state-chart inline');
    assert.match(html, /<li class="state-group-row" role="presentation"><span class="state-group-name">Payment<\/span><\/li>/);
    assert.match(html, /state-chip-event">checkout</);
    assert.equal((html.match(/state-chip-event">paid</g) || []).length, 2, 'paid leaves from both states in Payment');
  });
});

describe('state chart — hostile names and grammar edges', () => {
  const { graphLayoutKernel } = require('@laticent/trama');
  test('a state named like an Object.prototype key lays out like any other name', () => {
    require('../../../lib/core/dagre-layout.js');
    const K = graphLayoutKernel();
    for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      for (const dagre of [globalThis.__latticeDagre, null]) {
        const ids = ['a', id, 'b'];
        const sizes = Object.create(null);
        for (const x of ids) sizes[x] = { w: 90, h: 36 };
        const geo = K.layout({ shapes: ids.map((x) => ({ id: x, name: x, parent: null, shape: 'box' })), groups: [], edges: [{ from: 'a', to: id, dir: 'out', style: {}, label: 'go' }, { from: id, to: 'b', dir: 'out', style: {}, label: 'go' }] },
          sizes, { wrap: true, stage: { w: 900, h: 400 }, labelSizes: {} }, dagre);
        assert.ok(geo, `${id} lays out`);
        assert.ok(Number.isFinite(geo.nodes[id].w) && Number.isFinite(geo.nodes[id].x), `${id} has a finite box`);
        const q = geo.quality || {};
        for (const k of Object.keys(q)) if (typeof q[k] === 'number' && k !== 'crossings' && k !== 'bends') assert.equal(q[k], 0, `${id}: ${k}`);
      }
    }
  });

  test('the lead words fold case, as the status words do', () => {
    const m = parse('- Draft `Start`\n  - -> Done\n- Done `END`');
    assert.deepEqual(m.states.map((x) => [x.isStart, x.isTerminal]), [[true, false], [false, true]]);
  });

  test('a status wins over a slot on one state, as on the flowchart, and the key names it', () => {
    const html = render('- A `start`\n  - -> B\n- B `{done, c2}`');
    assert.match(html, /fc-key-label">Done</);
  });

  test('the narration reads the list after the heading, not a list above it', () => {
    const { narrateStateChart } = require('../../../lib/core/chart-narration');
    const said = narrateStateChart('<!-- _class: state-chart -->\n\n- Intro point\n\n## Machine\n\n- Draft `start`\n  - -submit-> Review\n- Review `end`\n');
    assert.match(said, /From Draft, submit goes to Review/);
    assert.doesNotMatch(said, /-submit->/);
    assert.doesNotMatch(said, /starts at Intro/);
  });

  test('the v1 detectors catch an event holding `=` and the two-slot tint', () => {
    const { findFlowchartIssues } = require('../../../lib/authoring/lint-core');
    const rules = findFlowchartIssues('<!-- _class: state-chart -->\n\n## X.\n\n1. Draft\n   - `x = y => 2`\n2. Done :::state-pass-hue/state-pass-ink\n').map((x) => x.rule);
    assert.ok(rules.includes('state-chart-v1-transition'));
    assert.ok(rules.includes('state-chart-v1-tint'));
  });
});

describe('wrapping is cheap — the kernel routes only what can win', () => {
  const { graphLayoutKernel } = require('@laticent/trama');
  require('../../../lib/core/dagre-layout.js');
  const chain = (n) => {
    const shapes = Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: `State ${i}`, parent: null, shape: 'box' }));
    const edges = shapes.slice(1).map((sh, i) => ({ from: shapes[i].id, to: sh.id, dir: 'out', style: {}, label: 'go' }));
    const sizes = Object.create(null);
    for (const sh of shapes) sizes[sh.id] = { w: 110, h: 40 };
    const labelSizes = Object.create(null);
    edges.forEach((_e, i) => { labelSizes[i] = { w: 24, h: 14 }; });
    return [{ shapes, groups: [], edges }, sizes, { wrap: true, labelSizes, stage: { w: 1152, h: 480 } }];
  };
  test('a clean chain routes one grid and never dagre\'s layout, with dagre loaded', () => {
    const K = graphLayoutKernel();
    const geo = K.layout(...chain(10), globalThis.__latticeDagre);
    assert.ok(geo && geo.lines >= 1);
    assert.equal(K.stats.routed, 1, 'one routing pass: the pick is proven from the others\' bounds');
  });
  test('the answer is the one without dagre on a chain the grid draws cleanly', () => {
    const a = graphLayoutKernel().layout(...chain(10), globalThis.__latticeDagre);
    const b = graphLayoutKernel().layout(...chain(10), null);
    assert.deepEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)));
  });
});

describe('wrapping is a Trama capability — the flowchart wraps a long flow, keeps a legible fan', () => {
  const { graphLayoutKernel } = require('@laticent/trama');
  require('../../../lib/core/dagre-layout.js');
  const model = (names, extra = []) => {
    const shapes = names.map((n, i) => ({ id: `s${i}`, name: n, parent: null, shape: 'box' }));
    const id = (n) => shapes.find((x) => x.name === n).id;
    const edges = [...names.slice(1).map((n, i) => [names[i], n]), ...extra].map(([a, b]) => ({ from: id(a), to: id(b), dir: 'out', style: {} }));
    const sizes = Object.create(null);
    for (const sh of shapes) sizes[sh.id] = { w: 120, h: 40 };
    return [{ shapes, groups: [], edges }, sizes];
  };
  test('a ten-step flow on one line would shrink; wrapped it reads in rows, in order', () => {
    const [m, sizes] = model(['A1', 'A2', 'A3', 'A4', 'A5', 'A6', 'A7', 'A8', 'A9', 'A10']);
    const opts = { wrap: true, stage: { w: 1152, h: 480 } };
    const geo = graphLayoutKernel().layout(m, sizes, opts, globalThis.__latticeDagre);
    const one = graphLayoutKernel().layout(m, sizes, { ...opts, wrap: false }, globalThis.__latticeDagre);
    assert.ok(geo.lines > 1 && geo.scale > one.scale * 1.12, `wrapped ${geo.lines} lines at ${geo.scale} vs one line at ${one.scale}`);
    // Reading order: each shape is right of, or on a later line than, the one before it.
    const at = m.shapes.map((sh) => geo.nodes[sh.id]);
    for (let i = 1; i < at.length; i++) assert.ok(at[i].y > at[i - 1].y + 1 || at[i].x > at[i - 1].x, `shape ${i} follows shape ${i - 1}`);
  });
  test('a fan-out dagre already draws at size keeps dagre\'s layout', () => {
    // A real call, recorded from the state-chart branching slide (long transition labels).
    // Without the WRAP_BELOW gate the two-line grid wins it at 1.24 and reads worse than
    // dagre's fan at 1.04; a fan that dagre draws at the maxScale cap would pass either way.
    const box = (id, name, extra = {}) => ({ id, name, parent: null, shape: 'box', ...extra });
    const m = {
      shapes: [
        { id: 'sc-start', name: '', parent: null, shape: 'start' },
        box('submitted', 'Submitted', { index: 1, start: true }),
        box('second-review', 'Second review', { index: 2 }),
        box('approved', 'Approved', { index: 3, status: 'done' }),
        box('escalated', 'Escalated', { index: 4, end: true }),
        { id: 'sc-end', name: '', parent: null, shape: 'end' },
      ],
      groups: [],
      edges: [
        { from: 'submitted', to: 'second-review', dir: 'out', label: 'needs second review', style: {} },
        { from: 'submitted', to: 'approved', dir: 'out', label: 'auto approve', heavy: true, style: {} },
        { from: 'second-review', to: 'escalated', dir: 'out', label: 'escalate to legal counsel', style: {} },
        { from: 'sc-start', to: 'submitted', dir: 'out', style: {} },
        { from: 'escalated', to: 'sc-end', dir: 'out', style: {} },
      ],
    };
    const sizes = Object.assign(Object.create(null), {
      'sc-start': { w: 14, h: 14, kind: 'start' }, submitted: { w: 127, h: 40, kind: 'box' }, 'second-review': { w: 163, h: 40, kind: 'box' },
      approved: { w: 118, h: 40, kind: 'box' }, escalated: { w: 127, h: 40, kind: 'box' }, 'sc-end': { w: 20, h: 20, kind: 'end' },
    });
    const opts = { labelSizes: { 0: { w: 145, h: 16 }, 1: { w: 96, h: 16 }, 2: { w: 187, h: 16 } }, stage: { w: 1072, h: 440 }, maxScale: 1.25 };
    const wrapped = graphLayoutKernel().layout(m, sizes, { ...opts, wrap: true }, globalThis.__latticeDagre);
    const plain = graphLayoutKernel().layout(m, sizes, opts, globalThis.__latticeDagre);
    assert.ok(plain.scale >= 0.8 && plain.scale < 1.25 / 1.12, `dagre draws it at ${plain.scale}: legible, and under the cap, so a grid could beat it`);
    assert.equal(wrapped.lines ?? 1, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(wrapped.nodes)), JSON.parse(JSON.stringify(plain.nodes)));
  });
});

describe('graph charts — a composite\'s blockquote is never dropped', () => {
  const md = (cls) => `<!-- _class: ${cls} -->\n\n## X.\n\n- Active\n  > GROUPNOTE\n  - Draft\n    > DRAFTNOTE\n    - -> Done\n- Done\n`;
  for (const cls of ['state-chart', 'flowchart']) {
    test(`${cls}: it rides on the composite's first state, led by its name`, () => {
      const html = String(engine.render(md(cls)).html);
      assert.match(html, /Active: GROUPNOTE/);
      assert.match(html, /DRAFTNOTE/);
    });
  }
  test('the narration says it too', () => {
    const said = require('../../../lib/core/chart-narration').narrateStateChart(md('state-chart'));
    assert.match(said, /Active: GROUPNOTE/);
    assert.match(said, /From Draft, it goes to Done\./);
  });
});

describe('graph chart CSS — light-dark() takes colors, never a percentage', () => {
  // `light-dark(8%, 16%)` inside color-mix is invalid at computed-value time, so the whole
  // declaration falls back: an SVG fill went black in light AND dark (composite boxes).
  test('no stylesheet under lib/ hands light-dark() a bare number', () => {
    const bad = [];
    const walk = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (e.name.endsWith('.css')) fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (/light-dark\(\s*-?[\d.]/.test(l)) bad.push(`${path.relative(ROOT, p)}:${i + 1}`); });
      }
    };
    walk(path.join(ROOT, 'lib'));
    assert.deepEqual(bad, []);
  });
});
