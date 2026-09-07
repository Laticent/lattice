/**
 * Unit tests for the Form default DOM kernel (lib/forms/form-default.js) — the
 * live-DOM edition of the deck-wide `form:` toggle the runtime applies so a raw
 * Marp deck (css + runtime + theme, no engine render) composes as Form by default.
 *
 * This is the regression guard for the gap that shipped once: the runtime never
 * stamped `form`, so masthead-lift + the progress/watermark Tiles (all keyed on
 * `section.form`) were permanently inert in the marp-vscode preview and in the
 * export-to-Marp bundle's HTML. See
 * engineering/decisions/2026-07-08-runtime-form-default.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { applyFormDefaultToDom } = require('../../../lib/forms/form-default');

function doc(html) {
  return new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
}
const classesOf = (d) =>
  [...d.querySelectorAll('section:not(section section)')].map((s) => s.className);

describe('applyFormDefaultToDom — the runtime Form default', () => {
  test('stamps `form` + `data-lattice-slide` on a generic top-level slide', () => {
    const d = doc('<section class="content"><h2>T</h2><p>b</p></section>');
    applyFormDefaultToDom(d);
    const sec = d.querySelector('section');
    assert.ok(sec.classList.contains('form'), 'form class added');
    assert.equal(sec.getAttribute('data-lattice-slide'), '1');
  });

  test('an unclassed slide (no `_class`) still gets `form`', () => {
    const d = doc('<section><h2>T</h2></section>');
    applyFormDefaultToDom(d);
    assert.equal(d.querySelector('section').className, 'form');
  });

  test('skips every sovereign frame (the render-time skip set)', () => {
    // Mirrors FORM_TOGGLE_SKIP_FALLBACK — the engine and this path must agree.
    // `math` is handled in its own test below: it is mid-migration off the
    // sovereign frame one variant at a time, so the bare token is no longer a
    // straight skip.
    for (const cls of ['title', 'divider', 'closing', 'image', 'compare-code', 'split-panel', 'split-compare']) {
      const d = doc(`<section class="${cls}"><h2>T</h2></section>`);
      applyFormDefaultToDom(d);
      const sec = d.querySelector('section');
      assert.equal(sec.className, cls, `${cls} must not gain form`);
      // still marked as a slide, so slide-scoped features can see it
      assert.equal(sec.getAttribute('data-lattice-slide'), '1');
    }
  });

  test('the DOM path agrees with the engine on every math variant, mid-migration', () => {
    // THE SEAM THIS GUARDS is a Node-vs-browser split. The engine derives its skip
    // set from the frame manifests at Node load; this DOM path is what the browser
    // runtime uses. If the two disagreed about which math variants have migrated, a
    // deck would compose one way in the CLI/PDF export and another in the live
    // Playground — the exact divergence HARD RULE #1 exists to prevent, and the
    // failure would be visual, so no other gate would see it.
    const { MATH_VARIANTS, MIGRATED } = require('../../../lib/core/math-stage-migration.js');
    const plugins = require('../../../lib/integrations/markdown-it/plugins');
    for (const variant of MATH_VARIANTS) {
      const cls = variant === 'decompose' ? 'math matrix decompose' : `math ${variant}`;
      const d = doc(`<section class="${cls}"><h2>T</h2></section>`);
      applyFormDefaultToDom(d);
      const domClass = d.querySelector('section').className;
      assert.equal(
        domClass,
        MIGRATED.has(variant) ? `${cls} form` : cls,
        `math ${variant}: DOM path should ${MIGRATED.has(variant) ? 'add form' : 'skip'}`,
      );
      // and it must match what the engine's own toggle produces for the same class
      assert.equal(domClass, plugins.formToggleClass(cls, 'standard'),
        `math ${variant}: the DOM path and the engine disagree`);
      assert.equal(d.querySelector('section').getAttribute('data-lattice-slide'), '1');
    }
  });

  test('respects an explicit `no-form` opt-out (unchanged)', () => {
    const d = doc('<section class="content no-form"><h2>T</h2></section>');
    applyFormDefaultToDom(d);
    assert.equal(d.querySelector('section').className, 'content no-form');
  });

  test('leaves an already-`form` slide unchanged (idempotent class)', () => {
    const d = doc('<section class="content form"><h2>T</h2></section>');
    applyFormDefaultToDom(d);
    assert.equal(d.querySelector('section').className, 'content form');
  });

  test('one hand-tagged `form` slide does NOT suppress the default on siblings', () => {
    const d = doc(
      '<section class="content form"><h2>A</h2></section>' +
      '<section class="content"><h2>B</h2></section>',
    );
    applyFormDefaultToDom(d);
    assert.deepEqual(classesOf(d), ['content form', 'content form']);
  });

  test('does NOT touch a <section> nested inside slide content', () => {
    const d = doc('<section class="content"><h2>T</h2><section class="nested">x</section></section>');
    applyFormDefaultToDom(d);
    const top = d.querySelector('section.content');
    const nested = d.querySelector('section.nested');
    assert.ok(top.classList.contains('form'), 'top-level slide formed');
    assert.equal(nested.className, 'nested', 'nested section untouched');
    assert.equal(nested.hasAttribute('data-lattice-slide'), false);
  });

  test('numbers slides in document order; never overwrites an existing marker', () => {
    const d = doc(
      '<section class="content"><h2>A</h2></section>' +
      '<section class="content" data-lattice-slide="9"><h2>B</h2></section>' +
      '<section class="content"><h2>C</h2></section>',
    );
    applyFormDefaultToDom(d);
    const marks = [...d.querySelectorAll('section:not(section section)')].map((s) =>
      s.getAttribute('data-lattice-slide'));
    assert.deepEqual(marks, ['1', '9', '3']);
  });

  test('fully idempotent — a second pass changes nothing', () => {
    const d = doc(
      '<section class="title"><h1>T</h1></section>' +
      '<section class="content"><h2>B</h2></section>',
    );
    applyFormDefaultToDom(d);
    const after1 = classesOf(d).join('|');
    applyFormDefaultToDom(d);
    assert.equal(classesOf(d).join('|'), after1);
  });

  test('safely returns on null / non-DOM root', () => {
    assert.doesNotThrow(() => applyFormDefaultToDom(null));
    assert.doesNotThrow(() => applyFormDefaultToDom({}));
  });
});
