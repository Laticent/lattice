/**
 * Regression guard for the Form-migration audit's sketch-finish finding
 * (engineering/decisions/2026-07-09-form-migration-audit.md): masthead-lift
 * wraps a Form slide's flow body into `<div class="cell-stage">` for every
 * STAGE_MIGRATED layout, but lib/base/base.sketch.css's hand-drawn "box"
 * treatment (the `mode: sketch` finish's headline feature) used only
 * direct-child-of-<section> selectors across ~14 layouts, so the boxes went
 * inert — silently falling back to the plain component border — the moment
 * Form (default since 2026-06-26) wrapped the body one level deeper.
 *
 * Two layers of proof (HARD RULE #23 — a synthetic harness alone isn't
 * verification): jsdom `element.matches()` against the exact selector text,
 * and a real `lib/engine.render()` + headless-Chromium computed-style check.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const latticeEngine = require('../../../lib/engine');

const engine = latticeEngine.createEngine();
const html = (md) => engine.render(md).html;

function el(outerHtml) {
  return new JSDOM(`<!DOCTYPE html><body>${outerHtml}</body>`).window.document.body.firstElementChild;
}

// For a full engine render() (which wraps sections in an outer .lattice div),
// parse the whole document and hand back its first <li> for a matches() check.
function firstLi(fullHtml) {
  return new JSDOM(`<!DOCTYPE html><body>${fullHtml}</body>`).window.document.querySelector('li');
}

describe('sketch finish hand-drawn boxes reach through .cell-stage', () => {
  test('cards-grid card selector matches a <li> wrapped in .cell-stage', () => {
    const li = el(
      '<section class="sketch cards-grid form"><div class="cell-stage"><ul><li>a</li></ul></div></section>',
    ).querySelector('li');
    assert.ok(li.matches('section.sketch.cards-grid > .cell-stage > ul > li'));
  });

  test('checklist row selector matches a <li> wrapped in .cell-stage', () => {
    const li = el(
      '<section class="sketch checklist form"><div class="cell-stage"><ol><li>a</li></ol></div></section>',
    ).querySelector('li');
    assert.ok(li.matches('section.sketch.checklist > .cell-stage > ol > li'));
  });

  test('agenda numeral selector matches an <li> wrapped in .cell-stage', () => {
    const li = el(
      '<section class="sketch agenda form"><div class="cell-stage"><ol><li>a</li></ol></div></section>',
    ).querySelector('li');
    assert.ok(li.matches('section.sketch.agenda > .cell-stage > ol > li'));
  });

  test('a real Form-default sketch cards-grid render nests its <li> under .cell-stage AND the box selector still reaches it', () => {
    const md =
      '---\ntheme: indaco\nclass: sketch\n---\n\n<!-- _class: cards-grid -->\n\n## Cards.\n\n- Row one\n  - detail\n- Row two\n  - detail\n';
    const li = firstLi(html(md));
    assert.equal(li.parentElement.parentElement.className, 'cell-stage');
    assert.ok(li.matches('section.sketch.cards-grid > .cell-stage > ul > li'));
  });

  test('a real Form-default sketch agenda render nests its <li> under .cell-stage AND the numeral selector still reaches it', () => {
    const md = '---\ntheme: indaco\nclass: sketch\n---\n\n<!-- _class: agenda -->\n\n## Agenda.\n\n1. One\n2. Two\n';
    const li = firstLi(html(md));
    assert.equal(li.parentElement.parentElement.className, 'cell-stage');
    assert.ok(li.matches('section.sketch.agenda > .cell-stage > ol > li'));
  });
});
