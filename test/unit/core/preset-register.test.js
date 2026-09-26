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
const { FINISH_NAMES } = require(path.join(ROOT, 'lib/core/resolve-finish.js'));
const { EYEBROW_NAMES } = require(path.join(ROOT, 'lib/core/resolve-eyebrow.js'));
const { HEADLINE_NAMES } = require(path.join(ROOT, 'lib/core/resolve-headline.js'));
const { LIFT_NAMES } = require(path.join(ROOT, 'lib/core/resolve-lift.js'));
const { CORNERS_NAMES } = require(path.join(ROOT, 'lib/core/resolve-corners.js'));
const {
  SPECTRUM_NAMES, SPECTRUM_EDGE_NAMES, SPECTRUM_CARD_NAMES, SPECTRUM_CARD_EDGE_NAMES, SPECTRUM_TRIM_NAMES,
} = require(path.join(ROOT, 'lib/core/resolve-spectrum.js'));

const VOCAB = {
  finish: FINISH_NAMES,
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
  // The backdrop is in the family; the rendering hand and the frame claim are not.
  assert.equal(frontMatterName('preset: brand', 'finish'), 'strata');
  assert.equal(frontMatterName('preset: brand\nfinish: none', 'finish'), 'none');
  assert.equal(frontMatterName('preset: brand', 'mode'), null);
  assert.equal(frontMatterName('preset: brand', 'claim'), null);
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

test('an empty or comment-only key says nothing, so the preset applies; a nested preset: does not', () => {
  // Control: an explicit value still wins.
  assert.equal(frontMatterName('preset: editorial\nrule: none', 'rule'), 'none');
  assert.equal(frontMatterName('preset: editorial\nrule:', 'rule'), 'short');
  assert.equal(frontMatterName('preset: editorial\nrule: # todo', 'rule'), 'short');
  // A malformed value is still the deck speaking: it renders the default, not the preset.
  assert.equal(frontMatterName('preset: editorial\nrule: foo bar', 'rule'), null);
  // `preset:` is read top-level only — the Studio's picker writes column 0, so a nested key
  // would drive a render the picker can neither see nor change.
  assert.equal(frontMatterName('pptx:\n  preset: brand', 'spectrum'), null);
  assert.equal(frontMatterName('preset: brand', 'spectrum'), 'solid');
  // Keys outside the family keep the old reading of an empty value exactly.
  assert.equal(frontMatterValue('preset: brand\nclaim:', 'claim'), '');
});

test('unknown-preset flags a typo even when a comment follows it', () => {
  const { lintText } = require(path.join(ROOT, 'lib/authoring/lint.js'));
  const hits = (fm) => lintText(`---\n${fm}\n---\n\n# Hi\n`).filter((f) => f.rule === 'unknown-preset');
  assert.equal(hits('preset: editorial').length, 0); // control
  assert.equal(hits('preset: editorail').length, 1);
  assert.equal(hits('preset: editorail  # typo').length, 1);
});

test('a preset renders its backdrop and alignment, and an explicit finish: none keeps a deck clean', () => {
  const ed = sectionClasses(render(['preset: editorial']));
  const none = sectionClasses(render(['preset: editorial', 'finish: none']));
  const plain = sectionClasses(render([]));
  for (const cls of plain) assert.ok(!cls.has('finish-ledger') && !cls.has('head-left')); // control
  for (const cls of ed) assert.ok(cls.has('finish-ledger') && cls.has('head-left'));
  for (const cls of none) {
    assert.ok(!cls.has('finish-ledger'));
    assert.ok(cls.has('head-left'), 'the rest of the preset still applies');
  }
});
