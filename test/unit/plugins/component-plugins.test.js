/**
 * Components depend on plugins; plugins never name components
 * (engineering/decisions/2026-09-27-plugin-system.md §4.1). A plugin is a capability that works on
 * any slide — `$$…$$` typesets on a plain content slide — and a component such as the `math`
 * slide class is a layout designed around one, so IT declares the dependency. This pins the
 * three things that declaration buys: the capability works without the component, the
 * declaration is in the registry the engine reads, and a slide whose required plugin is switched
 * off still renders but is never silent about it.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { createEngine } = require('../../../lib/engine');
const { COMPONENT_PLUGINS, componentPluginDiagnostics } = require('../../../lib/plugins/host');

const MATH_SLIDE = '<!-- _class: math -->\n\n## Energy\n\n$$\nE = mc^2\n$$\n';
const CONTENT_SLIDE = '## Why the curve bends\n\n$$\n\\sigma(x) = \\frac{1}{1 + e^{-x}}\n$$\n';

describe('components depend on plugins', () => {
  test('the capability works on any slide: display math typesets on a plain content slide', () => {
    const { html } = createEngine().render(CONTENT_SLIDE);
    assert.ok(html.includes('class="katex-display"'), 'no typeset math on a content slide');
  });

  test('the math slide class declares the math plugin, and the registry carries it', () => {
    assert.deepEqual(COMPONENT_PLUGINS.math, ['math']);
  });

  test('no plugin names a component', () => {
    const { PLUGINS } = require('../../../lib/plugins/host');
    for (const p of PLUGINS) assert.equal(p.components, undefined, `${p.name} names components`);
  });

  test('a normal render carries no diagnostics key at all — its shape is unchanged', () => {
    assert.equal('diagnostics' in createEngine().render(MATH_SLIDE), false);
    assert.equal('diagnostics' in createEngine({ math: false }).render(CONTENT_SLIDE), false, 'math off, but no slide class needs it');
  });

  test('a required plugin switched off: the slide still renders, and a diagnostic names both', () => {
    const out = createEngine({ math: false }).render(MATH_SLIDE);
    assert.ok(out.html.includes('E = mc^2'), 'the TeX source is still on the slide');
    assert.equal(out.html.includes('class="katex'), false);
    assert.deepEqual(out.diagnostics.map(({ id, component, plugin }) => ({ id, component, plugin })), [
      { id: 'plugin/component-needs-plugin', component: 'math', plugin: 'math' },
    ]);
    // The general form says the same thing.
    assert.equal(createEngine({ plugins: { disabled: ['math'] } }).render(MATH_SLIDE).diagnostics.length, 1);
  });

  test('an author\'s own <section class="math"> inside a slide is not a math slide', () => {
    const out = createEngine({ math: false }).render('# Hi\n\n<section class="math">x</section>\n');
    assert.equal('diagnostics' in out, false);
  });

  test('the slide scan is linear on hostile deck text (CodeQL js/polynomial-redos)', () => {
    // The first version was a regex with two lazy runs around the data-form test: 8,000 repeated
    // `data-form=""` attributes took ~300 ms and doubling them quadrupled it. The scan must stay
    // linear, because a shared link can hand the Studio any deck text.
    for (const html of [
      `<section${'\tdata-form=""'.repeat(400000)}`,
      '<section data-form=""'.repeat(400000),
      `${'<section data-form="x" class="'.repeat(100000)}>`,
    ]) {
      const t = performance.now();
      componentPluginDiagnostics(html, ['math']);
      assert.ok(performance.now() - t < 500, `took ${Math.round(performance.now() - t)} ms`);
    }
  });

  test('one diagnostic per component and plugin, however many slides use it', () => {
    const html = '<section data-form="2d" class="math feature"></section><section data-form="2d" id="x" class="math"></section>';
    assert.equal(componentPluginDiagnostics(html, ['math']).length, 1);
    assert.deepEqual(componentPluginDiagnostics(html, []), []);
  });
});
