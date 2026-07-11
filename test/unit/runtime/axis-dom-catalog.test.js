/**
 * Unit: lib/runtime/axis-dom-catalog.generated.js is not just DECLARED, it is
 * VERIFIED — for every component that has a `density.axis`, render its
 * manifest `sample` through the real engine and confirm the resolved
 * selector (the catalog's explicit `domSelector` override, or the universal
 * per-axis default from lib/core/collections.js) actually finds live DOM
 * elements. This is the regression guard against a FUTURE component quietly
 * becoming a "retagged" case (like split-compare/kanban/timeline-list/
 * glossary) without anyone updating its manifest's `domSelector` — silence
 * here means the Fix-Me overlay drill-down would find nothing and fall back
 * to a coarser highlight with no error, no test failure, just a quietly
 * worse feature. See
 * engineering/decisions/2026-07-10-overflow-cause-highlighting.md §10.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { loadAll } = require('../../../lib/components');
const engine = require('../../../lib/engine');
const catalog = require('../../../lib/runtime/axis-dom-catalog.generated.js');
const { domItemElements, domRowElements } = require('../../../lib/core/collections');

describe('axis-dom catalog resolves against real rendered DOM', () => {
  const manifests = loadAll().filter((m) => m.density?.axis);

  test('the catalog has an entry for every density-bearing manifest', () => {
    for (const m of manifests) {
      assert.ok(catalog[m.name], `missing catalog entry for "${m.name}" — rerun npm run axis-dom-catalog:build`);
    }
  });

  // Red-team finding (2026-07-11, post-merge adversarial review of PR #892):
  // every kanban card text field is CSS-truncated
  // (kanban.styles.css: `.kanban-title-text{-webkit-line-clamp:2}`,
  // `.kanban-card-body{text-overflow:ellipsis}`), so a card's word count is
  // decoupled from its rendered height — Case B (the density-budget
  // fallback, §12) can never be RIGHT about kanban, only misleading. This
  // locks in tools/build-axis-dom-catalog.js's `NO_CASE_B` exclusion so a
  // future catalog regen can't silently drop it.
  test('kanban is excluded from Case B (soft/hard null) while Case A drill-down stays intact', () => {
    assert.equal(catalog.kanban.hard, null);
    assert.equal(catalog.kanban.soft, null);
    assert.equal(catalog.kanban.axis, 'item');
    assert.equal(catalog.kanban.domSelector, '.kanban-cards > .kanban-card');
  });

  for (const m of manifests) {
    test(`${m.name}: axis "${m.density.axis}" resolves to >=1 live element from its sample deck`, () => {
      const { html } = engine.render(m.sample);
      const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
      const sec = dom.window.document.querySelector('section');
      assert.ok(sec, `${m.name}'s sample must render at least one <section>`);

      const entry = catalog[m.name];
      let els;
      if (entry.domSelector) {
        els = [...sec.querySelectorAll(entry.domSelector)];
      } else if (entry.axis === 'item') {
        els = domItemElements(sec);
      } else if (entry.axis === 'row') {
        els = domRowElements(sec);
      } else {
        els = []; // col/cell/line have no DOM-path finder yet — nothing to assert
      }

      if (entry.axis === 'item' || entry.axis === 'row') {
        assert.ok(
          els.length >= 1,
          `expected >=1 "${entry.axis}" element for "${m.name}"` +
            (entry.domSelector ? ` via override "${entry.domSelector}"` : ' via the universal default') +
            `, got ${els.length} — if this component's own transform now retags its axis elements, ` +
            'add/update density.domSelector in its manifest and rerun npm run axis-dom-catalog:build.',
        );
      }
    });
  }
});
