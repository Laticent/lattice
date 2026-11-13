/**
 * The `typography:` register (lib/core/resolve-typography.js): the curated set list, its class
 * tokens, the preset mapping, the size factors the emitter bakes in, and the two lint findings
 * that steer authors to it. Record: engineering/decisions/2026-11-09-type-voices.md § Decided.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  TYPOGRAPHY_NAMES, TYPOGRAPHY_TOKENS, TYPOGRAPHY_SETS, TYPOGRAPHY_DEFAULT, typographyClass, isTypographyToken, isKnownTypography,
} = require('../../../lib/core/resolve-typography');
const { frontMatterName, presetEffective } = require('../../../lib/core/front-matter-key');
const { typographyTokensCss } = require('../../../lib/typography/emit');
const { lintText } = require('../../../lib/authoring/lint');
const { TEXT_FACES } = require('../../../lib/fonts/text-faces');

const ROOT = path.join(__dirname, '..', '..', '..');

test('the four curated sets, classic first and the default', () => {
  assert.deepEqual([...TYPOGRAPHY_NAMES], ['classic', 'ledger', 'poster', 'festival']);
  assert.equal(TYPOGRAPHY_DEFAULT, 'classic');
  assert.deepEqual([...TYPOGRAPHY_TOKENS], ['typography-classic', 'typography-ledger', 'typography-poster', 'typography-festival']);
});

test('a set maps to its class token; classic, unknown and empty map to none', () => {
  assert.equal(typographyClass('ledger'), 'typography-ledger');
  assert.equal(typographyClass(' Poster '), 'typography-poster');
  assert.equal(typographyClass('classic'), '');
  assert.equal(typographyClass('ledgr'), '');
  assert.equal(typographyClass(''), '');
  assert.equal(typographyClass(undefined), '');
  assert.ok(isTypographyToken('typography-festival'));
  assert.ok(!isTypographyToken('typography'));
  assert.ok(isKnownTypography('FESTIVAL'));
});

test('presets carry a set and an explicit typography: wins', () => {
  assert.equal(presetEffective('classic', 'typography'), 'classic');
  assert.equal(presetEffective('editorial', 'typography'), 'ledger');
  assert.equal(presetEffective('brand', 'typography'), 'poster');
  // minimal's own set (Inter throughout) is not one of the first four, so it keeps classic.
  assert.equal(presetEffective('minimal', 'typography'), 'classic');
  assert.equal(frontMatterName('preset: editorial', 'typography'), 'ledger');
  assert.equal(frontMatterName('preset: editorial\ntypography: festival', 'typography'), 'festival');
});

test('every set face ships through the font manifest, with an italic for the eyebrow', () => {
  const families = new Set(TEXT_FACES.map((f) => f.family));
  for (const name of TYPOGRAPHY_NAMES) {
    const { display, body } = TYPOGRAPHY_SETS[name];
    assert.ok(families.has(display), `${name}: ${display} is not in lib/fonts/text-faces.js`);
    assert.ok(families.has(body), `${name}: ${body} is not in lib/fonts/text-faces.js`);
    assert.ok(TEXT_FACES.some((f) => f.family === display && f.style === 'italic' && f.weight === 400), `${name}: ${display} has no 400 italic, so its eyebrow would be a slanted roman`);
  }
});

test('each set class names its faces in base.typography.css', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib', 'base', 'base.typography.css'), 'utf8');
  for (const name of TYPOGRAPHY_NAMES) {
    const { cls, display, body } = TYPOGRAPHY_SETS[name];
    if (!cls) continue;
    const block = css.match(new RegExp(`section\\.${cls}[^{]*\\{([^}]*)\\}`));
    assert.ok(block, `no section.${cls} rule`);
    assert.match(block[1], new RegExp(`--font-display:\\s*'${display}'`));
    assert.match(block[1], new RegExp(`--font-body:\\s*'${body}'`));
  }
});

test('the size factor follows the FACE: each set face carries its size-adjust, and no --fs-* role carries one', () => {
  // Every role keeps the size classic gives it, so a rule that sets the display face at body size (a
  // blockquote, the q-and-a question) cannot be scaled by the body face's factor.
  assert.doesNotMatch(typographyTokensCss(), /--type-/);
  const { faceMetricsDecl } = require('../../../lib/fonts/text-faces');
  const { faceRuleCss } = require('../../../lib/fonts/face-rule');
  const factor = (family) => TEXT_FACES.filter((f) => f.family === family).map((f) => f.sizeAdjust ?? 1);
  assert.deepEqual([...new Set(factor('Inter'))], [0.87]);
  assert.deepEqual([...new Set(factor('Fraunces'))], [0.92]);
  assert.deepEqual([...new Set(factor('Barlow Condensed'))], [1.1]);
  assert.deepEqual([...new Set(factor('Newsreader'))], [1]);
  for (const classic of ['Playfair Display', 'Outfit', 'JetBrains Mono']) assert.deepEqual([...new Set(factor(classic))], [1], classic);
  const inter = TEXT_FACES.find((f) => f.family === 'Inter');
  assert.equal(faceMetricsDecl(inter), 'size-adjust:87%;');
  assert.match(faceRuleCss(inter, 'swap', 'AA'), /font-display:swap;size-adjust:87%;src:/);
  assert.doesNotMatch(faceRuleCss(TEXT_FACES.find((f) => f.family === 'Outfit'), 'swap', 'AA'), /size-adjust/);
  // face-rule.js inlines the descriptor text (it requires nothing); it must write what the manifest says.
  for (const f of TEXT_FACES) assert.ok(faceRuleCss(f, 'swap', 'AA').includes(`font-display:swap;${faceMetricsDecl(f)}src:`), f.family);
});

test("each set face's baseline sits where the default faces' does, so a row that aligns them on one baseline does not grow", () => {
  // half (ascent − descent), in em at the drawn size: where the baseline sits in a line of any height. Newsreader's
  // own metrics gave 0.235 against 0.36 for the mono and 0.37 for Outfit, and list-tabular's six baseline-aligned
  // rows grew past the frame under `typography: ledger`. Real metrics from the woff2 (OS/2 typo, USE_TYPO_METRICS).
  const own = { Inter: [0.969, 0.241], Fraunces: [0.978, 0.255], 'Barlow Condensed': [1.0, 0.2], Newsreader: [0.735, 0.265] };
  for (const [family, [a, d]] of Object.entries(own)) {
    const f = TEXT_FACES.find((x) => x.family === family);
    const k = f.sizeAdjust ?? 1;
    const shift = ((f.ascent ?? a) - (f.descent ?? d)) / 2 * (f.ascent != null ? 1 : k);
    assert.ok(shift >= 0.3 && shift <= 0.45, `${family} baseline at ${shift.toFixed(3)} em`);
  }
  const { faceMetricsDecl } = require('../../../lib/fonts/text-faces');
  assert.equal(faceMetricsDecl(TEXT_FACES.find((f) => f.family === 'Newsreader')), 'ascent-override:98%;descent-override:26%;');
});

const deck = (fm) => `---\nmarp: true\ntheme: indaco\n${fm}---\n\n# Title\n\nBody text.\n`;
const rules = (fm) => lintText(deck(fm)).filter((f) => /typography|unknown-key/.test(f.rule));

test('lint: an unknown set, a `type:` key and a style block that re-points a set face', () => {
  assert.deepEqual(rules('typography: ledger\n'), []);
  const unknown = rules('typography: ledgr\n');
  assert.equal(unknown.length, 1);
  assert.equal(unknown[0].rule, 'unknown-typography');
  const type = rules('type: pitch-deck\n');
  assert.equal(type[0].rule, 'unknown-key');
  assert.equal(type[0].didYouMean, 'typography');
  assert.equal(type[0].replace, undefined, '`type: pitch-deck` is a content type; renaming the key is not a fix');
  const style = rules('style: |\n  section { --font-display: "Brand Serif"; --font-display: x; --eyebrow-face: y; }\n');
  assert.deepEqual(style.map((f) => [f.rule, f.classToken]), [['typography-style-override', '--font-display'], ['typography-style-override', '--eyebrow-face']]);
  assert.deepEqual(rules('style: |\n  section { --accent: red; }\n'), []);
  assert.deepEqual(rules('style: |\n  /* --font-display: x; */\n  section { --accent: red; }\n'), [], 'a comment overrides nothing');
  assert.deepEqual(rules('style: |\n  section { --font-body\t: x; }\n').map((f) => f.classToken), ['--font-body']);
});

test('an export inlines a set face only when the deck (or a slide) names that set', () => {
  const { SET_ONLY_FAMILIES, setFamiliesFor } = require('../../../lib/core/resolve-typography');
  assert.deepEqual([...SET_ONLY_FAMILIES].sort(), ['Barlow Condensed', 'Fraunces', 'Inter', 'Newsreader']);
  assert.deepEqual(setFamiliesFor('', '# Hi'), []);
  assert.deepEqual(setFamiliesFor('classic', '# Hi'), []);
  assert.deepEqual(setFamiliesFor('Ledger', '# Hi').sort(), ['Inter', 'Newsreader']);
  assert.deepEqual(setFamiliesFor('', '<!-- _class: bar typography-poster -->').sort(), ['Barlow Condensed', 'Inter']);
});
