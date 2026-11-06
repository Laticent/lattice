/**
 * The host's flicker protections for a deferred figure (lib/plugins/host-browser.mjs `settleSwap`, engineering/decisions/
 * 2026-11-06-plugin-patterns.md §5): a remembered drawing comes back in the swap's microtask, and an in-place edit holds
 * the outgoing drawing until the new one is drawn. Each guard has a test that fails without it.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { installHydrateHost, releaseFigure } = require('../../../lib/plugins/host-browser.mjs');
const { figureScopeKey } = require('../../../lib/plugins/figure-scope.mjs');

const fig = (config, cls = 'content') =>
  `<section class="${cls}"><div class="plot" data-lattice-hydrate="plot" data-lattice-config="${config}" data-lattice-settle="pending"></div></section>`;

function setup({ memory = true } = {}) {
  const win = new JSDOM(`<!doctype html><body><div class="lattice">${fig('QQ==')}</div></body>`).window;
  const draws = [];
  const plot = {
    name: 'plot',
    budgetMs: 1000,
    hydrate(el) {
      draws.push(el.getAttribute('data-lattice-config'));
      // APPENDS, as a charting library drawing into its target may: a held drawing left in place would sit beside it.
      const svg = el.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('data-drawn', el.getAttribute('data-lattice-config'));
      el.appendChild(svg);
    },
  };
  const host = installHydrateHost(win, [plot], { fromBase64: (b) => b, releaseFigure, ...(memory ? { scopeKey: figureScopeKey } : {}) });
  host.run();
  return { win, doc: win.document, host, draws };
}

/** The host's typing write: one slide replaced by a new one, as the preview's patch does. */
function swap(doc, html) {
  const lattice = doc.querySelector('.lattice');
  const out = lattice.firstElementChild;
  const tpl = doc.createElement('template');
  tpl.innerHTML = html;
  const arrived = tpl.content.firstElementChild;
  lattice.replaceChild(arrived, out);
  return [{ addedNodes: [arrived], removedNodes: [out] }];
}
const figure = (doc) => doc.querySelector('[data-lattice-hydrate="plot"]');

describe('the host remembers a finished drawing', () => {
  test('the same figure on a replaced slide gets its drawing back in the swap, with no draw', () => {
    const { doc, host, draws } = setup();
    const records = swap(doc, fig('QQ=='));
    host.settleSwap(records, null);
    assert.equal(figure(doc).getAttribute('data-lattice-settle'), 'rendered');
    assert.equal(figure(doc).querySelector('svg').getAttribute('data-drawn'), 'QQ==');
    host.run();
    assert.deepEqual(draws, ['QQ=='], 'a remembered figure is not drawn again');
  });

  test('a slide whose colors differ misses: the drawing is never reused across scopes', () => {
    const { doc, host } = setup();
    host.settleSwap(swap(doc, fig('QQ==', 'content dark')), null);
    assert.equal(figure(doc).getAttribute('data-lattice-settle'), 'pending');
  });

  test('no scope key, no memory: the serialized CLI page behaves as before', () => {
    const { doc, host, draws } = setup({ memory: false });
    host.settleSwap(swap(doc, fig('QQ==')), 'in-place');
    assert.equal(figure(doc).getAttribute('data-lattice-settle'), 'pending');
    assert.equal(figure(doc).firstChild, null);
    host.run();
    assert.deepEqual(draws, ['QQ==', 'QQ==']);
  });
});

describe('an in-place edit holds the outgoing drawing', () => {
  test('a changed config shows the old drawing, stays pending, and is drawn over', () => {
    const { doc, host, draws } = setup();
    host.settleSwap(swap(doc, fig('Qg==')), 'in-place');
    const el = figure(doc);
    assert.equal(el.getAttribute('data-lattice-settle'), 'pending');
    assert.equal(el.querySelector('svg').getAttribute('data-drawn'), 'QQ==', 'the old drawing is on screen');
    assert.ok(el.hasAttribute('data-lattice-held'));
    host.run();
    assert.deepEqual(draws, ['QQ==', 'Qg==']);
    assert.equal(el.querySelectorAll('svg').length, 1, 'the held drawing is cleared before an in-page draw');
    assert.equal(el.querySelector('svg').getAttribute('data-drawn'), 'Qg==');
    assert.ok(!el.hasAttribute('data-lattice-held'));
  });

  test('a navigation (no in-place stamp) holds nothing', () => {
    const { doc, host } = setup();
    host.settleSwap(swap(doc, fig('Qg==')), null);
    assert.equal(figure(doc).firstChild, null);
  });

  test('a slide whose colors changed holds nothing', () => {
    const { doc, host } = setup();
    host.settleSwap(swap(doc, fig('Qg==', 'content dark')), 'in-place');
    assert.equal(figure(doc).firstChild, null);
  });

  test('a slide that gained a figure holds nothing: positions would shift', () => {
    const { doc, host } = setup();
    host.settleSwap(swap(doc, fig('Qg==').replace('</section>', '<div data-lattice-hydrate="plot" data-lattice-config="Qw==" data-lattice-settle="pending"></div></section>')), 'in-place');
    for (const el of doc.querySelectorAll('[data-lattice-hydrate="plot"]')) assert.equal(el.firstChild, null);
  });

  test('an author cannot forge the held mark: the engine renames it', () => {
    const { refuseAuthorMarkup } = require('../../../lib/plugins/author-markup.js');
    assert.doesNotMatch(refuseAuthorMarkup('<div data-lattice-held>'), /data-lattice-held/);
  });
});

describe('fast typing', () => {
  test('a figure still drawing when the next key lands donates its drawing', () => {
    const { doc, host } = setup();
    figure(doc).setAttribute('data-lattice-settle', 'hydrating'); // the previous keystroke's frame draw is in flight
    host.settleSwap(swap(doc, fig('Qg==')), 'in-place');
    assert.equal(figure(doc).querySelector('svg').getAttribute('data-drawn'), 'QQ==');
  });
  test('an error state donates nothing: its text is not a drawing', () => {
    const { doc, host } = setup();
    figure(doc).setAttribute('data-lattice-settle', 'error');
    host.settleSwap(swap(doc, fig('Qg==')), 'in-place');
    assert.equal(figure(doc).firstChild, null);
  });
});
