/**
 * Unit tests for word-cloud's applyToDom (DOM-walk path), via the chart-family
 * transformer it was folded into.
 *
 * word-cloud is a chart-frame member: the chart-family transformer's applyToDom
 * dispatches to word-cloud.transformWordCloudSection (the same kernel
 * lattice.js (via lib/engine) uses), rewrites the first <ul> into a
 * .word-cloud-canvas, and wraps the section in the chart-frame skeleton. These
 * tests verify the delegation produces the framed canvas and is idempotent.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const chartFamily = require('../../../lib/transformers/chart-family');

function makeDoc(bodyHtml) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  return dom.window.document;
}

describe('word-cloud.applyToDom (via chart-family)', () => {
  test('rewrites a word-cloud section\'s <ul> into a framed .word-cloud-canvas', () => {
    const doc = makeDoc(`
      <section class="word-cloud">
        <h2>Words by weight</h2>
        <ul>
          <li>component <code>5</code></li>
          <li>manifest <code>4</code></li>
          <li>function <code>3</code></li>
        </ul>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const section = doc.querySelector('section.word-cloud');
    assert.ok(section.classList.contains('chart-frame'), 'section tagged chart-frame');
    const canvas = section.querySelector('.chart-body > .word-cloud-canvas');
    assert.ok(canvas, 'word-cloud-canvas nested in chart-body');
    assert.ok(canvas.querySelector('svg.wc-svg[viewBox="0 0 1100 320"]'),
      'cloud rendered as a viewBox SVG');
    const words = canvas.querySelectorAll('.wc-word');
    assert.equal(words.length, 3, 'three wc-word <text> nodes');
    for (const w of words) {
      const style = w.getAttribute('style') || '';
      assert.ok(w.hasAttribute('x') && w.hasAttribute('y'), `${w.textContent}: x/y set`);
      assert.ok(w.hasAttribute('font-size'),                `${w.textContent}: font-size set`);
      assert.ok(style.includes('--wc-color:'),              `${w.textContent}: --wc-color set`);
    }
  });

  test('passes through non-word-cloud sections', () => {
    const doc = makeDoc(`
      <section class="content"><h2>plain</h2><p>nothing.</p></section>
    `);
    const before = doc.querySelector('section.content').outerHTML;
    chartFamily.applyToDom(doc);
    const after = doc.querySelector('section.content').outerHTML;
    assert.equal(after, before);
  });

  test('idempotent: a second pass is a no-op', () => {
    const doc = makeDoc(`
      <section class="word-cloud">
        <h2>Test</h2>
        <ul>
          <li>alpha <code>4</code></li>
          <li>beta  <code>2</code></li>
        </ul>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const once = doc.querySelector('section.word-cloud').innerHTML;
    chartFamily.applyToDom(doc);
    const twice = doc.querySelector('section.word-cloud').innerHTML;
    assert.equal(twice, once);
  });

  test('respects variant modifier classes (accent)', () => {
    const doc = makeDoc(`
      <section class="word-cloud accent">
        <h2>Accent</h2>
        <ul><li>focus <code>5</code></li><li>tier2 <code>3</code></li></ul>
      </section>
    `);
    chartFamily.applyToDom(doc);
    assert.ok(doc.querySelector('section.word-cloud.accent .word-cloud-canvas'),
      'accent variant still produces canvas wrapper');
  });

  test('safely returns on null / non-DOM root', () => {
    assert.doesNotThrow(() => chartFamily.applyToDom(null));
    assert.doesNotThrow(() => chartFamily.applyToDom(undefined));
    assert.doesNotThrow(() => chartFamily.applyToDom({}));
  });
});
