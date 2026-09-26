// TAP PROXIES — a label that names one chart mark carries `data-mark-for="i"`, and the reveal
// layer (docs/src/playground/chart-interact.js) opens mark i's card when the label is tapped or
// hovered. The one thing that can go wrong is the INDEX: a proxy that names the wrong mark opens
// the wrong card, which is worse than no proxy at all. So every case here renders a real chart
// through the chart-family dispatcher and checks each proxy against the mark it claims to name.
//
// The legend cases are the ones an earlier draft got wrong by matching legend rows to marks in
// the reveal layer (by position, then by text): a map legend row with no value shifted every
// value after it by one, two pie slices with the same name both opened the first, and a series
// legend (radar, line) mapped series to unrelated axes or quarters. The kernel now stamps the row
// only when it knows which mark the row names, and these cases pin that.
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const chartFamily = require('../../../lib/transformers/chart-family');

function render(cls, html) {
  const dom = new JSDOM(`<!doctype html><body><div class="lattice"><section class="${cls}"><h2>S</h2>${html}</section></div></body>`);
  const doc = dom.window.document;
  chartFamily.applyToDom(doc);
  return doc.querySelector('section');
}

// A wrapped label is split across <tspan> lines; read it the way the reveal layer does.
const text = (el) => {
  const spans = el.querySelectorAll('tspan');
  return (spans.length ? [...spans].map((s) => s.textContent.trim()).join(' ') : el.textContent).replace(/\s+/g, ' ').trim();
};
const proxies = (sec) => [...sec.querySelectorAll('[data-mark-for]')];
const marksAt = (sec, i) => [...sec.querySelectorAll(`[data-mark="${i}"]:not(template)`)];
const labelOf = (sec, i) => marksAt(sec, i).map((m) => m.getAttribute('data-label')).find((l) => l != null);

// Every proxy must name a mark that exists.
function assertAllResolve(sec) {
  const list = proxies(sec);
  assert.ok(list.length > 0, 'expected at least one tap proxy');
  for (const p of list) {
    const i = p.getAttribute('data-mark-for');
    assert.ok(marksAt(sec, i).length > 0, `proxy "${text(p)}" names mark ${i}, which does not exist`);
  }
  return list;
}

describe('tap proxies name the right mark', () => {
  test('pie: each legend row names its own wedge, even when two names repeat', () => {
    const sec = render('piechart', '<ul><li>Other <code>40%</code></li><li>Other <code>35%</code></li><li>Core <code>25%</code></li></ul>');
    const labels = [...sec.querySelectorAll('.chart-key-label')];
    const values = [...sec.querySelectorAll('.chart-key-value')];
    assert.deepEqual(labels.map((l) => l.getAttribute('data-mark-for')), ['0', '1', '2']);
    assert.deepEqual(values.map((v) => v.getAttribute('data-mark-for')), ['0', '1', '2']);
    assertAllResolve(sec);
  });

  test('map: a legend row and its value name the region they list, when the legend is sorted and a row has no value', () => {
    const sec = render('map highlight', '<ul><li>Germany</li><li>Japan <code>31.0</code></li><li>Brazil <code>27.5</code></li></ul>');
    for (const p of assertAllResolve(sec)) {
      const i = p.getAttribute('data-mark-for');
      const mark = marksAt(sec, i)[0];
      if (p.classList.contains('chart-key-label')) {
        assert.equal(text(p), mark.getAttribute('data-label'), `legend row "${text(p)}" opens ${mark.getAttribute('data-label')}`);
      } else {
        assert.equal(text(p), mark.getAttribute('data-value'), `legend value "${text(p)}" opens ${mark.getAttribute('data-label')}`);
      }
    }
  });

  test('map: a value-sorted choropleth legend still names each region by its own mark', () => {
    const sec = render('map', '<ul><li>Kenya <code>4.2</code></li><li>Brazil <code>2.2</code></li><li>India <code>2.8</code></li><li>Nigeria <code>3.1</code></li></ul>');
    for (const p of assertAllResolve(sec).filter((x) => x.classList.contains('chart-key-label'))) {
      assert.equal(text(p), labelOf(sec, p.getAttribute('data-mark-for')));
    }
  });

  test('a legend of SERIES stays inert: radar, line and stacked-bar key rows name no single mark', () => {
    const radar = render('radar', '<ul><li>Teacher<ul><li>Calculus <code>9</code></li><li>Geometry <code>7</code></li><li>Algebra <code>8</code></li></ul></li>'
      + '<li>Student<ul><li>Calculus <code>7</code></li><li>Geometry <code>8</code></li><li>Algebra <code>9</code></li></ul></li></ul>');
    const line = render('line', '<ul><li>Q1<ul><li>North <code>1</code></li><li>South <code>2</code></li></ul></li>'
      + '<li>Q2<ul><li>North <code>2</code></li><li>South <code>3</code></li></ul></li></ul>');
    const stacked = render('stacked-bar', '<ul><li>FY24<ul><li>Licenses <code>19</code></li><li>Services <code>9</code></li></ul></li>'
      + '<li>FY25<ul><li>Licenses <code>20</code></li><li>Services <code>15</code></li></ul></li></ul>');
    for (const sec of [radar, line, stacked]) {
      assert.equal(sec.querySelectorAll('.chart-key-label[data-mark-for], .chart-key-value[data-mark-for]').length, 0);
    }
    // A stacked-bar's CATEGORY labels do name a mark: every segment in band i carries
    // `data-mark="i"` and the reveal card is per bar, so the name opens its bar's card.
    for (const p of assertAllResolve(stacked)) {
      assert.ok(p.classList.contains('cart-cat') || p.classList.contains('sbar-total'), `only a bar's name or total is a proxy, not ${p.getAttribute('class')}`);
    }
  });

  test('bar: each category name and value names its own bar, in columns, rows and groups', () => {
    const cols = render('bar', '<ul><li>North America <code>$4.1M</code></li><li>LATAM <code>$1.2M</code></li><li>EMEA <code>$6.8M</code></li></ul>');
    const rows = render('bar row', '<ul><li>North America <code>$4.1M</code></li><li>LATAM <code>$1.2M</code></li><li>EMEA <code>$6.8M</code></li></ul>');
    const grouped = render('bar', '<ul><li>FY24<ul><li>Licenses <code>19</code></li><li>Services <code>9</code></li></ul></li>'
      + '<li>FY25<ul><li>Licenses <code>20</code></li><li>Services <code>15</code></li></ul></li></ul>');
    for (const sec of [cols, rows, grouped]) {
      const list = assertAllResolve(sec);
      const cats = list.filter((p) => p.classList.contains('cart-cat'));
      assert.equal(cats.length, sec === grouped ? 2 : 3);
      for (const p of cats) assert.equal(p.getAttribute('data-label'), labelOf(sec, p.getAttribute('data-mark-for')));
    }
    // A value printed beside a single-series bar names that bar.
    for (const p of proxies(cols).filter((q) => q.classList.contains('cart-value'))) {
      assert.equal(text(p), marksAt(cols, p.getAttribute('data-mark-for'))[0].getAttribute('data-value'));
    }
  });

  test('bullet: each KPI name and readout names its own measure', () => {
    const sec = render('bullet', '<ul><li>Revenue <code>4.2M</code> <code>5.0M</code></li><li>Margin <code>3.6M</code> <code>3.0M</code></li></ul>');
    for (const p of assertAllResolve(sec)) {
      if (p.classList.contains('bullet-name')) assert.equal(text(p), labelOf(sec, p.getAttribute('data-mark-for')));
    }
  });

  test('slope: an entity\'s name and both values name its line', () => {
    const sec = render('slope', '<ul><li>Northwind<ul><li>2023 <code>31%</code></li><li>2026 <code>24%</code></li></ul></li>'
      + '<li>Kestrel<ul><li>2023 <code>22%</code></li><li>2026 <code>29%</code></li></ul></li></ul>');
    for (const p of assertAllResolve(sec)) {
      const i = p.getAttribute('data-mark-for');
      const t = text(p);
      const line = marksAt(sec, i)[0];
      assert.ok(t === line.getAttribute('data-label') || line.getAttribute('data-value').includes(t),
        `slope label "${t}" names mark ${i} (${line.getAttribute('data-label')})`);
    }
  });

  test('funnel: each stage\'s name and value name its band', () => {
    const sec = render('funnel', '<ul><li>Discovery <code>312</code></li><li>Qualified <code>196</code></li><li>Closed <code>44</code></li></ul>');
    for (const p of assertAllResolve(sec)) {
      const band = marksAt(sec, p.getAttribute('data-mark-for'))[0];
      assert.ok([band.getAttribute('data-label'), band.getAttribute('data-value')].includes(text(p)),
        `funnel label "${text(p)}" names ${band.getAttribute('data-label')}`);
    }
  });

  test('waterfall: each category label names its own bar', () => {
    const sec = render('waterfall', '<ul><li>Plan <code>12.0M</code></li><li>Price <code>+1.4M</code></li><li>Volume <code>-0.8M</code></li><li>Actual <code>12.6M</code></li></ul>');
    const cats = assertAllResolve(sec).filter((p) => p.classList.contains('cart-cat'));
    assert.equal(cats.length, 4);
    for (const p of cats) {
      assert.equal(p.getAttribute('data-label'), labelOf(sec, p.getAttribute('data-mark-for')));
    }
  });

  test('quadrant: each dot\'s name names that dot', () => {
    const sec = render('quadrant', '<p><code>[{Effort, 0..10}, {Reach, 0..100}]</code></p><ul><li>Bets<ul><li>Scoring model <code>3, 70</code></li></ul></li>'
      + '<li>Wins<ul><li>Weekly brief <code>8, 80</code></li></ul></li><li>Sinks<ul><li>Board export <code>9, 28</code></li></ul></li></ul>');
    for (const p of assertAllResolve(sec)) {
      assert.equal(text(p), labelOf(sec, p.getAttribute('data-mark-for')));
    }
  });

  test('a proxy is never a mark: no element carries both attributes', () => {
    const decks = [
      render('slope', '<ul><li>A<ul><li>x <code>1</code></li><li>y <code>2</code></li></ul></li></ul>'),
      render('funnel', '<ul><li>A <code>3</code></li><li>B <code>2</code></li></ul>'),
      render('piechart', '<ul><li>A <code>60%</code></li><li>B <code>40%</code></li></ul>'),
    ];
    for (const sec of decks) assert.equal(sec.querySelectorAll('[data-mark-for][data-mark]').length, 0);
  });
});
