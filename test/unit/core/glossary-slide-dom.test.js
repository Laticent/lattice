/**
 * Unit: the glossary slide's DOM mirror (lib/core/glossary-slide.js) and its
 * parity with the markdown-it token path.
 *
 * The generated Glossary slide is authored as a nested list and RENDERS as a
 * two-column table plus an `A – N` range pill. Both transforms were engine-only,
 * so an Export-to-Marp bundle showed the glossary as a bare bullet list — after
 * a separate bug had removed the slide from the export entirely (#1256).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const kernel = require('../../../lib/core/glossary-slide');
const latticeEngine = require('../../../lib/engine');

const LIST = '<ul>'
  + '<li>ARR<ul><li>Revenue a business can reliably expect to recur every year.</li></ul></li>'
  + '<li>NDR<ul><li>The share of last year\'s revenue kept and expanded.</li></ul></li>'
  + '</ul>';
const dom = (inner, cls = 'glossary') =>
  new JSDOM(`<article><section class="${cls}"><h2>Glossary</h2>${inner}</section></article>`).window.document;

describe('glossary slide — applyToDom', () => {
  test('converts the nested list into the two-column table', () => {
    const doc = dom(LIST);
    kernel.applyToDom(doc);
    const section = doc.querySelector('section.glossary');
    assert.ok(!section.querySelector('ul'), 'the source list is gone');
    assert.deepEqual(
      [...section.querySelectorAll('thead th')].map((th) => th.textContent),
      ['Term', 'Definition'],
    );
    const rows = [...section.querySelectorAll('tbody tr')];
    assert.equal(rows.length, 2);
    assert.equal(rows[0].children[0].innerHTML, '<strong>ARR</strong>');
    assert.match(rows[0].children[1].textContent, /^Revenue a business/);
  });

  test('appends the A – N range pill to the heading', () => {
    const doc = dom(LIST);
    kernel.applyToDom(doc);
    const pill = doc.querySelector('h2 .range-pill');
    assert.ok(pill, 'the heading gained a range pill');
    assert.equal(pill.textContent, 'A – N');
    assert.match(doc.querySelector('h2').textContent, /Glossary A – N$/);
  });

  test('a single-letter range collapses to one character', () => {
    const doc = dom('<ul><li>ARR<ul><li>d1</li></ul></li><li>ACV<ul><li>d2</li></ul></li></ul>');
    kernel.applyToDom(doc);
    assert.equal(doc.querySelector('.range-pill').textContent, 'A');
  });

  test('unwraps the <p> markdown-it adds to a loose list item', () => {
    const doc = dom('<ul><li><p>ARR</p><ul><li><p>Recurring revenue.</p></li></ul></li></ul>');
    kernel.applyToDom(doc);
    const cells = doc.querySelectorAll('tbody tr td');
    assert.equal(cells[0].innerHTML, '<strong>ARR</strong>');
    assert.equal(cells[1].innerHTML, 'Recurring revenue.');
  });

  test('keeps an already-bold term as authored rather than double-wrapping', () => {
    const doc = dom('<ul><li><strong>ARR</strong><ul><li>d</li></ul></li></ul>');
    kernel.applyToDom(doc);
    assert.equal(doc.querySelector('tbody td').innerHTML, '<strong>ARR</strong>');
  });

  test('is idempotent — table not rebuilt, pill not re-stamped', () => {
    const doc = dom(LIST);
    kernel.applyToDom(doc);
    const once = doc.querySelector('section.glossary').innerHTML;
    kernel.applyToDom(doc);
    kernel.applyToDom(doc);
    assert.equal(doc.querySelector('section.glossary').innerHTML, once);
    assert.equal(doc.querySelectorAll('.range-pill').length, 1);
  });

  test('leaves a non-glossary section alone', () => {
    const doc = dom(LIST, 'content');
    assert.doesNotThrow(() => kernel.applyToDom(doc));
    assert.ok(doc.querySelector('section.content ul'), 'the list survives untouched');
    assert.equal(doc.querySelector('.range-pill'), null);
  });

  test('survives a null / non-DOM root, and a slide with no list', () => {
    assert.doesNotThrow(() => kernel.applyToDom(null));
    assert.doesNotThrow(() => kernel.applyToDom({}));
    const doc = dom('<p>Nothing to define.</p>');
    assert.doesNotThrow(() => kernel.applyToDom(doc));
    assert.equal(doc.querySelector('.range-pill'), null);
  });
});

describe('glossary slide — the two render paths agree', () => {
  test("the DOM mirror reproduces the engine's table and pill", () => {
    const deck = [
      '---', 'marp: true', 'theme: indaco', '---', '',
      '<!-- _class: glossary -->', '',
      '## Glossary', '',
      '- ARR', "  - Revenue a business can reliably expect to recur every year.",
      '- NDR', "  - The share of last year's revenue kept and expanded.", '',
    ].join('\n');
    const engineHtml = latticeEngine.createEngine().render(deck).html;

    const doc = dom(LIST);
    kernel.applyToDom(doc);
    const section = doc.querySelector('section.glossary');

    // Same row content, same term markup, same pill text.
    const engineRows = [...engineHtml.matchAll(/<tr><td>([\s\S]*?)<\/td><td>([\s\S]*?)<\/td><\/tr>/g)]
      .map((m) => [m[1], m[2]]);
    const domRows = [...section.querySelectorAll('tbody tr')]
      .map((tr) => [tr.children[0].innerHTML, tr.children[1].innerHTML]);
    assert.deepEqual(domRows, engineRows);

    const enginePill = engineHtml.match(/<span class="range-pill">([^<]*)<\/span>/);
    assert.ok(enginePill, 'the engine emitted a range pill');
    assert.equal(section.querySelector('.range-pill').textContent, enginePill[1]);
  });
});
