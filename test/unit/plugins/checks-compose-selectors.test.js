/**
 * The components that CONTAIN a check style it through the composer's markup: obligation-matrix
 * heat grounds a `pills` cell by `td:has(> .lat-pill > .lat-pill-lead > .state.X)`, verdict-grid
 * strikes a `[/]` criterion by `.lat-pill:has(> .lat-pill-lead > .lat-state.skip)`, and pricing lays
 * a feature out as a row by `li:has(> .lat-state:first-child)`. A `:has()` that stops matching fails
 * SILENTLY (the cell just loses its ground; engineering/decisions/2026-10-18-checks.md §17 lost every
 * heat ground this way once), so this pins each component's selector, read from its own stylesheet,
 * to what lib/plugins/checks/shared/compose.js actually writes, on both of its paths.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { composeHtml, composeElement } = require('../../../lib/plugins/checks/shared/compose.js');
const { CHECKS } = require('../../../lib/plugins/checks/shared/registry.js');

const css = (rel) => fs.readFileSync(path.join(__dirname, '../../..', rel), 'utf8');
const { document } = new JSDOM('<body></body>').window;

/** Every `<host>:has(<arg>)` in a stylesheet whose argument reaches into a composed check. */
function hasSelectors(file, host) {
  const out = new Set();
  for (const m of css(file).matchAll(new RegExp(`${host.replace('.', '\\.')}:has\\(((?:[^()]|\\([^()]*\\))*)\\)`, 'g'))) {
    for (const alt of m[1].split(/,\s*/)) if (/lat-pill-lead|lat-state/.test(alt)) out.add(alt.trim());
  }
  return [...out];
}

/** `el.matches(':has(<rel>)')`, asked as the equivalent `:scope` query: jsdom's selector engine
 *  does not take a relative selector of more than one step inside `:has()`. */
const has = (el, rel) => el.querySelector(`:scope ${rel}`) !== null;

/** The composed check in a host element, written by the string path and by the DOM path. */
function hosts(tag, marker, container) {
  const fromHtml = document.createElement(tag);
  fromHtml.innerHTML = composeHtml(marker, 'Residency', container);
  const fromDom = document.createElement(tag);
  fromDom.append(...composeElement(document, marker, 'Residency', container));
  return [fromHtml, fromDom];
}

describe('component selectors match the composer\'s markup', () => {
  test('obligation-matrix heat grounds a pills cell for every answer it grounds', () => {
    const sels = hasSelectors('lib/components/legal/obligation-matrix/obligation-matrix.styles.css', 'td').filter((s) => s.includes('lat-pill'));
    assert.ok(sels.length >= 4, 'the heat-ground selectors moved');
    for (const sel of sels) {
      const id = /\.state\.([a-z]+)$/.exec(sel)[1];
      const row = CHECKS.find((r) => r.id === id);
      for (const td of hosts('td', row.marker, 'pill')) {
        assert.ok(has(td, sel), `${sel} misses the composed ${id} pill`);
        for (const other of CHECKS.filter((r) => r.id !== id)) {
          assert.ok(!has(hosts('td', other.marker, 'pill')[0], sel), `${sel} also grounds ${other.id}`);
        }
      }
    }
  });

  test('verdict-grid strikes the [/] criterion pill, and no other', () => {
    const [sel] = hasSelectors('lib/components/comparison/verdict-grid/verdict-grid.styles.css', '.lat-pill');
    assert.ok(sel, 'the skip-strike selector moved');
    for (const row of CHECKS) {
      for (const li of hosts('li', row.marker, 'pill')) {
        assert.equal(has(li.firstElementChild, sel), row.id === 'skip', `${row.id}: ${sel}`);
      }
    }
  });

  test('pricing lays out every composed row, and strikes only [/]', () => {
    const sels = hasSelectors('lib/components/comparison/pricing/pricing.styles.css', 'li');
    const rowSel = sels.find((s) => s === '> .lat-state:first-child');
    const skipSel = sels.find((s) => s.includes('.skip'));
    assert.ok(rowSel && skipSel, `the row selectors moved: ${sels}`);
    for (const r of CHECKS) {
      for (const li of hosts('li', r.marker, 'row')) {
        assert.ok(has(li, rowSel), `${r.id} is not laid out as a row`);
        assert.equal(has(li, skipSel), r.id === 'skip', `${r.id}: ${skipSel}`);
      }
    }
  });
});
