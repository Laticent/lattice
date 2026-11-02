/**
 * lib/transformers/chart-frame.js — what the host frame leaves on the page when a chart kind DECLINES the slide.
 *
 * The frame bridges a claimed `{…}` record row to the spans every kind reads, and a kind may still decline (return
 * null). The author's list then stays on the page, and a record row in it must show the list the old spans would have
 * shown, not its braces or the claim stamp (`bridged`). The checker on #2997 removed that line and the whole suite
 * stayed green; this pins it.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { RECORD_ATTR } = require('../../../lib/core/chart-rows.js');
const frame = require('../../../lib/transformers/chart-frame');

/** Run the frame with `kind`'s drawing replaced by one that declines every slide. */
function declined(kind, inner) {
  const kernel = frame.KERNELS[kind];
  const draw = kernel.transformSection;
  kernel.transformSection = () => null;
  try {
    return frame.transformChartSection(inner, kind);
  } finally {
    kernel.transformSection = draw;
  }
}

test('a declined slide with a claimed record row shows the bridged spans, not the record or its stamp', () => {
  const inner = `<h2>Revenue</h2><ul><li>Alpha <code ${RECORD_ATTR}="">{3}</code></li></ul>`;
  const r = declined('bar', inner);
  assert.equal(r.transformed, false);
  assert.equal(r.bridged, '<h2>Revenue</h2><ul><li>Alpha <code>3</code></li></ul>');
});

test('the same declined slide, through the document walk, writes the bridged list into the section', () => {
  const kernel = frame.KERNELS.bar;
  const draw = kernel.transformSection;
  kernel.transformSection = () => null;
  try {
    const out = frame.applyToRenderedHtml(`<section class="bar"><h2>Revenue</h2><ul><li>Alpha <code ${RECORD_ATTR}="">{3}</code></li></ul></section>`);
    assert.match(out, /<li>Alpha <code>3<\/code><\/li>/);
    assert.doesNotMatch(out, new RegExp(RECORD_ATTR));
  } finally {
    kernel.transformSection = draw;
  }
});

test('a declined slide with no claimed record is left exactly as written', () => {
  const inner = '<h2>Revenue</h2><ul><li>Alpha <code>3</code></li></ul>';
  const r = declined('bar', inner);
  assert.equal(r.transformed, false);
  assert.equal(r.bridged, undefined);
  assert.equal(r.html, inner);
});
