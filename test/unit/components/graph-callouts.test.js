/**
 * Unit: callouts on the two charts the browser lays out, the flowchart and the state chart
 * (design note engineering/decisions/2026-10-20-callout-placement.md § 12).
 *
 * The server half names each note's shape or state (it knows the names) and carries the notes in the model
 * payload. The browser pass places them, because the boxes exist only after the layout: the adapter's
 * sanitizer, `extent` and `paint` are what this holds, with the real placer and a hand-made geometry. The
 * serialized export bootstrap is held in `test/unit/trama/serialization.test.js`.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');

const engine = require('../../../lib/engine');
const { flowchartAdapter, browserJs: flowchartBrowserJs, htmlHasCallouts: fcHas } = require('../../../lib/components/chart/flowchart/flowchart.layout');
const { stateChartAdapter, browserJs: stateBrowserJs, htmlHasCallouts: scHas } = require('../../../lib/components/chart/state-chart/state-chart.layout');
const { placeCallouts } = require('../../../lib/components/chart/_chart-family/callout-browser');

const render = (cls, body) => String(engine.render(`<!-- _class: ${cls} -->\n\n## A flow.\n\n${body}\n`).html);
const modelOf = (html, attr) => {
  const m = new RegExp(`data-${attr}-model="([^"]*)"`).exec(html);
  assert.ok(m, 'the figure carries its model');
  return JSON.parse(m[1].replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&amp;/g, '&'));
};
const descOf = (html) => (/<desc[^>]*>([\s\S]*?)<\/desc>/.exec(html) || [])[1] || '';

const FLOW = '- Alert `pill` => Triage => Page\n- Page `fail` => Close\n';

describe('flowchart and state chart — the server half carries the notes', () => {
  for (const [cls, attr, units, body] of [
    ['flowchart', 'fc', 'shapes', FLOW],
    ['state-chart', 'sc', 'states', '- Idle => Running => Done\n- Running => Failed\n'],
  ]) {
    const target = cls === 'flowchart' ? ['Page', 'Close'] : ['Running', 'Failed'];
    const note = `\`@callout{[{Pages the secondary, for=${target[0]}, detail="Then the manager."}, {Slowest, for=${target[1]}}, {Orphan note, for=Nowhere}]}\``;

    test(`${cls}: each note names the index of its ${units.slice(0, -1)}, and the side rides along`, () => {
      const model = modelOf(render(cls, `${body}\n${note}`), attr);
      const names = model[units === 'shapes' ? 'shapes' : 'states'].map((x) => x.name);
      assert.deepEqual(model.callouts.map((c) => c.text), ['Pages the secondary', 'Slowest']);
      assert.deepEqual(model.callouts.map((c) => names[c.mark]), target);
      assert.equal(model.callouts[0].detail, 'Then the manager.');
      assert.equal(model.calloutSide, 'under');
    });

    test(`${cls}: the paragraph is lifted, the description says what is drawn and what names nothing`, () => {
      const html = render(cls, `${body}\n${note}`);
      assert.ok(!/@callout/.test(html), 'no callout source is left on the slide');
      const said = descOf(html);
      assert.match(said, /Callouts: Pages the secondary \(/);
      assert.match(said, /Not drawn: "Orphan note"/);
    });

    test(`${cls}: no callout, no change: no field, no description line`, () => {
      const html = render(cls, body);
      assert.equal('callouts' in modelOf(html, attr), false);
      assert.ok(!/Callouts:/.test(descOf(html)));
      assert.equal((cls === 'flowchart' ? fcHas : scHas)(html), false);
    });

    test(`${cls}: htmlHasCallouts finds a figure that carries notes, for the export to ship the placer`, () => {
      assert.equal((cls === 'flowchart' ? fcHas : scHas)(render(cls, `${body}\n${note}`)), true);
    });

    test(`${cls}: side=beside rides in the payload; the detail joins the card`, () => {
      const html = render(cls, `${body}\n\`@callout{side=beside, [{Why, for=${target[0]}, detail="Because."}]}\``);
      assert.equal(modelOf(html, attr).calloutSide, 'beside');
      assert.match(html, /class="chart-detail"[\s\S]*Because\./);
    });
  }

  test('the state chart\'s inline variant has no pass to place notes in, so it keeps the author\'s words', () => {
    const html = render('state-chart inline', `- Idle => Running\n\n\`@callout{[{Why, for=Running}]}\``);
    assert.match(html, /@callout\{/, 'the paragraph stays on the slide');
    assert.match(html, /class="state-chart-figure"[^>]*data-variant="inline"/, 'and the chart is still drawn');
  });
});

describe('the browser half: sanitize, extent, paint', () => {
  const geo = {
    width: 400, height: 200,
    nodes: { a: { x: 10, y: 80, w: 100, h: 40, cx: 60, cy: 100 }, b: { x: 150, y: 80, w: 100, h: 40, cx: 200, cy: 100 }, c: { x: 290, y: 80, w: 100, h: 40, cx: 340, cy: 100 } },
  };
  // What `measure` returns, as far as the notes read it: the chart's own label sizes.
  const measured = { fontPx: { a: 15, b: 15, c: 15 }, tiles: { a: { font: 15 }, b: { font: 15 }, c: { font: 15 } } };
  const fig = (attr, model) => ({ getAttribute: (k) => (k === `data-${attr}-model` ? JSON.stringify(model) : null) });
  const flow = (extra) => ({
    shapes: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }], groups: [], edges: [], ...extra,
  });

  for (const [name, adapterOf, attr, key] of [['flowchart', flowchartAdapter, 'fc', 'shapes'], ['state chart', stateChartAdapter, 'sc', 'states']]) {
    const body = (extra) => (key === 'states' ? { states: flow().shapes, groups: [], edges: [], ...extra } : flow(extra));
    const model = (extra) => adapterOf().readModel(fig(attr, body(extra)));

    test(`${name}: a forged model keeps only notes that name a real shape, capped at six, as text`, () => {
      const forged = Array.from({ length: 9 }, (_, i) => ({ text: `n${i}`, mark: i % 3 }));
      forged.push({ text: 'bad', mark: 99 }, { text: 'bad', mark: -1 }, { mark: 1 }, { text: '<img onerror=x>', mark: 1, plate: 'pill"x', color: 99, size: 'lg' });
      const m = model({ callouts: forged, calloutSide: 'sideways' });
      assert.equal(m.callouts.length, 6);
      assert.ok(m.callouts.every((c) => c.mark >= 0 && c.mark < 3));
      assert.equal(m.calloutSide, 'under', 'a side that is neither under nor beside is ignored');
      const odd = model({ callouts: [{ text: '<img onerror=x>', mark: 1, plate: 'pill"x', color: 99, size: 'lg' }] }).callouts[0];
      assert.equal(odd.text, '<img onerror=x>', 'text stays text; the placer escapes it where it draws');
      assert.equal('plate' in odd, false, 'a plate outside the closed spelling is dropped');
      assert.equal('color' in odd, false, 'a color outside 1 to 8 is dropped');
    });

    test(`${name}: a plate or size outside the closed lists is dropped, including names an object inherits`, () => {
      const m = model({ callouts: [{ text: 'a', mark: 0, plate: 'constructor', size: 'xl' }, { text: 'b', mark: 1, plate: '__proto__', size: 'toString' }, { text: 'c', mark: 2, plate: 'pill', size: 'lg' }] });
      assert.deepEqual(m.callouts.map((c) => [c.plate, c.size]), [[undefined, undefined], [undefined, undefined], ['pill', 'lg']]);
    });

    test(`${name}: notes under the figure grow it, and paint adds them after the shapes`, () => {
      const a = adapterOf();
      const m = model({ callouts: [{ text: 'Slow step', mark: 1 }], calloutSide: 'under' });
      const ctx = { callouts: placeCallouts };
      const ext = a.extent(m, geo, ctx, measured);
      assert.equal(ext.w, 400);
      assert.ok(ext.h > 200, `${ext.h} > 200: the notes take a row under the figure`);
      assert.deepEqual(a.extent(m, geo, ctx, measured), ext, 'pure: the fit asks in every round');
    });

    test(`${name}: with no placer, or no notes, the figure is the laid-out graph`, () => {
      const a = adapterOf();
      const noted = model({ callouts: [{ text: 'Slow step', mark: 1 }] });
      assert.deepEqual(a.extent(noted, geo, {}, measured), { w: 400, h: 200 }, 'a host with no placer draws no notes');
      assert.deepEqual(a.extent(model({}), geo, { callouts: placeCallouts }, measured), { w: 400, h: 200 });
    });

    test(`${name}: beside sets the notes to the right and leaves the height`, () => {
      const m = model({ callouts: [{ text: 'Slow step', mark: 1 }], calloutSide: 'beside' });
      const ext = adapterOf().extent(m, geo, { callouts: placeCallouts }, measured);
      assert.ok(ext.w > 400, `${ext.w} > 400`);
      assert.equal(ext.h, 200);
    });
  }
});

describe('the export embeds the placer once, for a deck with notes on both charts', () => {
  test('one bundle in the exported page, and both passes still get the placer option', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const { execFileSync } = require('node:child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gc-'));
    const deck = path.join(dir, 'd.md');
    fs.writeFileSync(deck, `---\nmarp: true\ntheme: indaco\n---\n\n<!-- _class: flowchart -->\n\n## A\n\n- One => Two\n\n\`@callout{[{n, for=Two}]}\`\n\n---\n\n<!-- _class: state-chart -->\n\n## B\n\n- Idle => Done\n\n\`@callout{[{n, for=Done}]}\`\n`);
    execFileSync('node', [path.join(__dirname, '..', '..', '..', 'lattice.js'), deck, path.join(dir, 'd.html')], { stdio: 'pipe' });
    const html = fs.readFileSync(path.join(dir, 'd.html'), 'utf8');
    assert.equal((html.match(/globalThis\.__latticeCalloutPlace=/g) || []).length, 1, 'the placer bundle is in the page once');
    assert.equal((html.match(/callouts:function\(s\)\{var f=globalThis\.__latticeCalloutPlace/g) || []).length, 2, 'each pass reads it');
  });
});

describe('the export bootstrap carries the placer only when asked', () => {
  test('without callouts the script is byte for byte what it was; with them it reads the placer off globalThis', () => {
    for (const browserJs of [flowchartBrowserJs, stateBrowserJs]) {
      const plain = browserJs();
      assert.ok(!plain.includes('__latticeCalloutPlace'));
      assert.equal(browserJs({ callouts: false }), plain);
      const withNotes = browserJs({ callouts: true });
      assert.match(withNotes, /__latticeCalloutPlace/);
      assert.doesNotThrow(() => new Function(withNotes), 'the script parses');
    }
  });

  test('the placer bundle is self-contained and sets the one global', () => {
    const { CALLOUT_BROWSER_IIFE } = require('../../../lib/core/callout-browser-bundle.generated.js');
    const g = {};
    new Function('globalThis', `${CALLOUT_BROWSER_IIFE}`)(g);
    const out = g.__latticeCalloutPlace({ callouts: [{ text: 'Hi', mark: 0 }], ids: ['a'], nodes: { a: { x: 0, y: 0, w: 50, h: 20, cx: 25, cy: 10 } }, view: { w: 100, h: 40 } });
    assert.ok(out.drawn === 1 && out.h > 40);
  });
});

describe('the notes follow the chart\'s own type size', () => {
  const geo = { width: 400, height: 200, nodes: { a: { x: 10, y: 80, w: 100, h: 40, cx: 60, cy: 100 } } };
  const model = { shapes: [{ id: 'a', name: 'A' }], groups: [], edges: [], callouts: [{ text: 'A note that wraps onto a second row of notes', mark: 0 }] };
  test('a larger label size takes a taller figure, so the notes keep their size against the labels', () => {
    const a = flowchartAdapter();
    const small = a.extent(model, geo, { callouts: placeCallouts }, { fontPx: { a: 9 } });
    const large = a.extent(model, geo, { callouts: placeCallouts }, { fontPx: { a: 30 } });
    assert.ok(large.h > small.h, `${large.h} > ${small.h}`);
  });
});

describe('lint:deck judges a callout on these charts against their shapes', () => {
  const { lintText, buildVocab } = require('../../../lib/authoring/lint');
  const legendFindings = (cls, body) => lintText(`---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n## A flow.\n\n${body}\n`, { vocab: buildVocab() })
    .filter((f) => f.rule === 'legend-span');

  test('a note naming a shape of a row that holds three shapes is not reported', () => {
    assert.deepEqual(legendFindings('flowchart', '- Alert => Triage => Page\n\n`@callout{[{Slow, for=Triage}]}`'), []);
    assert.deepEqual(legendFindings('state-chart', '- Idle => Running => Done\n\n`@callout{[{Slow, for=Running}]}`'), []);
  });

  test('a note naming nothing is reported, with the shapes listed one by one', () => {
    const [f] = legendFindings('flowchart', '- Alert => Triage => Page\n\n`@callout{[{Slow, for=Nowhere}]}`');
    assert.ok(f, 'reported');
    assert.match(f.message, /The marks are Alert, Triage, Page\./);
  });
});
