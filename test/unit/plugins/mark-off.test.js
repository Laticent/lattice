/**
 * lib/plugins/mark-off.mjs — the runtime's door for a page the ENGINE did not render (an
 * Export-to-Marp bundle): it writes the engine's `data-lattice-off` marker from a list of plugins,
 * so every browser pass skips what the producer's admission left off (spec/LPM.md §3.2.1).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');

const { markPluginsOff } = require('../../../lib/plugins/mark-off.mjs');
const { RUNTIME_DRAWN, RUNTIME_DRAWN_FENCE_CODE } = require('../../../lib/plugins/drawn.generated.mjs');
const { TRANSFORMERS } = require('../../../lib/transformers/registry');
const chartFamily = require('../../../lib/transformers/chart-family');
const { withRuntimeScripts, marpConfigCjs, MARP_CONFIG_CJS } = require('../../../lib/core/marp-bundle');
const { readExportSettings } = require('../../../lib/core/export-settings');

// What Marp writes for a Mermaid fence and a bar slide: no engine marker anywhere.
const MARP_HTML = `
  <section id="1"><h1>Admission</h1><marp-pre><code class="language-mermaid">flowchart LR
  A--&gt;B</code></marp-pre><pre><code class="language-js">x</code></pre></section>
  <section id="2" class="bar"><h2>Revenue</h2><ul><li>North <code>42</code></li><li>South <code>30</code></li></ul></section>`;
const doc = () => new JSDOM(`<!doctype html><body>${MARP_HTML}</body>`).window.document;
const from = { drawn: RUNTIME_DRAWN, owners: TRANSFORMERS };

describe('markPluginsOff', () => {
  test('an off plugin\'s inline spans are marked: `^{…}` only, never a fence or another kind', () => {
    const { INLINE } = require('../../../lib/plugins/inline.generated.js');
    const d = new JSDOM('<!doctype html><body><section><p><code>^{database}</code> <code>{S3, icon=bucket}</code> '
      + '<code>~{1,2}</code></p><pre><code>^{rocket}</code></pre></section></body>').window.document;
    assert.equal(markPluginsOff(d, ['icons'], { inline: INLINE }), 1);
    assert.equal(d.querySelector('p code').getAttribute('data-lattice-off'), 'icons');
    assert.equal(markPluginsOff(d, ['mermaid'], { inline: INLINE }), 0, 'a plugin with no inline kind marks no span');
  });

  test('nothing off marks nothing', () => {
    const d = doc();
    assert.equal(markPluginsOff(d, [], from), 0);
    assert.equal(d.querySelectorAll('[data-lattice-off]').length, 0);
  });

  test('a drawn fence and a slot filler are marked; the probes and the family then skip them', () => {
    const d = doc();
    assert.equal(markPluginsOff(d, ['mermaid', 'chart-family'], from), 2);
    assert.equal(d.querySelector('marp-pre').getAttribute('data-lattice-off'), 'mermaid');
    assert.equal(d.querySelector('pre').hasAttribute('data-lattice-off'), false, 'a js block is not Mermaid\'s');
    assert.equal(d.querySelector('section.bar').getAttribute('data-lattice-off'), 'chart-family');
    // The runtime-drawn probe no longer sees the fence, and the chart pass builds nothing.
    assert.equal(d.querySelectorAll(RUNTIME_DRAWN_FENCE_CODE).length, 0);
    chartFamily.applyToDom(d);
    assert.equal(d.querySelector('.bar-figure'), null);
    // Idempotent: a second pass (the runtime runs on every mutation) marks nothing more.
    assert.equal(markPluginsOff(d, ['mermaid', 'chart-family'], from), 0);
  });

  test('a fence is matched as the pass reads it, by substring: Marp\'s `language-mermaid-source` is marked too', () => {
    // A ```mermaid-source fence (or the pass's own defanged class) is drawn by the pass, whose selector
    // is `code[class*="language-mermaid"]`; matching the whole class word left it drawable when off.
    const d = new JSDOM('<!doctype html><body><section><marp-pre><code class="language-mermaid-source">graph TD; A--&gt;B</code></marp-pre></section></body>').window.document;
    assert.equal(markPluginsOff(d, ['mermaid'], from), 1);
    assert.equal(d.querySelectorAll(RUNTIME_DRAWN_FENCE_CODE).length, 0);
  });

  test('only the plugins named: mermaid off leaves the chart to be built', () => {
    const d = doc();
    markPluginsOff(d, ['mermaid'], from);
    chartFamily.applyToDom(d);
    assert.ok(d.querySelector('section.bar .bar-figure'), 'the chart was built');
  });
});

describe('the Marp bundle carries the producer\'s admission', () => {
  const settingsOf = (md) => readExportSettings(new JSDOM(`<!doctype html><body>${md}</body>`).window.document);
  test('pluginsOff rides in the settings block, sorted and deduplicated', () => {
    const md = withRuntimeScripts('# Hi\n', { overflowMarker: 'reader', pluginsOff: ['mermaid', 'chart-family', 'mermaid'] });
    assert.deepEqual(settingsOf(md).pluginsOff, ['chart-family', 'mermaid']);
  });
  test('nothing off writes the block exactly as before', () => {
    assert.equal(withRuntimeScripts('# Hi\n', { overflowMarker: 'reader', pluginsOff: [] }), withRuntimeScripts('# Hi\n', { overflowMarker: 'reader' }));
  });
  // The deck's math is typeset at export (lib/core/marp-bundle-math.js), so Marp's own typesetter is
  // off in every bundle, math plugin on or off: it is the injection surface the bake closes.
  test('the marp config turns Marp\'s own math off, always', () => {
    assert.equal(marpConfigCjs(), MARP_CONFIG_CJS);
    assert.match(MARP_CONFIG_CJS, /module\.exports = \{ themeSet, allowLocalFiles: true, html, engine, options: \{ math: false \} \};/);
  });
  test('with the math plugin off, the TeX is left as written and every $ is escaped', () => {
    const md = withRuntimeScripts('# Hi $x$\n', { overflowMarker: 'reader', pluginsOff: ['math'] });
    assert.match(md, /^# Hi \\\$x\\\$$/m);
    assert.doesNotMatch(md, /katex/);
  });
});
