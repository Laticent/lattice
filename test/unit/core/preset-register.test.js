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
const { TYPOGRAPHY_NAMES } = require(path.join(ROOT, 'lib/core/resolve-typography.js'));
const { SPECTRUM_REGISTER, CARD_SPECTRUM_REGISTER, TRIM_SPECTRUM_REGISTER } = require(path.join(ROOT, 'lib/core/resolve-spectrum.js'));

const VOCAB = {
  finish: FINISH_NAMES,
  rule: RULE_NAMES,
  eyebrow: EYEBROW_NAMES,
  headline: HEADLINE_NAMES,
  lift: LIFT_NAMES,
  corners: CORNERS_NAMES,
  typography: TYPOGRAPHY_NAMES,
};

const deck = (fm) => ['---', 'theme: indaco', ...fm, '---', '', '# Cover', '', '---', '', '## Second', '', 'Body.'].join('\n');
const render = (fm) => latticeEngine.createEngine().render(deck(fm)).html;
const sectionClasses = (html) => [...new JSDOM(html).window.document.querySelectorAll('section')]
  .map((s) => new Set((s.getAttribute('class') || '').split(/\s+/).filter(Boolean)));

// The RECOMMENDATION keys (D1, engineering/decisions/2026-11-20-deck-preset-study.md): each is checked by
// its own register's parser, because two take more than one word and `theme` names a palette file.
const { COLOR_MODE_NAMES } = require(path.join(ROOT, 'lib/core/resolve-color-mode.js'));
const { MODE_NAMES } = require(path.join(ROOT, 'lib/core/resolve-mode.js'));
const { parseMarks, MARKS_DEFAULT } = require(path.join(ROOT, 'lib/core/resolve-marks.js'));
const { parseBackdrop } = require(path.join(ROOT, 'lib/core/resolve-backdrop.js'));
const { COVER_REGISTER } = require(path.join(ROOT, 'lib/core/resolve-cover.js'));
const fs = require('node:fs');
const clean = (p) => p.unknown.length === 0 && p.duplicate.length === 0;
const ACCEPTS = {
  theme: (v) => v === '' || fs.existsSync(path.join(ROOT, 'themes', v, `${v}.css`)),
  'color-mode': (v) => v === '' || COLOR_MODE_NAMES.includes(v),
  mode: (v) => MODE_NAMES.includes(v),
  marks: (v) => clean(parseMarks(v)),
  backdrop: (v) => v === '' || clean(parseBackdrop(v)),
  // The spectrum keys take one word per axis (lib/core/resolve-spectrum.js).
  spectrum: (v) => v !== '' && clean(SPECTRUM_REGISTER.parse(v)),
  'card-spectrum': (v) => v !== '' && clean(CARD_SPECTRUM_REGISTER.parse(v)),
  'trim-spectrum': (v) => v !== '' && clean(TRIM_SPECTRUM_REGISTER.parse(v)),
  // `cover:` takes a surface and a composition (lib/core/resolve-cover.js).
  cover: (v) => v !== '' && clean(COVER_REGISTER.parse(v)),
};

test('every value a preset sets is one its register accepts, and every default is too', () => {
  assert.deepEqual([...PRESET_KEYS].sort(), [...Object.keys(VOCAB), ...Object.keys(ACCEPTS)].sort());
  assert.equal(PRESET_DEFAULTS.marks, MARKS_DEFAULT, 'the marks default is the register\'s own');
  const accepts = (key, v) => (VOCAB[key] ? VOCAB[key].includes(v) : ACCEPTS[key](v));
  for (const key of PRESET_KEYS) {
    assert.ok(accepts(key, PRESET_DEFAULTS[key]), `default ${key}: ${PRESET_DEFAULTS[key]}`);
    for (const name of PRESET_NAMES) {
      const v = PRESETS[name].values[key];
      if (v !== undefined) {
        assert.ok(accepts(key, v), `${name}.${key}: ${v}`);
        // A preset lists only what it CHANGES — a default restated would make the
        // "N changes" count in the Studio disagree with what the deck renders.
        assert.notEqual(v, PRESET_DEFAULTS[key], `${name}.${key} restates the default`);
      }
    }
  }
  // A recommendation key is written by an author too; this pins the vocabulary the arms above read.
  assert.ok(ACCEPTS.marks('etch vivid') && !ACCEPTS.marks('etch bogus'));
  assert.ok(ACCEPTS.backdrop('40 clear') && !ACCEPTS.backdrop('loud'));
  assert.ok(ACCEPTS.theme('cuoio') && !ACCEPTS.theme('nope'));
  assert.ok(ACCEPTS.spectrum('solid left band') && !ACCEPTS.spectrum('on') && !ACCEPTS.spectrum('left right'));
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
    for (const t of ['spectrum-solid', 'card-spectrum-solid', 'trim-spectrum-solid', 'rule-accent', 'eyebrow-dot', 'lifted', 'typography-poster']) assert.ok(!cls.has(t), t);
  }
  for (const cls of brand) {
    for (const t of ['spectrum-solid', 'card-spectrum-solid', 'trim-spectrum-solid', 'rule-accent', 'eyebrow-dot', 'lifted', 'typography-poster']) assert.ok(cls.has(t), t);
  }
  for (const cls of override) {
    assert.ok(cls.has('no-heading-rule'));
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

test('the engine stamps the set class a preset carries, and an explicit typography: wins', () => {
  for (const cls of sectionClasses(render(['preset: editorial']))) assert.ok(cls.has('typography-ledger'));
  for (const cls of sectionClasses(render(['preset: editorial', 'typography: festival']))) {
    assert.ok(cls.has('typography-festival'));
    assert.ok(!cls.has('typography-ledger'));
  }
  // classic stamps nothing, so `typography: classic` undoes a preset's set.
  for (const cls of sectionClasses(render(['preset: brand', 'typography: classic']))) assert.ok(![...cls].some((t) => t.startsWith('typography-')));
});
