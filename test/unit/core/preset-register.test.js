/**
 * THE `preset:` REGISTER — one word that sets the accent + surface family.
 *
 * Two claims, each with its control. (1) The kernel: `frontMatterValue` answers an ABSENT
 * preset key with the preset's value, and an explicit key always wins. (2) The wiring: the
 * engine actually stamps the preset's class tokens on every slide — a kernel returning the
 * right answer into no call site is the defect this file exists to catch.
 * lib/core/resolve-preset.js, engineering/decisions/2026-09-26-deck-presets-and-settings-tiers.md.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const latticeEngine = require(path.join(ROOT, 'lib/engine'));
const { frontMatterName, frontMatterValue } = require(path.join(ROOT, 'lib/core/front-matter-key.js'));
const {
  PRESETS, PRESET_NAMES, PRESET_KEYS, PRESET_DEFAULTS, presetEffective, readFrontMatterPreset,
} = require(path.join(ROOT, 'lib/core/resolve-preset.js'));
const { RULE_NAMES } = require(path.join(ROOT, 'lib/core/resolve-rule.js'));
const { EYEBROW_NAMES } = require(path.join(ROOT, 'lib/core/resolve-eyebrow.js'));
const { HEADLINE_NAMES } = require(path.join(ROOT, 'lib/core/resolve-headline.js'));
const { LIFT_NAMES } = require(path.join(ROOT, 'lib/core/resolve-lift.js'));
const { CORNERS_NAMES } = require(path.join(ROOT, 'lib/core/resolve-corners.js'));
const {
  SPECTRUM_NAMES, SPECTRUM_EDGE_NAMES, SPECTRUM_CARD_NAMES, SPECTRUM_CARD_EDGE_NAMES, SPECTRUM_TRIM_NAMES,
} = require(path.join(ROOT, 'lib/core/resolve-spectrum.js'));

const VOCAB = {
  spectrum: SPECTRUM_NAMES,
  'spectrum-edge': SPECTRUM_EDGE_NAMES,
  'spectrum-card': SPECTRUM_CARD_NAMES,
  'spectrum-card-edge': SPECTRUM_CARD_EDGE_NAMES,
  'spectrum-trim': SPECTRUM_TRIM_NAMES,
  rule: RULE_NAMES,
  eyebrow: EYEBROW_NAMES,
  headline: HEADLINE_NAMES,
  lift: LIFT_NAMES,
  corners: CORNERS_NAMES,
};

const deck = (fm) => ['---', 'theme: indaco', ...fm, '---', '', '# Cover', '', '---', '', '## Second', '', 'Body.'].join('\n');
const render = (fm) => latticeEngine.createEngine().render(deck(fm)).html;
const sectionClasses = (html) => [...new JSDOM(html).window.document.querySelectorAll('section')]
  .map((s) => new Set((s.getAttribute('class') || '').split(/\s+/).filter(Boolean)));

test('every value a preset sets is one its register accepts, and every default is too', () => {
  assert.deepEqual([...PRESET_KEYS].sort(), Object.keys(VOCAB).sort());
  for (const key of PRESET_KEYS) {
    assert.ok(VOCAB[key].includes(PRESET_DEFAULTS[key]), `default ${key}: ${PRESET_DEFAULTS[key]}`);
    for (const name of PRESET_NAMES) {
      const v = PRESETS[name].values[key];
      if (v !== undefined) {
        assert.ok(VOCAB[key].includes(v), `${name}.${key}: ${v}`);
        // A preset lists only what it CHANGES — a default restated would make the
        // "N changes" count in the Studio disagree with what the deck renders.
        assert.notEqual(v, PRESET_DEFAULTS[key], `${name}.${key} restates the default`);
      }
    }
  }
});

test('an absent preset key reads as the preset value; an explicit key wins', () => {
  // Control: without a preset, the key is simply absent.
  assert.equal(frontMatterName('theme: indaco', 'rule'), null);
  assert.equal(frontMatterName('preset: editorial', 'rule'), 'short');
  assert.equal(frontMatterName('preset: editorial\nrule: auto', 'rule'), 'auto');
  // A trailing comment and quoting read through the one shared scalar rule.
  assert.equal(frontMatterValue('preset: "brand"  # client look', 'spectrum'), 'solid');
  // Case-insensitive preset name, like every other register's lint.
  assert.equal(frontMatterName('preset: Minimal', 'corners'), 'rounded');
  // Keys outside the family are never touched by a preset.
  assert.equal(frontMatterName('preset: brand', 'finish'), null);
  assert.equal(frontMatterName('preset: brand', 'mode'), null);
  // An unknown preset resolves to nothing, not to a guess.
  assert.equal(frontMatterName('preset: editorail', 'rule'), null);
  // A preset that leaves a key at its default answers null, so the reader's own default runs.
  assert.equal(frontMatterName('preset: editorial', 'corners'), null);
  assert.equal(presetEffective('editorial', 'corners'), 'square');
  assert.equal(readFrontMatterPreset('---\npreset: brand\n---\n# x'), 'brand');
});

test('the engine stamps a preset on every slide, and an explicit key overrides it', () => {
  const none = sectionClasses(render([]));
  const brand = sectionClasses(render(['preset: brand']));
  const override = sectionClasses(render(['preset: brand', 'rule: none']));
  assert.equal(brand.length, 2);
  for (const cls of none) {
    // THE CONTROL: none of these tokens ships on a deck with no preset.
    for (const t of ['spectrum-solid', 'spectrum-trim', 'rule-accent', 'eyebrow-dot', 'lifted']) assert.ok(!cls.has(t), t);
  }
  for (const cls of brand) {
    for (const t of ['spectrum-solid', 'spectrum-trim', 'rule-accent', 'eyebrow-dot', 'lifted']) assert.ok(cls.has(t), t);
  }
  for (const cls of override) {
    assert.ok(cls.has('rule-none'));
    assert.ok(!cls.has('rule-accent'));
    assert.ok(cls.has('spectrum-solid'), 'the rest of the preset still applies');
  }
});

test('classic is the house default, named — it renders byte-identical to no preset', () => {
  assert.equal(render(['preset: classic']), render([]));
});
