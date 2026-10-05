/**
 * Unit: the browser half honors plugin ADMISSION (spec/LPM.md §3.2.1;
 * engineering/decisions/2026-09-27-plugin-system.md §9 decision 9, followup #2509 P3).
 *
 * A runtime-drawn plugin's fence is `as: "code"`, so the engine emits the same highlighted code
 * block whether the deck loaded the plugin or not. Before this, the runtime's pass drew every such
 * fence it found. Now the engine marks the fence of a plugin the deck did NOT load
 * (`<pre data-lattice-off="<plugin>">`), and every browser reader skips that marker. This file pins
 * the engine's half (the marker, and byte identity on the default set), the shipped pass selectors
 * and the generated probes against a real DOM (jsdom), the probes' counts, and the boundary
 * parser's host switch. What a browser actually DRAWS is proved on the real surfaces in the PR
 * (HARD RULE #23): jsdom runs no Mermaid.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { createEngine } = require('../../../lib/engine');

const REPO = path.join(__dirname, '..', '..', '..');
const DECK = '# A\n\n```mermaid\ngraph LR; A-->B\n```\n\n```js\nconst x = 1;\n```\n';

const pres = (html) => html.match(/<pre\b[^>]*>/g) || [];

describe('the engine marks a fence whose plugin the deck did not load', () => {
  test('default set: no marker, byte-identical to a render with every plugin listed', () => {
    const plain = createEngine().render(DECK).html;
    assert.deepEqual(pres(plain), ['<pre>', '<pre>']);
    assert.ok(!plain.includes('data-lattice-off'));
  });

  test('defaults: [] — the mermaid fence is marked, the js fence is not', () => {
    const html = createEngine({ plugins: { defaults: [] } }).render(DECK).html;
    assert.deepEqual(pres(html), ['<pre data-lattice-off="mermaid">', '<pre>']);
    // Still the author's highlighted code block: the marker is the only difference.
    assert.match(html, /<pre data-lattice-off="mermaid"><code class="language-mermaid">/);
  });

  test('defaults: [] with the deck listing it — admitted, no marker', () => {
    const html = createEngine({ plugins: { defaults: [] } }).render(`---\nplugins: [mermaid]\n---\n${DECK}`).html;
    assert.ok(!html.includes('data-lattice-off'));
  });

  test("the host's disabled switch marks it too, whatever admitted it", () => {
    const html = createEngine({ plugins: { disabled: ['mermaid'] } }).render(`---\nplugins: [mermaid]\n---\n${DECK}`).html;
    assert.deepEqual(pres(html)[0], '<pre data-lattice-off="mermaid">');
  });

  test('render({ pluginDefaults }) narrows one render, and the engine keeps no state from it', () => {
    const e = createEngine();
    assert.deepEqual(pres(e.render(DECK, undefined, { pluginDefaults: [] }).html)[0], '<pre data-lattice-off="mermaid">');
    assert.deepEqual(pres(e.render(DECK).html)[0], '<pre>');
    assert.throws(() => e.render(DECK, undefined, { pluginDefaults: 'mermaid' }), TypeError);
  });

  test('the playground bundle forwards its host default set to every render', async () => {
    const { default: api } = await import('../../../lib/playground/index.js');
    try {
      api.setPluginDefaults([]);
      assert.deepEqual(pres(api.render(DECK).html)[0], '<pre data-lattice-off="mermaid">');
      api.setPluginDefaults(['mermaid']);
      assert.deepEqual(pres(api.render(DECK).html)[0], '<pre>');
    } finally {
      api.setPluginDefaults(null);
    }
    assert.deepEqual(pres(api.render(DECK).html)[0], '<pre>');
    assert.throws(() => api.setPluginDefaults('mermaid'), TypeError);
    assert.throws(() => api.setPluginDefaults(['mermiad']), /no plugin is named "mermiad"/);
  });

  test('ADMISSION IS DECK-WIDE: a slide rendered alone takes the whole deck\'s answer', async () => {
    // Slide 1's `diagram` class loads Mermaid for the deck, so slide 2's plain fence is drawn in
    // the whole-deck render. Rendered alone (the Studio's slice route), slide 2 would admit on
    // itself and mark the fence — unless it is handed the deck's admission (inversion lens, P1).
    const { default: api } = await import('../../../lib/playground/index.js');
    const fm = '---\ntheme: indaco\n---\n';
    const slide2 = '# Two\n\n```mermaid\ngraph LR; A-->B\n```\n';
    const deck = `${fm}<!-- _class: diagram -->\n\n# One\n\n\`\`\`mermaid\ngraph LR; C-->D\n\`\`\`\n\n---\n\n${slide2}`;
    try {
      assert.equal(api.pluginAdmission(deck), null, 'nothing to pass on the shipped default set');
      api.setPluginDefaults([]);
      assert.ok(!api.render(deck).html.includes('data-lattice-off'), 'the whole deck draws both');
      assert.match(api.render(fm + slide2).html, /data-lattice-off="mermaid"/, 'the slice alone would not');
      const admitted = api.pluginAdmission(deck);
      assert.deepEqual(admitted, ['mermaid']);
      assert.ok(!api.render(fm + slide2, undefined, { pluginDefaults: admitted }).html.includes('data-lattice-off'));
      assert.notEqual(api.pluginDefaultsKey(), '*');
    } finally {
      api.setPluginDefaults(null);
    }
    assert.equal(api.pluginDefaultsKey(), '*');
  });

  test('a mistyped default set fails loudly instead of narrowing to nothing', () => {
    assert.throws(() => createEngine().render(DECK, undefined, { pluginDefaults: ['mermiad'] }), /no plugin is named "mermiad"/);
    assert.throws(() => createEngine({ plugins: { defaults: ['mermiad'] } }), /no plugin is named "mermiad"/);
  });
});

test('every runtime-drawn plugin\'s fence is marked when its plugin is off (offFence never fails open)', () => {
  const { RUNTIME_DRAWN } = require('../../../lib/plugins/drawn.generated.mjs');
  for (const [name, { fences }] of Object.entries(RUNTIME_DRAWN)) {
    for (const f of fences) {
      const html = createEngine({ plugins: { defaults: [] } }).render(`\`\`\`${f}\nx\n\`\`\`\n`).html;
      assert.match(html, new RegExp(`<pre data-lattice-off="${name}"><code class="language-${f}`), `${name}'s ${f} fence was not marked`);
    }
  }
});

describe('the browser readers skip a marked fence', () => {
  const OFF = createEngine({ plugins: { defaults: [] } }).render(DECK).html;
  const ON = createEngine().render(DECK).html;

  test('drawn-probe: the markup count excludes a marked fence, and stays a superset otherwise', async () => {
    const { drawnFenceCount, markupHasDrawnFence, DRAWN_FENCE_CODE } = await import('../../../lib/plugins/drawn-probe.mjs');
    assert.equal(drawnFenceCount(ON), 1);
    assert.equal(drawnFenceCount(OFF), 0);
    assert.equal(markupHasDrawnFence(OFF), false);
    assert.equal(drawnFenceCount(ON + OFF), 1, 'one admitted, one not');
    const off = new JSDOM(OFF).window.document;
    const on = new JSDOM(ON).window.document;
    assert.equal(off.querySelectorAll(DRAWN_FENCE_CODE).length, 0);
    assert.equal(on.querySelectorAll(DRAWN_FENCE_CODE).length, 1);
  });

  test("the Mermaid pass's adoption walk and untagged probe never select a marked fence", () => {
    const src = fs.readFileSync(path.join(REPO, 'lib', 'plugins', 'mermaid', 'mermaid.hydrate.js'), 'utf8');
    const { RUNTIME_DRAWN } = require('../../../lib/plugins/drawn.generated.mjs');
    const code = src.match(/const MERMAID_CODE = (.+);\n/);
    assert.ok(code, 'mermaid.hydrate.js must derive MERMAID_CODE from the registry');
    const MERMAID_CODE = new Function('MERMAID_FENCES', `return ${code[1]};`)(RUNTIME_DRAWN.mermaid.fences);
    for (const name of ['FENCE_CODE_SELECTOR', 'UNTAGGED_FENCE_SELECTOR']) {
      const m = src.match(new RegExp(`const ${name} = (\`[^\`]+\`);`));
      assert.ok(m, `mermaid.hydrate.js must declare ${name} as one template literal`);
      const sel = new Function('MERMAID_CODE', `return ${m[1]};`)(MERMAID_CODE);
      assert.equal(new JSDOM(OFF).window.document.querySelectorAll(sel).length, 0, `${name} selected a marked fence`);
      assert.equal(new JSDOM(ON).window.document.querySelectorAll(sel).length, 1, `${name} lost an admitted fence`);
    }
  });

  test("the preview's ink-withholding rule leaves a marked fence's source visible", () => {
    const css = fs.readFileSync(path.join(REPO, 'lib', 'plugins', 'mermaid', 'mermaid.styles.css'), 'utf8');
    const rule = css.match(/^\[data-lattice-diagrams\][^{]+\{ visibility:hidden; \}/m);
    assert.ok(rule, 'mermaid.styles.css must keep the [data-lattice-diagrams] withholding rule');
    const sel = rule[0].slice(0, rule[0].indexOf('{')).trim();
    const doc = (html) => new JSDOM(`<html data-lattice-diagrams><body>${html}</body></html>`).window.document;
    assert.equal(doc(OFF).querySelectorAll(sel).length, 0);
    assert.equal(doc(ON).querySelectorAll(sel).length, 1);
  });
});

describe("the boundary parser follows the host's admission", () => {
  test('setBoundaryPluginsOff switches a plugin block rule off and back on', async () => {
    const { boundaryParser, setBoundaryPluginsOff } = await import('../../../lib/core/boundary-parser.mjs');
    const src = '$$\na\n\n---\n\nb\n$$\n';
    const types = () => boundaryParser.parse(src, {}).map((t) => t.type);
    try {
      assert.deepEqual(types(), ['math_block']);
      setBoundaryPluginsOff(['math']);
      assert.ok(types().includes('hr'), 'with math off, the --- inside $$ is a slide break, as in the engine');
      // The engine agrees: math off, the same source is two slides.
      const html = createEngine({ plugins: { defaults: [] } }).render(src).html;
      assert.equal((html.match(/<section\b/g) || []).length, 2);
    } finally {
      setBoundaryPluginsOff([]);
    }
    assert.deepEqual(types(), ['math_block']);
  });
});

describe('red-team arms (HARD RULE #25, P1)', () => {
  test('a fence whose name only STARTS with the plugin\'s is marked too — the pass matches by prefix', async () => {
    const { drawnFenceCount, DRAWN_FENCE_CODE } = await import('../../../lib/plugins/drawn-probe.mjs');
    for (const f of ['mermaid-source', 'mermaidx', 'mermaid{.x}']) {
      const html = createEngine({ plugins: { defaults: [] } }).render(`\`\`\`${f}\nx\n\`\`\`\n`).html;
      assert.match(html, /<pre data-lattice-off="mermaid">/, `${f} was not marked`);
      assert.equal(drawnFenceCount(html), 0);
      assert.equal(new JSDOM(html).window.document.querySelectorAll(DRAWN_FENCE_CODE).length, 0);
    }
  });

  test('quoting the marker in a comment does not zero a real fence\'s count', async () => {
    const { drawnFenceCount } = await import('../../../lib/plugins/drawn-probe.mjs');
    const html = createEngine().render('# T\n\n```mermaid\ngraph TD; A-->B\n```\n\n<!-- data-lattice-off="mermaid" -->\n\n<span data-lattice-off="mermaid"></span>\n').html;
    assert.equal(drawnFenceCount(html), 1);
  });

  test('the slide-boundary memo forgets what it parsed under the previous block rules', async () => {
    const { setBoundaryPluginsOff } = await import('../../../lib/core/boundary-parser.mjs');
    const { slideBoundaries } = await import('../../../lib/core/slide-boundaries.mjs');
    const body = '# A\n\n$$\nx\n\n---\n\ny\n$$\n';
    try {
      const on = slideBoundaries(body).lines.length;
      setBoundaryPluginsOff(['math']);
      const off = slideBoundaries(body).lines.length;
      assert.equal(off, on + 1, 'math off: the --- inside $$ is a boundary, even with the memo warm');
      setBoundaryPluginsOff([]);
      assert.equal(slideBoundaries(body).lines.length, on);
    } finally {
      setBoundaryPluginsOff([]);
    }
  });
});
