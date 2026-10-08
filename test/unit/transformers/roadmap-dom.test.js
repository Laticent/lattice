/**
 * Unit tests for roadmap's applyToDom (DOM-walk path), via the chart-family
 * transformer it was folded into.
 *
 * roadmap is a chart-frame member: the chart-family transformer's applyToDom
 * dispatches to roadmap.transformRoadmapSection (the same HTML-string kernel
 * lattice.js (via lib/engine) uses) — tagging the table's cells and,
 * under the `horizons` variant, transposing the table into phase cards — then
 * wraps the figure in .roadmap-figure inside the chart-frame skeleton. These
 * tests run in jsdom (the lattice-runtime.js path) and assert the framed DOM.
 * Each fixture carries an <h2> because the chart-frame wrap keys off it.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const chartFamily = require('../../../lib/transformers/chart-family');

function makeDoc(bodyHtml) {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  return dom.window.document;
}

describe('roadmap.applyToDom — Status (cell state markers)', () => {
  function statusDoc(cell) {
    return makeDoc(`
      <section class="roadmap"><h2>Plan</h2><table><tbody>
        <tr><td>API</td><td>${cell}</td></tr>
      </tbody></table></section>
    `);
  }

  test('frames the section and wraps the table in .roadmap-figure', () => {
    const doc = statusDoc('[x] auth module');
    chartFamily.applyToDom(doc);
    const section = doc.querySelector('section.roadmap');
    assert.ok(section.classList.contains('chart-frame'), 'section tagged chart-frame');
    assert.ok(section.querySelector('.chart-body > .roadmap-figure > table'),
      'table wrapped in .roadmap-figure inside .chart-body');
  });

  test('tags [x] cell with state-shipped + Shipped label', () => {
    const doc = statusDoc('[x] auth module');
    chartFamily.applyToDom(doc);
    const td = doc.querySelectorAll('section.roadmap td')[1];
    assert.ok(td.classList.contains('cell-state'),    'cell-state class added');
    assert.ok(td.classList.contains('state-shipped'), 'state-shipped class added');
    assert.equal(td.querySelector('.cell-state-label').textContent, 'Shipped');
    assert.equal(td.querySelector('.cell-state-text').textContent.trim(), 'auth module');
  });

  test('tags [-] → state-wip / In flight', () => {
    const doc = statusDoc('[-] migration');
    chartFamily.applyToDom(doc);
    const td = doc.querySelectorAll('section.roadmap td')[1];
    assert.ok(td.classList.contains('state-wip'));
    assert.equal(td.querySelector('.cell-state-label').textContent, 'In flight');
  });

  test('tags [ ] → state-planned / Planned', () => {
    const doc = statusDoc('[ ] discovery');
    chartFamily.applyToDom(doc);
    const td = doc.querySelectorAll('section.roadmap td')[1];
    assert.ok(td.classList.contains('state-planned'));
    assert.equal(td.querySelector('.cell-state-label').textContent, 'Planned');
  });

  test('tags [/] → state-skipped / Out of scope', () => {
    const doc = statusDoc('[/] dropped feature');
    chartFamily.applyToDom(doc);
    const td = doc.querySelectorAll('section.roadmap td')[1];
    assert.ok(td.classList.contains('state-skipped'));
    assert.equal(td.querySelector('.cell-state-label').textContent, 'Out of scope');
  });

  test('leaves the workstream label column (first td) alone', () => {
    const doc = makeDoc(`
      <section class="roadmap"><h2>Plan</h2><table><tbody>
        <tr><td>[x] looks like a marker</td><td>real cell</td></tr>
      </tbody></table></section>
    `);
    chartFamily.applyToDom(doc);
    const firstTd = doc.querySelector('section.roadmap td');
    assert.ok(!firstTd.classList.contains('cell-state'),
      'first td (workstream label) must not be tagged');
    assert.match(firstTd.textContent, /\[x\]/, 'first td text unchanged');
  });

  test('skips cells without a marker', () => {
    const doc = statusDoc('plain text');
    chartFamily.applyToDom(doc);
    const td = doc.querySelectorAll('section.roadmap td')[1];
    assert.ok(!td.classList.contains('cell-state'));
  });
});

describe('roadmap.applyToDom — Horizons (table → three-card grid)', () => {
  test('transposes a 3-phase × 2-workstream table into three horizon cards', () => {
    const doc = makeDoc(`
      <section class="roadmap horizons"><h2>Plan</h2>
        <table>
          <thead><tr><th>Workstream</th><th>Now</th><th>Next</th><th>Later</th></tr></thead>
          <tbody>
            <tr><td>API</td><td>auth</td><td>quotas</td><td>—</td></tr>
            <tr><td>UI</td><td>onboarding</td><td>—</td><td>theming</td></tr>
          </tbody>
        </table>
      </section>
    `);
    chartFamily.applyToDom(doc);
    assert.ok(doc.querySelector('section.roadmap .chart-body > .roadmap-figure > .horizons'),
      '.horizons grid wrapped in .roadmap-figure inside .chart-body');
    const cards = doc.querySelectorAll('.horizons .horizon-card');
    assert.equal(cards.length, 3, 'three horizon cards (one per phase)');
    assert.equal(cards[0].querySelector('.horizon-title').textContent, 'Now');
    assert.equal(cards[0].querySelector('.horizon-eyebrow').textContent, 'Phase 01');
    assert.equal(cards[2].querySelector('.horizon-eyebrow').textContent, 'Phase 03');
    // Each card holds one row per workstream.
    assert.equal(cards[0].querySelectorAll('li').length, 2);
  });

  test('lifts a trailing <code> in a phase header into .horizon-meta', () => {
    const doc = makeDoc(`
      <section class="roadmap horizons"><h2>Plan</h2>
        <table>
          <thead><tr><th>WS</th><th>Now <code>Q3</code></th></tr></thead>
          <tbody><tr><td>API</td><td>cell</td></tr></tbody>
        </table>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const card = doc.querySelector('.horizon-card');
    assert.equal(card.querySelector('.horizon-title').textContent.trim(), 'Now');
    assert.equal(card.querySelector('.horizon-meta').textContent, 'Q3');
  });

  test('renders em-dash and "-" placeholder cells with .row-empty', () => {
    const doc = makeDoc(`
      <section class="roadmap horizons"><h2>Plan</h2>
        <table>
          <thead><tr><th>WS</th><th>P1</th></tr></thead>
          <tbody>
            <tr><td>A</td><td>—</td></tr>
            <tr><td>B</td><td>-</td></tr>
            <tr><td>C</td><td>real text</td></tr>
          </tbody>
        </table>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const items = doc.querySelectorAll('.horizon-card li .row-text');
    assert.ok(items[0].classList.contains('row-empty'));
    assert.ok(items[1].classList.contains('row-empty'));
    assert.ok(!items[2].classList.contains('row-empty'));
  });
});

describe('roadmap.applyToDom — guards', () => {
  test('idempotent: a second pass is a no-op (Status)', () => {
    const doc = makeDoc(`
      <section class="roadmap"><h2>Plan</h2><table><tbody>
        <tr><td>WS</td><td>[x] ship</td></tr>
      </tbody></table></section>
    `);
    chartFamily.applyToDom(doc);
    const before = doc.querySelector('section.roadmap').innerHTML;
    chartFamily.applyToDom(doc);
    const after = doc.querySelector('section.roadmap').innerHTML;
    assert.equal(after, before, 'second pass should not mutate');
  });

  test('idempotent: a second pass is a no-op (Horizons)', () => {
    const doc = makeDoc(`
      <section class="roadmap horizons"><h2>Plan</h2>
        <table>
          <thead><tr><th>WS</th><th>P</th></tr></thead>
          <tbody><tr><td>A</td><td>cell</td></tr></tbody>
        </table>
      </section>
    `);
    chartFamily.applyToDom(doc);
    const before = doc.querySelector('section.roadmap').innerHTML;
    chartFamily.applyToDom(doc);
    const after = doc.querySelector('section.roadmap').innerHTML;
    assert.equal(after, before);
  });

  test('safely returns on null / non-DOM root', () => {
    assert.doesNotThrow(() => chartFamily.applyToDom(null));
    assert.doesNotThrow(() => chartFamily.applyToDom(undefined));
    assert.doesNotThrow(() => chartFamily.applyToDom({}));
  });

  test('non-roadmap sections are left untouched', () => {
    const doc = makeDoc(`
      <section class="content"><h2>plain</h2><p>nothing.</p></section>
    `);
    const before = doc.querySelector('section.content').outerHTML;
    chartFamily.applyToDom(doc);
    const after = doc.querySelector('section.content').outerHTML;
    assert.equal(after, before);
  });
});
