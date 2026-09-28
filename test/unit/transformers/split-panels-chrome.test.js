/**
 * The running header and footer stay DIRECT children of a split section, on both render
 * paths. Nested inside `.panel-right`, the footer escaped `section.no-footer > footer`
 * (base.variants.css) and the chrome budget in split-panel.styles.css; split-compare's
 * string kernel, which only re-emits the parts it recognizes, dropped the footer outright.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const splitPanels = require('../../../lib/transformers/split-panels');
const kernel = require('../../../lib/core/split-panels');

const BODY = {
  'split-panel': '<p><code>Eyebrow</code></p><h2>Headline</h2><p>Lede.</p><ul><li><strong>Point</strong><ul><li>body</li></ul></li></ul>',
  'split-compare': '<p><code>Frame</code></p><h2>Choice</h2><p>Context.</p><ul><li><strong>A</strong><ul><li>a</li></ul></li><li><strong>B</strong><ul><li>b</li></ul></li></ul><blockquote><p>Pick B.</p></blockquote>',
};

function chromeShape(section) {
  const kids = [...section.children].map(el => el.tagName === 'DIV' ? `div.${el.className}` : el.tagName.toLowerCase());
  return kids;
}

for (const layout of Object.keys(BODY)) {
  const html = `<section class="${layout}"><header>Head</header>${BODY[layout]}<footer>Foot</footer></section>`;
  const left = layout === 'split-panel' ? 'div.panel-left' : 'div.compare-left';
  const right = layout === 'split-panel' ? 'div.panel-right' : 'div.compare-right';

  describe(`${layout} — header and footer stay section children`, () => {
    test('string kernel: header first, footer after both panels, footer kept', () => {
      const out = kernel.applyToRenderedHtml(html);
      const sec = new JSDOM(out).window.document.querySelector('section');
      assert.deepEqual(chromeShape(sec), ['header', left, right, 'footer']);
      assert.equal(sec.querySelector('footer').textContent, 'Foot');
      assert.equal(sec.querySelectorAll('footer').length, 1);
    });

    test('DOM path: the same order', () => {
      const doc = new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
      splitPanels.applyToDom(doc);
      assert.deepEqual(chromeShape(doc.querySelector('section')), ['header', left, right, 'footer']);
    });

    test('no footer authored: nothing invented', () => {
      const bare = html.replace('<footer>Foot</footer>', '');
      const sec = new JSDOM(kernel.applyToRenderedHtml(bare)).window.document.querySelector('section');
      assert.equal(sec.querySelectorAll('footer').length, 0);
    });
  });
}

describe('an author <footer> inside a quote is content, not chrome', () => {
  const quote = '<blockquote><p>We shipped it.</p><footer>— Ada, CTO</footer></blockquote>';
  for (const [layout, body] of [
    ['split-panel', `<h2>H</h2>${quote}<ul><li><strong>P</strong></li></ul>`],
    ['split-panel pullquote', `${quote}<ul><li>P</li></ul>`],
    ['split-compare', `<h2>H</h2><p>C.</p><ul><li><strong>A</strong></li><li><strong>B</strong></li></ul>${quote}`],
  ]) {
    test(`${layout}: the attribution stays in its quote; the running footer is hoisted`, () => {
      const html = `<section class="${layout}"><header>Head</header>${body}<footer>Run</footer></section>`;
      const sec = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
      assert.equal(sec.querySelector(':scope > footer').textContent, 'Run');
      assert.equal(sec.querySelector('blockquote > footer').textContent, '— Ada, CTO');
      assert.equal(sec.querySelectorAll('footer').length, 2);
    });
  }

  test('no running footer: a quote attribution that ends the slide is not taken for one', () => {
    const html = `<section class="split-panel pullquote">${quote}</section>`;
    const sec = new JSDOM(kernel.applyToRenderedHtml(html)).window.document.querySelector('section');
    assert.equal(sec.querySelector(':scope > footer'), null);
    assert.equal(sec.querySelector('blockquote > footer').textContent, '— Ada, CTO');
  });
});

