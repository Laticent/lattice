/**
 * Regression guard for the Form-migration audit's Key Insight / Annotation /
 * Universal Heat Overlay finding (engineering/decisions/2026-07-09-form-
 * migration-audit.md): masthead-lift (lib/forms/cell/masthead/masthead.
 * transform.js) wraps a Form slide's flow body into `<div class="cell-stage">`
 * for every STAGE_MIGRATED layout, but lib/base/base.modifiers.css's
 * "auto-detected" universal chrome (Key Insight blockquote panel, the
 * Marp-preview raw-form Annotation footnote, the Universal Heat Overlay) used
 * only a direct-child-of-<section> selector, so it silently stopped matching
 * once the body moved one level deeper.
 *
 * Two layers of proof, matching the audit's own verification method (HARD
 * RULE #23 — a synthetic harness alone isn't verification):
 *   1. jsdom `element.matches()` against the exact selector text, confirming
 *      the `.cell-stage` arm reaches the wrapped shape (and that redline/
 *      inventory, which ship their own dedicated cell-stage treatment, stay
 *      excluded from the generic Key Insight arm).
 *   2. A real `lib/engine.render()` of Form-default markdown, asserting the
 *      actual rendered HTML carries the class the CSS keys on.
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

// The exact `.cell-stage`-aware Key Insight panel selector (base.modifiers.css).
const KEY_INSIGHT_STAGE =
  'section:not(.quote):not(.math):not(.citation-card):not(.redline):not(.inventory):not([class*="layout-"]) > .cell-stage > blockquote';

// The exact `.cell-stage`-aware Heat Overlay selector for the "pass" state.
const HEAT_STAGE_UL = 'section.heat > .cell-stage > ul > li.state.pass';

// The exact `.cell-stage`-aware raw-form Annotation selector.
const ANNOTATION_STAGE =
  'section.cards-grid > .cell-stage > :is(ul, ol, blockquote, table) + p:has(> em:only-child)';

describe('Key Insight panel reaches through .cell-stage', () => {
  test('matches a blockquote wrapped in .cell-stage under a plain layout', () => {
    const bq = el(
      '<section class="cards-grid form"><div class="cell-stage"><ul><li>a</li></ul><blockquote><p>q</p></blockquote></div></section>',
    ).querySelector('blockquote');
    assert.ok(bq.matches(KEY_INSIGHT_STAGE));
  });

  test('does not match redline (already ships its own cell-stage blockquote CSS)', () => {
    const bq = el(
      '<section class="redline form"><div class="cell-stage"><blockquote><p>q</p></blockquote></div></section>',
    ).querySelector('blockquote');
    assert.ok(!bq.matches(KEY_INSIGHT_STAGE));
  });

  test('does not match inventory (already ships its own cell-stage blockquote CSS)', () => {
    const bq = el(
      '<section class="inventory form"><div class="cell-stage"><blockquote><p>q</p></blockquote></div></section>',
    ).querySelector('blockquote');
    assert.ok(!bq.matches(KEY_INSIGHT_STAGE));
  });

  test('still excludes quote/math/citation-card the same as the original rule', () => {
    for (const cls of ['quote', 'math', 'citation-card']) {
      const bq = el(
        `<section class="${cls} form"><div class="cell-stage"><blockquote><p>q</p></blockquote></div></section>`,
      ).querySelector('blockquote');
      assert.ok(!bq.matches(KEY_INSIGHT_STAGE), `should still exclude ${cls}`);
    }
  });

  test('a real Form-default cards-grid render nests the blockquote in .cell-stage', () => {
    const md = `---\ntheme: indaco\n---\n\n<!-- _class: cards-grid -->\n\n## Insight.\n\n- Row\n  - detail\n\n> The takeaway.\n`;
    const out = html(md);
    assert.match(out, /<div class="cell-stage">[\s\S]*<blockquote>[\s\S]*<\/blockquote>[\s\S]*<\/div>/);
  });
});

describe('Universal Heat Overlay reaches through .cell-stage', () => {
  test('matches a state <li> inside a <ul> wrapped in .cell-stage', () => {
    const li = el(
      '<section class="heat checklist form"><div class="cell-stage"><ul><li class="state pass">x</li></ul></div></section>',
    ).querySelector('li');
    assert.ok(li.matches(HEAT_STAGE_UL));
  });

  test('a real Form-default checklist+heat render wraps its <ul> in .cell-stage', () => {
    const md = '---\ntheme: indaco\n---\n\n<!-- _class: checklist heat -->\n\n## Readiness.\n\n- [x] Done.\n- [ ] Open.\n';
    const out = html(md);
    assert.match(out, /<div class="cell-stage">\s*<ul>[\s\S]*li class="state/);
  });
});

describe('Annotation (raw-form) reaches through .cell-stage', () => {
  test('matches a trailing italic <p> after a list wrapped in .cell-stage', () => {
    const p = el(
      '<section class="cards-grid form"><div class="cell-stage"><ul><li>a</li></ul><p><em>Source: x</em></p></div></section>',
    ).querySelector('p');
    assert.ok(p.matches(ANNOTATION_STAGE));
  });

  test('a real Form-default cards-grid render keeps the annotation reachable', () => {
    const md = '---\ntheme: indaco\n---\n\n<!-- _class: cards-grid -->\n\n## Insight.\n\n- Row\n  - detail\n\n*Source: pilot.*\n';
    const out = html(md);
    assert.match(out, /<div class="cell-stage">[\s\S]*<p><em>Source: pilot\.<\/em><\/p>\s*<\/div>/);
  });
});
