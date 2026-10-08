/**
 * Unit tests for journey's applyToDom (DOM-walk path), via the chart-family
 * transformer it was folded into.
 *
 * journey is a chart-frame member: the chart-family transformer's applyToDom
 * dispatches to journey.transformJourneySection (the same kernel lattice.js (via lib/engine)
 * and lattice.js use), rewrites the nested <ul> into a .journey-board,
 * and wraps the section in the chart-frame skeleton. These tests verify the
 * delegation produces the framed DOM and is idempotent.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const chartFamily = require('../../../lib/transformers/chart-family');

function makeDoc(bodyHtml) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  return dom.window.document;
}

describe('journey.applyToDom (via chart-family)', () => {
  test('rewrites a journey section\'s outer <ul> into a framed .journey-board', () => {
    const doc = makeDoc(`
      <section class="journey">
        <h2>Customer onboarding</h2>
        <ul>
          <li>Evaluate
            <ul>
              <li>Read case study <code>prospect</code> <code>1</code></li>
            </ul>
          </li>
          <li>Trial
            <ul>
              <li>Trial signup <code>prospect</code> <code>3</code></li>
            </ul>
          </li>
        </ul>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const section = doc.querySelector('section.journey');
    assert.ok(section.classList.contains('chart-frame'), 'section tagged chart-frame');
    const board = section.querySelector('.chart-body > .journey-board');
    assert.ok(board, 'journey-board nested in chart-body');
    // The board carries a journey-stages row (one entry per top-level li).
    const sections = board.querySelectorAll('.journey-stages > li');
    assert.ok(sections.length >= 1, 'at least one section ribbon');
  });

  test('passes through non-journey sections', () => {
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
      <section class="journey">
        <h2>Test</h2>
        <ul>
          <li>Phase A
            <ul><li>Task <code>actor</code> <code>3</code></li></ul>
          </li>
        </ul>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const once = doc.querySelector('section.journey').innerHTML;
    chartFamily.applyToDom(doc);
    const twice = doc.querySelector('section.journey').innerHTML;
    assert.equal(twice, once);
  });

  test('skips sections whose <ul> is missing', () => {
    const doc = makeDoc(`<section class="journey"><h2>Empty</h2></section>`);
    const before = doc.querySelector('section.journey').innerHTML;
    chartFamily.applyToDom(doc);
    const after = doc.querySelector('section.journey').innerHTML;
    assert.equal(after, before, 'no-ul section unchanged');
  });

  test('safely returns on null / non-DOM root', () => {
    assert.doesNotThrow(() => chartFamily.applyToDom(null));
    assert.doesNotThrow(() => chartFamily.applyToDom(undefined));
    assert.doesNotThrow(() => chartFamily.applyToDom({}));
  });
});
