/**
 * A figure layout's note becomes its caption (engineering/decisions/2026-11-20-coda-and-marp-parity.md, settled 2).
 *
 * `diagram` and `video` declare `coda.caption`: the coda kernel still harvests the trailing paragraph (so the published
 * contract and the lint see a below-note), and lib/transformers/figure-caption.js then moves it into the stage under the
 * figure. Charts caption themselves: lib/transformers/chart-frame.js `noteToCaption` hands the note back to the
 * caption code before the chart draws. Both arms of the figure pass must agree (HARD RULE #1).
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const figure = require('../../../lib/transformers/figure-caption');

const stage = '<div class="cell-stage"><div class="mermaid-svg">fig</div></div>';
const cell = (inner) => `<div class="cell-coda" data-dock="column">${inner}</div>`;
const note = '<div class="below-note"><p>Source: the review.</p></div>';
const insight = '<blockquote><p>k</p></blockquote>';

function bothArms(cls, inner) {
  const html = figure.applyToHtml(`<section class="${cls}">${inner}</section>`);
  const dom = new JSDOM(`<body><section class="${cls}">${inner}</section></body>`);
  figure.applyToDom(dom.window.document);
  return { html, dom: dom.window.document.body.innerHTML };
}
const norm = (s) => s.replace(/>\s+</g, '><').trim();

describe('figure-caption', () => {
  test('a diagram\'s note moves under the figure as its caption; the insight stays in the band', () => {
    const { html, dom } = bothArms('diagram', stage + cell(insight + note));
    for (const out of [html, dom]) {
      assert.match(out, /<div class="mermaid-svg">fig<\/div><p class="figure-caption">Source: the review\.<\/p><\/div>/);
      assert.match(out, /<div class="cell-coda"[^>]*><blockquote>/);
      assert.doesNotMatch(out, /below-note/);
    }
    assert.equal(norm(html), norm(dom));
  });

  test('a band left empty by the move is dropped', () => {
    const { html, dom } = bothArms('video companion', stage + cell(note));
    for (const out of [html, dom]) {
      assert.match(out, /figure-caption/);
      assert.doesNotMatch(out, /cell-coda/);
    }
    assert.equal(norm(html), norm(dom));
  });

  test('the annotation register rides along', () => {
    const ann = '<div class="below-note is-annotation"><p><em>Source.</em></p></div>';
    const { html, dom } = bothArms('diagram', stage + cell(ann));
    for (const out of [html, dom]) assert.match(out, /<p class="figure-caption is-annotation"><em>Source\.<\/em><\/p>/);
  });

  test('a layout without `coda.caption`, and a chart (which captions itself), are left alone', () => {
    for (const cls of ['list', 'bar chart-frame']) {
      const { html, dom } = bothArms(cls, stage + cell(note));
      for (const out of [html, dom]) assert.doesNotMatch(out, /figure-caption/);
    }
  });
});

describe('chart-frame: the note is the chart caption', () => {
  const { transformChartSection } = require('../../../lib/transformers/chart-frame');
  const body = '<h2>Revenue.</h2><ul><li>A <code>$4M</code></li><li>B <code>$2M</code></li></ul>';

  test('a harvested note comes back as the chart caption, inside the stage; the insight stays in the band', () => {
    const out = transformChartSection(body + cell(insight + note), 'bar').html;
    assert.match(out, /<p class="chart-caption"[^>]*>Source: the review\.<\/p>/);
    assert.match(out, /<div class="cell-coda"[^>]*><blockquote><p>k<\/p><\/blockquote><\/div>/);
    assert.doesNotMatch(out, /below-note/);
  });

  test('the same caption as a chart written before the coda kernel existed', () => {
    const viaCoda = transformChartSection(body + cell(note), 'bar').html;
    const direct = transformChartSection(body + '<p>Source: the review.</p>', 'bar').html;
    // A chart numbers its gradient ids per render, so the two renders differ only there.
    const ids = (h) => h.replace(/cart-fill-[a-z-]+-\d+-\d+/g, 'ID');
    assert.equal(ids(viaCoda), ids(direct));
  });
});
