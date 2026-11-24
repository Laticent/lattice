/**
 * A portrait chart's box on a phone page (engineering/decisions/2026-11-22-tall-canvas-retired.md).
 *
 * Every kind that once read the tall portrait canvas (`ctx.canvasAspect`, retired 2026-11-22) draws on the chart form
 * kernel on a phone page, which sizes the canvas from the slide's own header (`formBoxPx`). This file pins that premise
 * for each of those kinds, the header-driven box, and two fixes the first spine's checker found (2026-11-11):
 * - a keyed quadrant's key grew with a taller plane, widened the drawing to 722 units and shrank the plane's labels;
 * - the column key's cell was priced at the flat glyph average, so a name of wide glyphs ran its value into the
 *   next column.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const MarkdownIt = require('markdown-it');
const { JSDOM } = require('jsdom');
const { transformChartSection } = require('../../../lib/transformers/chart-frame');
const { resetRenderIds } = require('../../../lib/core/render-ids');
const fs = require('node:fs');
const path = require('node:path');
const engine = require('../../../lib/engine');

const md = new MarkdownIt({ html: true });
const doc = (html) => new JSDOM(`<!doctype html><body>${html}</body>`).window.document;
const STORY = 9 / 16;

const LINE = '- Q1 `120`\n- Q2 `180`\n- Q3 `240`\n- Q4 `310`';
const QUAD = '- Quick Wins\n  - Weekly signal digest `{2, 82}`\n  - Slack intake bot `{3, 72}`\n- Strategic Bets\n  - Scoring model v2 `{8, 88}`\n  - Decision-log API `{7, 74}`\n- Defer\n  - Per-team weighting UI `{2, 28}`';

function draw(source, cls, aspect, opts) {
  resetRenderIds('');
  const out = transformChartSection(md.render(source), cls, 'portrait', undefined, null, aspect, opts);
  assert.ok(out.transformed, `${cls} drew`);
  return doc(out.html).querySelector('svg');
}
const viewBox = (svg) => svg.getAttribute('viewBox').split(/\s+/).map(Number);

const FIXED = 'line';

// The kinds whose kernels read the tall canvas before it was retired. Each one's portrait drawing on a phone page must come
// from the chart form kernel (`data-form-box`): a kind that fell off it would draw on the fixed 320 x 300 canvas.
const TALL_READERS = ['bar', 'bullet', 'ep-curve', 'heatmap', 'histogram', 'line', 'quadrant', 'risk-matrix', 'scatter',
  'slope', 'stacked-bar', 'tower', 'waterfall'];

describe('a portrait chart on a phone page takes its box from the chart form kernel', () => {
  for (const kind of TALL_READERS) {
    test(`every ${kind} slide in its gallery draws in a form box at story`, () => {
      const gallery = path.join(__dirname, `../../../lib/plugins/chart-family/kinds/${kind}/${kind}.gallery.md`);
      const src = fs.readFileSync(gallery, 'utf8').replace(/^---\n/, '---\nsize: story\n').replace(/^size: (?!story).*\n/m, '');
      const sections = [...doc(engine.render(src).html).querySelectorAll(`section.chart-frame.${kind}`)];
      assert.ok(sections.length > 0, `${kind}: the gallery has a chart slide`);
      for (const [i, s] of sections.entries()) {
        const svg = s.querySelector('svg[viewBox]');
        if (!svg) continue; // a slide the chart declined
        assert.ok(s.querySelector('svg[data-form-box]'), `${kind} slide ${i + 1}: drawn by the chart form kernel`);
      }
    });
  }
});

describe('the chart form kernel takes a portrait chart\'s box from its own header', () => {
  const plainH = viewBox(draw(`## Revenue grew\n\n${LINE}`, FIXED, STORY))[3];

  for (const [name, source, cls] of [
    ['a source line', `## Revenue grew\n\n${LINE}\n\nSource: finance ledger, FY26.`, FIXED],
    ['a title past one line', `## Revenue grew in every quarter of the year, and fastest in the fourth\n\n${LINE}`, FIXED],
    ['a venue', `## Revenue grew\n\n${LINE}`, `${FIXED} venue-hall`],
  ]) {
    test(`${name} takes its height off the chart's box`, () => {
      const svg = draw(source, cls, STORY);
      const [, , w, h] = viewBox(svg);
      assert.ok(svg.hasAttribute('data-form-box'), `${name}: the kernel drew it`);
      assert.equal(w, 320);
      assert.ok(h < plainH, `${name}: ${h} high, under the plain slide's ${plainH}`);
    });
  }

  test('the box rides on the drawing, and drawing again in it reproduces the export', () => {
    const sourced = draw(`## Revenue grew\n\n${LINE}\n\nSource: finance ledger, FY26.`, 'line', STORY);
    const [bw, bh] = sourced.getAttribute('data-form-box').split(' ').map(Number);
    const again = draw(`## .\n\n${LINE}`, 'line', STORY, { formBoxPx: [bw, bh] });
    assert.deepEqual(viewBox(again), viewBox(sourced));
  });
});

describe('a keyed quadrant on a tall plane keeps the wide plane\'s key type', () => {
  test('the cohort key does not widen the drawing', () => {
    const tall = viewBox(draw(`## Where the bets sit\n\n${QUAD}`, 'quadrant cohort', STORY));
    const fixed = viewBox(draw(`## Where the bets sit\n\n${QUAD}`, 'quadrant cohort', 0.8));
    assert.ok(tall[2] <= fixed[2] + 1, `tall ${tall[2]} wide, the 4:5 drawing ${fixed[2]}: the key did not grow`);
    const fs = (svg) => Math.min(...[...svg.querySelectorAll('text.chart-key-label')].map((t) => Number(t.getAttribute('font-size'))));
    const tallKey = fs(draw(`## Where the bets sit\n\n${QUAD}`, 'quadrant cohort', STORY));
    const fixedKey = fs(draw(`## Where the bets sit\n\n${QUAD}`, 'quadrant cohort', 0.8));
    assert.ok(Math.abs(tallKey - fixedKey) < 0.5, `key type ${tallKey} on the tall plane, ${fixedKey} on the wide one`);
  });
});

describe('the column key prices wide glyphs', () => {
  test('a name of wide glyphs keeps clear of its value', () => {
    const PIE = '- WWWWWWWW MMMM `30%`\n- MMMMMMMM WWWW `25%`\n- WWMMWWMM MMWW `20%`\n- MWMWMWMW WMWM `15%`\n- WMWMWMWM MWMW `10%`';
    const svg = draw(`## Share\n\n${PIE}`, 'piechart', 0.8);
    const labels = [...svg.querySelectorAll('text.chart-key-label')];
    assert.ok(labels.length >= 5, 'the key drew every slice');
    for (const t of labels) {
      const line = t.querySelector('tspan');
      const x = Number(line.getAttribute('x'));
      const fsz = Number(t.getAttribute('font-size'));
      const name = line.textContent;
      const value = svg.querySelector(`text.chart-key-value[data-mark-for="${t.getAttribute('data-mark-for')}"]`);
      assert.ok(value, `"${name}" has its value`);
      const valueLeft = Number(value.getAttribute('x')) - value.textContent.length * fsz * 0.6;
      // W and M paint about 0.9-1.0 of the font size in the clean face (svg-label.js GLYPH_UPPER).
      assert.ok(x + name.length * fsz * 0.9 <= valueLeft + 0.5, `"${name}" ends before its value ${value.textContent}`);
    }
  });
});
