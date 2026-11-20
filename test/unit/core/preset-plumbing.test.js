/**
 * PRESET PLUMBING (P0) — the keys a preset RECOMMENDS (`theme`, `color-mode`, `mode`, `marks`,
 * `backdrop`) and the preset TOKENS, wired through every path before any preset sets them.
 * engineering/decisions/2026-11-20-deck-preset-study.md §5 D1 and D10, §8 Phase 0.
 *
 * No shipped preset sets these keys yet (they arrive in the later waves), so every arm runs on a
 * PROBE preset swapped in with `withPresetTable`, and each claim carries its control: the same deck
 * without the preset, or with the key written, renders the old way. The runtime arm patches the real
 * dist/lattice-runtime.js the same way, because that bundle evaluates its own copy of the table.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const latticeEngine = require(path.join(ROOT, 'lib/engine'));
const fmk = require(path.join(ROOT, 'lib/core/front-matter-key.js'));
const { topLevelRegisterValue, frontMatterValue, withPresetTable, PRESETS, presetTokensCss, presetTokenProblem } = fmk;
const { presetTokenClass, presetTokenClassFromFrontMatter } = require(path.join(ROOT, 'lib/core/resolve-preset.js'));
const { resolvePalette } = require(path.join(ROOT, 'lib/core/resolve-palette.js'));
const { deckColorModeToken, readFrontMatterColorMode } = require(path.join(ROOT, 'lib/core/resolve-color-mode.js'));
const { backdropClassesFromFrontMatter, readBackdrop } = require(path.join(ROOT, 'lib/core/resolve-backdrop.js'));
const { marksFromFrontMatter } = require(path.join(ROOT, 'lib/core/resolve-marks.js'));
const { withBundleFrontMatter } = require(path.join(ROOT, 'lib/export/bundle-front-matter.js'));
const { readTheme } = require(path.join(ROOT, 'tools/export-marp.js'));
const { isSurfaceRegisterToken } = require(path.join(ROOT, 'lib/core/surface-registers.js'));

/** The probe: every recommendation key, a multi-word value on both multi-word keys, and one token. */
const PROBE = {
  label: 'Probe',
  desc: 'test only',
  values: { theme: 'cuoio', 'color-mode': 'dark', mode: 'sketch', marks: 'etch vivid', backdrop: '40 clear', rule: 'short' },
  tokens: { '--rule-w': '2px' },
};
const TABLE = { ...PRESETS, probe: PROBE };
const withProbe = (fn) => withPresetTable(TABLE, fn);

const deck = (fm, body = '## Two\n\nBody.') => ['---', ...fm, '---', '', '# Cover', '', '---', '', body].join('\n');
const classesOf = (html) => [...new JSDOM(html).window.document.querySelectorAll('section')]
  .map((s) => (s.getAttribute('class') || '').split(/\s+/).filter(Boolean));

/* ── The kernel ─────────────────────────────────────────────────────────────────────────── */

test('kernel: an absent or empty top-level key reads as the preset; a written one wins; a nested one is not the key', () => {
  withProbe(() => {
    assert.equal(topLevelRegisterValue('preset: probe', 'theme'), 'cuoio');
    assert.equal(topLevelRegisterValue('preset: probe\ntheme:', 'theme'), 'cuoio', 'an empty key says nothing');
    assert.equal(topLevelRegisterValue('preset: probe\ntheme: # todo', 'theme'), 'cuoio', 'a comment-only key says nothing');
    assert.equal(topLevelRegisterValue('preset: probe\ntheme: indaco', 'theme'), 'indaco', 'the deck wins');
    assert.equal(topLevelRegisterValue('preset: probe\nfoo:\n  theme: indaco', 'theme'), 'cuoio', 'a nested theme: is not the deck key');
    assert.equal(topLevelRegisterValue('pptx:\n  preset: probe', 'theme'), null, 'a nested preset: drives nothing');
    assert.equal(topLevelRegisterValue('preset: probe', 'backdrop'), '40 clear', 'multi-word, verbatim');
    assert.equal(frontMatterValue('preset: probe', 'marks'), 'etch vivid', 'multi-word, verbatim');
    // Control: the same reads with no preset.
    assert.equal(topLevelRegisterValue('theme: indaco', 'theme'), 'indaco');
    assert.equal(topLevelRegisterValue('rule: short', 'theme'), null);
    // A key outside the family reads exactly as the strict reader does.
    assert.equal(topLevelRegisterValue('preset: probe\nfooter:', 'footer'), '');
  });
  // The table is restored: outside the probe, `probe` is no preset.
  assert.equal(topLevelRegisterValue('preset: probe', 'theme'), null);
});

test('kernel: a preset theme keeps its case; the legacy `chart-finish:` still beats a preset `marks`', () => {
  withPresetTable({ ...TABLE, cased: { label: 'C', desc: '', values: { theme: 'NoirStudio' } } }, () => {
    assert.equal(topLevelRegisterValue('preset: cased', 'theme'), 'NoirStudio');
  });
  withProbe(() => {
    assert.equal(marksFromFrontMatter('preset: probe'), 'etch vivid');
    assert.equal(marksFromFrontMatter('preset: probe\nchart-finish: tone'), 'tone', 'the old key the deck wrote wins');
    assert.equal(marksFromFrontMatter('preset: probe\nchart-finish:'), 'etch vivid', 'an empty old key says nothing');
    assert.equal(marksFromFrontMatter('preset: probe\nmarks: pigment\nchart-finish: tone'), 'pigment', 'marks: still beats both');
  });
});

test('kernel: the color mode yields to a scheme the deck pins the legacy way', () => {
  withProbe(() => {
    assert.equal(deckColorModeToken('preset: probe'), 'dark');
    assert.equal(readFrontMatterColorMode('---\npreset: probe\n---\n'), 'dark');
    assert.equal(deckColorModeToken('preset: probe\ncolor-mode: light'), 'color-light', 'the deck key wins');
    assert.equal(deckColorModeToken('preset: probe\nclass: light'), '', '`class: light` pins the scheme; no recommendation overrides it');
    assert.equal(deckColorModeToken('preset: probe\nclass: print'), '');
    assert.equal(deckColorModeToken('preset: probe\ntheme: cuoio-dark'), '', 'a -dark theme pins the scheme too');
    // Every color-axis class token pins it, not only the three legacy words: the engine refuses the
    // whole axis once a mode resolves, and the Export-to-Marp rewrite reads only what the deck wrote.
    for (const t of ['dark', 'light', 'print', 'color-light', 'color-system', 'color-inherited']) {
      assert.equal(deckColorModeToken(`preset: probe\nclass: ${t} kpi`), '', `class: ${t}`);
    }
  });
  assert.equal(deckColorModeToken('class: light'), '', 'control');
});

test('kernel: the backdrop render read takes the preset; the what-did-the-deck-write read does not', () => {
  withProbe(() => {
    assert.deepEqual(backdropClassesFromFrontMatter('preset: probe'), ['backdrop-40', 'backdrop-clear']);
    assert.deepEqual(backdropClassesFromFrontMatter('preset: probe\nbackdrop: 80'), ['backdrop-80']);
    assert.equal(readBackdrop('preset: probe'), null, 'the linter-facing read sees only what the deck wrote');
  });
});

test('export + engine agree on the deck class under a recommended color mode (#1416 class)', () => {
  const { withSanitizedDeckClass, deckClassTokensFromFrontMatter } = require(path.join(ROOT, 'lib/core/deck-class-register.js'));
  withProbe(() => {
    const src = deck(['preset: probe', 'class: color-system lead']);
    const exported = withSanitizedDeckClass(src).match(/^class:[ \t]*(.*)$/m)?.[1] ?? '';
    assert.deepEqual(deckClassTokensFromFrontMatter('preset: probe\nclass: color-system lead'), exported.split(/\s+/).filter(Boolean));
  });
});

test('lint: a recommended theme is not reported as a line the deck wrote', () => {
  const { lintText } = require(path.join(ROOT, 'lib/authoring/lint'));
  const unknownTheme = (md) => lintText(md, {}).filter((f) => f.rule === 'unknown-theme').length;
  withPresetTable({ ...TABLE, saved: { label: 'S', desc: '', values: { theme: 'my-saved-palette' } } }, () => {
    assert.equal(unknownTheme(deck(['preset: saved'])), 0, 'the deck wrote no theme');
    assert.equal(unknownTheme(deck(['preset: saved', 'theme: nosuchtheme'])), 1, 'control: a written typo is still reported');
  });
});

/* ── Preset tokens (D10) ────────────────────────────────────────────────────────────────── */

test('tokens: only a preset that sets tokens stamps a class and emits CSS', () => {
  for (const name of Object.keys(PRESETS)) assert.equal(presetTokenClass(name), '', `${name} sets no tokens and stamps nothing`);
  assert.equal(presetTokensCss(), '', 'no shipped preset emits CSS, so the bundle is unchanged');
  withProbe(() => {
    assert.equal(presetTokenClass('Probe'), 'preset-probe');
    assert.deepEqual(presetTokenClassFromFrontMatter('preset: probe'), ['preset-probe']);
    assert.deepEqual(presetTokenClassFromFrontMatter('pptx:\n  preset: probe'), [], 'top-level only');
    assert.equal(presetTokensCss(), 'section.preset-probe {\n  --rule-w: 2px;\n}');
    assert.ok(isSurfaceRegisterToken('preset-probe'), 'the token rides a split page like every deck register');
  });
  assert.ok(!isSurfaceRegisterToken('preset-probe'), 'control: outside the probe, no such token');
});

test('tokens: a value that breaks a house rule fails the build, not a slide', () => {
  assert.equal(presetTokenProblem('--rule-w', '2px'), null);
  assert.equal(presetTokenProblem('--rail-w', 'calc(var(--sp-card-w) * 2)'), null);
  assert.match(presetTokenProblem('rule-w', '2px'), /custom-property/);
  assert.match(presetTokenProblem('--fs-title', '40px'), /HARD RULE #4/);
  assert.match(presetTokenProblem('--rule-color', '#ff0000'), /hex/, 'HARD RULE #3');
  for (const bad of ['red}section{color:red', '1px; color: red', '1px</style><script>', '2px !important', '/* x */ 1px']) {
    assert.ok(presetTokenProblem('--rule-w', bad), `refused: ${bad}`);
  }
  assert.throws(() => presetTokensCss({ bad: { values: {}, tokens: { '--x': '#fff' } } }), /preset bad/);
});

/* ── The engine (lib/engine + lib/integrations/markdown-it/plugins.js) ─────────────────── */

test('engine: a preset theme renders the palette a written `theme:` does', () => {
  const engine = latticeEngine.createEngine();
  // Two stand-in palettes, each marking its own CSS, so the assertion reads which one the engine picked.
  engine.addThemes(['/* @theme cuoio */\nsection { --probe-palette: cuoio; }', '/* @theme indaco */\nsection { --probe-palette: indaco; }']);
  const palette = (md) => (engine.render(md).css.match(/--probe-palette: (\w+)/) || [])[1] ?? null;
  withProbe(() => {
    assert.equal(palette(deck(['preset: probe'])), 'cuoio', 'the preset theme is the theme');
    assert.equal(palette(deck(['preset: probe', 'theme: indaco'])), 'indaco', 'a written theme still wins');
    assert.equal(palette(deck(['preset: probe'])), palette(deck(['theme: cuoio'])));
  });
  // Control: outside the probe the unknown preset recommends nothing.
  assert.equal(palette(deck(['preset: probe'])), null);
});

test('engine: the preset stamps its color mode, hand, marks, backdrop and token class on every slide', () => {
  const engine = latticeEngine.createEngine();
  withProbe(() => {
    for (const cls of classesOf(engine.render(deck(['preset: probe'])).html)) {
      for (const t of ['dark', 'sketch', 'marks-etch', 'marks-vivid', 'backdrop-40', 'backdrop-clear', 'preset-probe', 'rule-short']) {
        assert.ok(cls.includes(t), `${t} in ${cls.join(' ')}`);
      }
    }
    // Every key the deck writes wins over its recommendation.
    const own = classesOf(engine.render(deck(['preset: probe', 'color-mode: light', 'mode: boardroom', 'marks: pigment', 'backdrop: 80'])).html);
    for (const cls of own) {
      assert.ok(cls.includes('color-light') && !cls.includes('dark'), cls.join(' '));
      assert.ok(!cls.includes('sketch') && !cls.includes('marks-etch') && !cls.includes('backdrop-40'), cls.join(' '));
      assert.ok(cls.includes('backdrop-80'), cls.join(' '));
    }
    // A legacy `class: light` deck keeps its light canvas, and the class is not refused.
    for (const cls of classesOf(engine.render(deck(['preset: probe', 'class: light'])).html)) {
      assert.ok(cls.includes('light') && !cls.includes('dark'), cls.join(' '));
    }
  });
  // Control: the shipped presets stamp none of it.
  for (const cls of classesOf(engine.render(deck(['preset: editorial'])).html)) {
    assert.ok(!cls.some((t) => t.startsWith('preset-') || t === 'dark' || t === 'sketch' || t.startsWith('backdrop-')), cls.join(' '));
  }
});

/* ── The CLI palette, Export-to-Marp ────────────────────────────────────────────────────── */

test('cli + export: the palette pick and the Marp bundle take the preset theme', () => {
  withProbe(() => {
    assert.equal(resolvePalette({ md: deck(['preset: probe']), env: {} }).name, 'cuoio');
    assert.equal(resolvePalette({ md: deck(['preset: probe', 'theme: indaco']), env: {} }).name, 'indaco');
    assert.equal(resolvePalette({ md: deck(['preset: probe']), cliArg: 'indaco', env: {} }).name, 'indaco', 'the CLI argument still wins');
    assert.equal(readTheme(deck(['preset: probe'])), 'cuoio');
    const baked = withBundleFrontMatter(deck(['preset: probe']));
    assert.match(baked, /^---\nmarp: true\ntheme: cuoio\n---\n/, 'Marp picks the theme, so the bundle writes it');
    const own = withBundleFrontMatter(deck(['theme: indaco', 'preset: probe']));
    assert.equal((own.match(/^theme:/gm) || []).length, 1, 'a written theme is kept, never doubled');
    assert.match(own, /^theme: indaco$/m);
  });
  // Control: no preset theme, no line.
  assert.doesNotMatch(withBundleFrontMatter(deck(['preset: editorial'])), /^theme:/m);
  assert.equal(readTheme(deck(['theme: cuoio  # brand'])), 'cuoio', 'a trailing comment no longer drops the palette');
});

/* ── The browser runtime (lib/runtime), the export path's renderer ──────────────────────── */

const RUNTIME_BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');
const { frontMatterBlock } = require(path.join(ROOT, 'lib/core/deck-front-matter.js'));

function runtimeWithProbe(deckSource, markup) {
  const bundle = fs.readFileSync(RUNTIME_BUNDLE, 'utf8');
  // The bundle evaluates its own copy of the table, so the probe goes in the same way `withPresetTable`
  // swaps it, at the one line the module seeds it from. A bundle without the line predates P0.
  assert.ok(bundle.includes('activeTable = PRESETS;'), 'dist/lattice-runtime.js predates the preset plumbing — run `npm run build`.');
  const patched = bundle.replace('activeTable = PRESETS;', `activeTable = Object.assign({}, PRESETS, { probe: ${JSON.stringify(PROBE)} });`);
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>${markup}${frontMatterBlock(deckSource)}</body></html>`,
    { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  dom.window.fetch = () => Promise.reject(new Error('baked: no fetch expected'));
  const el = dom.window.document.createElement('script');
  el.textContent = patched;
  dom.window.document.body.appendChild(el);
  return new Promise((r) => setTimeout(() => r(dom.window.document), 1000));
}

test('runtime: stamps the preset color mode, backdrop and token class from a baked block', async () => {
  const markup = '<section class="content"><h2>One</h2></section>';
  const on = await runtimeWithProbe(deck(['preset: probe']), markup);
  const cls = on.querySelector('section').className.split(/\s+/);
  for (const t of ['dark', 'backdrop-40', 'backdrop-clear', 'preset-probe', 'rule-short']) assert.ok(cls.includes(t), `${t} in ${cls.join(' ')}`);
  const off = await runtimeWithProbe(deck(['preset: editorial']), markup);
  const offCls = off.querySelector('section').className;
  assert.ok(!/\b(dark|preset-|backdrop-)/.test(offCls), `control: ${offCls}`);
});
