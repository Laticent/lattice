/**
 * Unit: lib/runtime/chart-redraw.js reads a bar chart's source back from its own rendered marks, so the
 * fluid viewer can redraw it for a new box with nothing added to the export.
 *
 * Each case draws a chart with the engine's own kernel (lib/transformers/chart-frame.js
 * `transformChartSection`, the export's call), reads it back with `readBar`, draws THAT, and checks the
 * second drawing names and values the same marks as the first. Plus the HARD RULE #22 arm: a label that
 * looks like markup is read back as text and redrawn as text.
 * engineering/decisions/2026-11-03-responsive-tables.md §"Charts redraw on demand".
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { transformChartSection } = require('../../../lib/transformers/chart-frame');
const { readBar } = require('../../../lib/runtime/chart-redraw');

/** Draw `list` as a bar chart of `cls` and return its `.chart-body` in a DOM. */
function draw(list, cls = 'bar', view) {
  const out = transformChartSection(`<h2>Chart</h2>${list}`, cls, undefined, view, null, undefined);
  assert.ok(out.transformed, 'the kernel drew the chart');
  const dom = new JSDOM(`<section class="${cls} chart-frame">${out.html}</section>`);
  return dom.window.document.querySelector('.chart-body');
}
/** The marks a drawing shows: label, value and series hue, in order. */
const marksOf = (body) => [...body.querySelectorAll('rect[data-mark]')].map((m) => [m.dataset.label, m.dataset.value, m.dataset.hue]);

describe('chart-redraw: a bar chart is read back from its marks', () => {
  test('a one-series chart round-trips, notes included', () => {
    const first = draw('<ul><li>North America <code>$4.2M</code><ul><li>Two renewals</li></ul></li><li>EMEA <code>$3.1M</code></li></ul>');
    const list = readBar(first);
    assert.match(list, /North America <code>\$4\.2M<\/code><ul><li>/, 'the note is kept as a placeholder for the exported node');
    const second = draw(list, 'bar', { w: 200, h: 300 });
    assert.deepEqual(marksOf(second), marksOf(first));
    assert.equal(second.querySelectorAll('template.chart-detail').length, 1, 'the redrawn chart still has its one note');
  });

  test('a grouped chart round-trips, its series named by the key', () => {
    const first = draw('<ul><li>Americas<ul><li>Plan <code>3.2</code></li><li>Actual <code>3.9</code></li></ul></li><li>EMEA<ul><li>Plan <code>2.6</code></li><li>Actual <code>3.1</code></li></ul></li></ul>', 'bar grouped');
    const list = readBar(first);
    assert.match(list, /<li>Americas<ul><li>Plan <code>3\.2<\/code><\/li><li>Actual <code>3\.9<\/code><\/li><\/ul><\/li>/);
    assert.deepEqual(marksOf(draw(list, 'bar grouped', { w: 200, h: 300 })), marksOf(first));
  });

  test('a diverging chart is one series, though it paints by sign', () => {
    const first = draw('<ul><li>Renewal rate <code>+2.4</code></li><li>FX exposure <code>-2.9</code></li></ul>', 'bar diverging row');
    assert.ok(new Set(marksOf(first).map((m) => m[2])).size > 1, 'the fixture really paints two hues');
    const list = readBar(first);
    assert.ok(list, 'read back, not refused for want of a key');
    assert.deepEqual(marksOf(draw(list, 'bar diverging row', { w: 200, h: 300 })), marksOf(first));
  });

  test('a forged label redraws as text, not markup', () => {
    const forged = '<img src=x onerror="alert(1)">';
    const esc = forged.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const first = draw(`<ul><li>${esc} <code>1</code></li><li>B <code>2</code></li></ul>`);
    assert.equal(first.querySelector('rect[data-mark]').dataset.label, forged, 'the export decodes it to the raw string');
    const second = draw(readBar(first), 'bar', { w: 200, h: 300 });
    assert.equal(second.querySelector('img'), null, 'no element was made from the label');
    assert.equal(second.querySelector('rect[data-mark]').dataset.label, forged, 'it is still the same label, as text');
  });

  test('a chart with a focus or a callout keeps the exported drawing: the marks cannot carry them', () => {
    for (const cls of ['lat-focus', 'lat-recede', 'legend-target', 'legend-text']) {
      const body = draw('<ul><li>A <code>1</code></li><li>B <code>2</code></li></ul>');
      const el = body.querySelector('rect[data-mark]');
      el.setAttribute('class', `${el.getAttribute('class') || ''} ${cls}`);
      assert.equal(readBar(body), null, `refused: ${cls}`);
    }
  });

  test('a category labeled but not drawn (a value that does not parse) keeps the exported drawing', () => {
    const body = draw('<ul><li>North <code>--5</code></li><li>South <code>3</code></li><li>East <code>4</code></li></ul>');
    assert.equal(body.querySelectorAll('rect[data-mark]').length, 2, 'the fixture really drops North\'s bar');
    assert.equal(readBar(body), null, 'refused: a redraw would lose North and renumber the rest');
  });

  test('two categories named alike, one undrawn, keep the exported drawing (a note would move bars)', () => {
    const body = draw('<ul><li>North <code>3</code><ul><li>a</li></ul></li><li>North <code>--5</code><ul><li>b</li></ul></li><li>South <code>2</code><ul><li>c</li></ul></li></ul>');
    assert.deepEqual([...body.querySelectorAll('rect[data-mark]')].map((m) => m.dataset.mark), ['0', '2'], 'the fixture leaves a gap at 1');
    assert.equal(readBar(body), null);
  });

  test('a gap in the drawn bars keeps the exported drawing, even with no label to show it', () => {
    const body = draw('<ul><li>A <code>1</code></li><li>B <code>2</code></li><li>C <code>3</code></li></ul>');
    const second = body.querySelector('rect[data-mark="1"]');
    second.remove();
    for (const t of body.querySelectorAll('text[data-label="B"]')) t.remove(); // a label dropped for space
    assert.equal(readBar(body), null);
  });

  test('a grouped chart with a note keeps the exported drawing: the note has no place to go back to', () => {
    const body = draw('<ul><li>Americas<ul><li>Plan <code>3.2</code></li><li>Actual <code>3.9</code></li></ul></li><li>EMEA<ul><li>Plan <code>2.6</code></li><li>Actual <code>3.1</code></li></ul></li></ul>', 'bar grouped');
    const tpl = body.ownerDocument.createElement('template');
    tpl.className = 'chart-detail';
    tpl.setAttribute('data-mark', '0');
    body.append(tpl);
    assert.equal(readBar(body), null);
  });

  test('a series the key cannot name keeps the exported drawing', () => {
    const first = draw('<ul><li>A<ul><li>Plan <code>1</code></li><li>Actual <code>2</code></li></ul></li></ul>', 'bar grouped');
    for (const k of first.querySelectorAll('text.chart-key-label')) k.remove();
    assert.equal(readBar(first), null);
  });
});
