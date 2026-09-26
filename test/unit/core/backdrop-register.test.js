/**
 * The `backdrop:` register (lib/core/resolve-backdrop.js) — restraint over ANY finish.
 *
 * Four claims, each with its control:
 *   1. the kernel sorts words onto two axes and drops what it does not know;
 *   2. BOTH render paths stamp the tokens (the engine here, the real runtime bundle below)
 *      and a deck without the key is unchanged;
 *   3. a slide's token evicts the deck's on ITS axis only;
 *   4. the CSS reads the register BEFORE the finish's baked value, and flips to the hard
 *      mirror in export.
 * The rendered behavior (dimmed / masked pixels in the real PDF) is verified by the demo deck
 * examples/backdrop-register.md, not here — jsdom computes no custom properties.
 * See engineering/decisions/2026-09-26-backdrop-register.md.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const latticeEngine = require(path.join(ROOT, 'lib/engine'));
const {
  BACKDROP_NAMES, BACKDROP_TOKENS, parseBackdrop, backdropClasses, readBackdrop,
  isBackdropStrengthToken, isBackdropMaskToken,
} = require(path.join(ROOT, 'lib/core/resolve-backdrop.js'));
const { lintText } = require(path.join(ROOT, 'lib/authoring/lint.js'));

const deck = (fm, body) =>
  ['---', 'theme: indaco', ...fm, '---', '', body || '# Deck\n\nSome prose.\n\n---\n\n## Two\n\nMore prose.'].join('\n');
const classesOf = (fm, body) => {
  const doc = new JSDOM(latticeEngine.createEngine().render(deck(fm, body)).html).window.document;
  return [...doc.querySelectorAll('section')].map((s) => s.className.split(/\s+/).filter(Boolean));
};

test('kernel: words sort onto two axes; order does not matter; `%` is accepted', () => {
  assert.deepEqual(backdropClasses('40 clear'), ['backdrop-40', 'backdrop-clear']);
  assert.deepEqual(backdropClasses('spot-tr 60%'), ['backdrop-60', 'backdrop-spot-tr']);
  assert.deepEqual(backdropClasses('full'), ['backdrop-full']);
  assert.deepEqual(backdropClasses('open'), ['backdrop-open']);
});

test('kernel: unknown words stamp nothing; a second word on a filled axis is dropped', () => {
  assert.deepEqual(backdropClasses('35 blur'), []);
  const p = parseBackdrop('40 60 clear spot-c');
  assert.equal(p.strength, '40');
  assert.equal(p.mask, 'clear');
  assert.deepEqual(p.duplicate, ['60', 'spot-c']);
  assert.deepEqual(backdropClasses(''), []);
  assert.deepEqual(backdropClasses(undefined), []);
});

test('kernel: `backdrop-none` stays the finish-none alias, not a register token', () => {
  assert.ok(!BACKDROP_TOKENS.includes('backdrop-none'));
  assert.ok(!BACKDROP_NAMES.includes('none'));
});

test('kernel: reads the TOP-LEVEL key only, never finish-override\'s nested `backdrop:` header', () => {
  const nested = 'finish: atrium\nfinish-override:\n  backdrop:\n    strength: 0.4';
  assert.equal(readBackdrop(nested), null);
  assert.equal(readBackdrop('backdrop: 40 clear  # quiet deck'), '40 clear');
  // The Studio's front-matter writer quotes a value with a space; the register must read it.
  assert.deepEqual(backdropClasses(readBackdrop('backdrop: "40 clear"')), ['backdrop-40', 'backdrop-clear']);
  assert.equal(readBackdrop('backdrop:'), null, 'the retired map header is not a value');
});

test('engine: stamps both tokens on every slide, and nothing without the key', () => {
  const on = classesOf(['finish: atrium', 'backdrop: 40 clear']);
  const off = classesOf(['finish: atrium']);
  assert.ok(on.length >= 2);
  for (const cls of on) {
    assert.ok(cls.includes('backdrop-40') && cls.includes('backdrop-clear'), cls.join(' '));
  }
  for (const cls of off) {
    assert.ok(!cls.some((c) => isBackdropStrengthToken(c) || isBackdropMaskToken(c)), cls.join(' '));
  }
});

test('engine: a slide\'s token evicts the deck\'s on its own axis only', () => {
  const body = '# Deck\n\nSome prose.\n\n---\n\n<!-- _class: backdrop-spot-tr -->\n\n## Two\n\nMore prose.\n\n---\n\n<!-- _class: backdrop-full -->\n\n## Three\n\nProse.';
  const [one, two, three] = classesOf(['finish: halo', 'backdrop: 40 clear'], body);
  assert.ok(one.includes('backdrop-40') && one.includes('backdrop-clear'));
  // mask replaced, strength kept
  assert.ok(two.includes('backdrop-spot-tr') && !two.includes('backdrop-clear'), two.join(' '));
  assert.ok(two.includes('backdrop-40'), two.join(' '));
  // strength replaced, mask kept
  assert.ok(three.includes('backdrop-full') && !three.includes('backdrop-40'), three.join(' '));
  assert.ok(three.includes('backdrop-clear'), three.join(' '));
});

test('css: the compositor reads the register first, then the baked value', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib/base/base.finish.css'), 'utf8');
  assert.match(css, /background-image:\s*var\(--backdrop-scrim,\s*var\(--fin-backdrop-mask,\s*none\)\),\s*var\(--backdrop-dim-scrim,\s*var\(--fin-backdrop-dim-scrim,\s*none\)\)/);
  for (const n of [20, 40, 60, 80]) {
    // A step always uses the veil: a deck's step can sit over a finish saved with an old baked
    // mask, and group opacity around that mask is the poppler wedge.
    assert.match(css, new RegExp(`section\\.backdrop-${n} \\{ --backdrop-strength-opacity: 0\\.${n / 10}; --backdrop-veil-weight: 1; --backdrop-dim-scrim: var\\(--backdrop-veil-fill\\); \\}`));
  }
  for (const t of BACKDROP_TOKENS) {
    assert.ok(new RegExp(`section\\.${t}\\b`).test(css), `no rule for ${t}`);
  }
  // The export flip must FOLLOW the class rules, or a class would win in print and ship the
  // feathered mask, which grays in the vector PDF.
  const lastClass = css.lastIndexOf('section.backdrop-spot-br');
  const flip = css.indexOf('section.finish { --backdrop-scrim: var(--backdrop-scrim-opaque); --backdrop-clear-bleed: 0px; --backdrop-clear-filter: none; }');
  assert.ok(flip > lastClass && lastClass > 0, 'export flip must come after the class rules');
  // The veil the masks use is (100 − N)% canvas, N from the step, else the baked strength.
  assert.ok(css.includes('--backdrop-veil-fill: linear-gradient(color-mix(in srgb, var(--fin-canvas) calc(100% - var(--backdrop-strength-opacity, var(--fin-backdrop-strength, 1)) * 100%), transparent) 0 0);'));
});

test('lint: an unknown word and a doubled axis both warn; a clean value is silent', () => {
  const rules = (fm) => lintText(deck(fm)).filter((f) => f.rule === 'unknown-backdrop');
  assert.equal(rules(['finish: atrium', 'backdrop: 40 clear']).length, 0);
  assert.equal(rules(['finish: atrium', 'backdrop: 35']).length, 1);
  assert.equal(rules(['finish: atrium', 'backdrop: 40 60']).length, 1);
  const retired = lintText(deck(['backdrop:', '  strength: 0.4'])).filter((f) => f.rule === 'retired-backdrop-key');
  assert.equal(retired.length, 1, 'the map form still earns its migration warning');
  const scalar = lintText(deck(['backdrop: 40'])).filter((f) => f.rule === 'retired-backdrop-key');
  assert.equal(scalar.length, 0, 'the scalar form is live, not retired');
});

/* ── The runtime's own mirror, from a baked block (the export path) ──────────────────── */

const RUNTIME_BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');
const { frontMatterBlock } = require(path.join(ROOT, 'lib/core/deck-front-matter.js'));

function renderRuntimeBaked(deckSource, markup) {
  const bundle = fs.readFileSync(RUNTIME_BUNDLE, 'utf8');
  // CONTENT, not mtime (guards-register-paths.test.js explains why). The spot tokens are
  // built from this list at runtime, so the list itself is the fingerprint.
  assert.ok(/"tl", *"t", *"tr", *"l", *"c", *"r", *"bl", *"b", *"br"/.test(bundle),
    'dist/lattice-runtime.js predates the backdrop register — run `npm run runtime:build` and re-run.');
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>${markup}${frontMatterBlock(deckSource)}</body></html>`,
    { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  dom.window.fetch = () => Promise.reject(new Error('baked: no fetch expected'));
  const el = dom.window.document.createElement('script');
  el.textContent = bundle;
  dom.window.document.body.appendChild(el);
  return new Promise((r) => setTimeout(() => r(dom.window.document), 1000));
}

test('runtime: stamps the tokens from a baked block, and evicts per axis', async () => {
  const markup = '<section class="content"><h2>One</h2></section>'
    + '<section class="content backdrop-80"><h2>Two</h2></section>';
  const on = await renderRuntimeBaked(deck(['finish: atrium', 'backdrop: 40 clear']), markup);
  const off = await renderRuntimeBaked(deck(['finish: atrium']), markup);
  const [a, b] = [...on.querySelectorAll('section')].map((s) => s.className.split(/\s+/));
  assert.ok(a.includes('backdrop-40') && a.includes('backdrop-clear'), a.join(' '));
  assert.ok(b.includes('backdrop-80') && !b.includes('backdrop-40') && b.includes('backdrop-clear'), b.join(' '));
  const offCls = [...off.querySelectorAll('section')].map((s) => s.className).join(' | ');
  assert.ok(!/backdrop-(40|clear)/.test(offCls), `control: ${offCls}`);
});

/* ── Fixes from the maker-checker pass ─────────────────────────────────────────────────── */

test('css: `finish-none` / `backdrop-none` clear the register layers a deck line still stamps', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib/base/base.finish.css'), 'utf8');
  const optOut = css.match(/section\.finish-none,\s*section\.backdrop-none\s*\{[^}]*\}/);
  assert.ok(optOut, 'opt-out rule missing');
  for (const decl of ['--backdrop-scrim: none', '--backdrop-scrim-opaque: none', '--backdrop-dim-scrim: none', '--backdrop-opacity: 1']) {
    assert.ok(optOut[0].includes(decl), `opt-out must reset ${decl}`);
  }
  // It must FOLLOW the register's print flip, or the flip re-arms the mask in the PDF.
  assert.ok(css.indexOf('section.finish-none,') > css.indexOf('section.finish { --backdrop-scrim: var(--backdrop-scrim-opaque); --backdrop-clear-bleed: 0px; --backdrop-clear-filter: none; }'));
});

test('css: the veil steps clear of the overflow QA ring', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib/base/base.finish.css'), 'utf8');
  assert.match(css, /section\.finish\.overflow:not\(\[data-lattice-overflow-marker="reader"\]\):not\(\[data-lattice-overflow-marker="off"\]\) > \.backdrop > \.backdrop-mask \{\s*inset: 4px;/);
});

test('lint: `backdrop-*` classes are a closed vocabulary; `backdrop-none` stays valid', () => {
  const unknown = (cls) => lintText(`---\ntheme: indaco\nfinish: atrium\n---\n\n<!-- _class: ${cls} -->\n\n## A\n\nBody.\n`)
    .filter((f) => f.rule === 'unknown-class').map((f) => f.classToken);
  assert.deepEqual(unknown('backdrop-50 backdrop-spot-x'), ['backdrop-50', 'backdrop-spot-x']);
  assert.deepEqual(unknown('backdrop-40 backdrop-clear'), []);
  assert.deepEqual(unknown('backdrop-none'), []);
});

test('lint: a quoted value is read the way the engine reads it', () => {
  const words = (v) => lintText(deck(['finish: atrium', `backdrop: ${v}`])).filter((f) => f.rule === 'unknown-backdrop').map((f) => f.classToken);
  assert.deepEqual(words('"40 clear"'), []);
  assert.deepEqual(words('40 clear # quiet'), []);
});

/* ── Clear behind content = the frame's content box (owner decision 2026-09-26) ─────────── */

test('css: clear paints the frame content box, not a central ellipse', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib/base/base.finish.css'), 'utf8');
  // The padding chain that makes the layer's content box the section's content box.
  assert.match(css, /section\.finish > \.backdrop,\s*section\.finish > \.backdrop > \.backdrop-mask \{\s*padding: inherit;/);
  const layer = css.match(/section\.finish > \.backdrop > \.backdrop-mask::before \{[^}]*\}/);
  assert.ok(layer, 'clear layer missing');
  for (const decl of ['padding: inherit', 'background-origin: content-box', 'background-repeat: no-repeat',
    'var(--backdrop-clear-scrim, var(--fin-backdrop-clear-scrim, none))', 'filter: var(--backdrop-clear-filter, none)']) {
    assert.ok(layer[0].includes(decl), `clear layer must carry ${decl}`);
  }
  const clear = css.match(/section\.backdrop-clear \{[^}]*\}/)[0];
  assert.match(clear, /--backdrop-clear-scrim: var\(--backdrop-clear-fill\)/);
  assert.doesNotMatch(clear, /--backdrop-clear-mask/, 'the register must not use the legacy ellipse');
});

test('css: the soft edge exists on screen only; both export guards make it hard', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib/base/base.finish.css'), 'utf8');
  const guards = css.match(/:where\(\.lattice-exporting\) section\.finish,\s*section\.finish\.lattice-exporting \{\s*--backdrop-scrim: var\(--backdrop-scrim-opaque\);[^}]*\}/);
  assert.ok(guards, 'exporting guard missing');
  assert.match(guards[0], /--backdrop-clear-bleed: 0px;/);
  // `filter: none`, not a 0px blur: Chromium still treats blur(0px) as a filter in print and
  // rasterizes the page, and poppler then outlines the content box in gray.
  assert.match(guards[0], /--backdrop-clear-filter: none;/);
  assert.match(css, /@media print \{\s*section\.finish \{[^}]*--backdrop-clear-filter: none;/);
  assert.doesNotMatch(css, /--backdrop-clear-blur: 0px/);
});

test('css: open, spotlight and finish-none switch the clear layer off; tone slides offset it', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib/base/base.finish.css'), 'utf8');
  assert.match(css.match(/section\.backdrop-open \{[^}]*\}/)[0], /--backdrop-clear-scrim: none/);
  assert.match(css.match(/section:is\(\.backdrop-spot-tl,[^{]*\{[^}]*\}/)[0], /--backdrop-clear-scrim: none/);
  const optOut = css.match(/section\.finish-none,\s*section\.backdrop-none\s*\{[^}]*\}/)[0];
  assert.match(optOut, /--backdrop-clear-scrim: none/);
  assert.match(optOut, /--fin-backdrop-clear-scrim: none/);
  assert.match(optOut, /--backdrop-clear-filter: none/);
  assert.match(css, /tone-skip\)\.finish > \.backdrop > \.backdrop-mask::before \{\s*left: -8px;/);
});

test('css: a baked strength without a mask stays opacity; steps and masks use the veil', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib/base/base.finish.css'), 'utf8');
  // The compositor: a step, else the baked strength, drawn as opacity only while the veil weight is 0.
  assert.ok(css.includes('opacity: var(--backdrop-opacity, calc(1 - (1 - var(--backdrop-strength-opacity, var(--fin-backdrop-strength, 1))) * (1 - var(--backdrop-veil-weight, var(--fin-backdrop-veil-weight, 0)))));'));
  assert.ok(css.includes('var(--backdrop-dim-scrim, var(--fin-backdrop-dim-scrim, none))'));
  // Only a finish's own baked strength with no mask keeps opacity: nothing sets the weight on
  // `section.finish`, so the fallback is 0 and a deck without the register exports as before.
  assert.doesNotMatch(css, /section\.finish \{[^}]*--backdrop-veil-weight/);
  // No rule veils every finish slide (it seamed baked-strength pages in poppler).
  assert.doesNotMatch(css, /section\.finish \{\s*--backdrop-opacity: 1;/);
  // Masks switch to the veil; `open` removes every mask and switches back.
  assert.match(css.match(/section\.backdrop-clear \{[^}]*\}/)[0], /--backdrop-veil-weight: 1;[^}]*--backdrop-dim-scrim: var\(--backdrop-veil-fill\)/);
  assert.match(css.match(/section:is\(\.backdrop-spot-tl,[^{]*\{[^}]*\}/)[0], /--backdrop-veil-weight: 1;/);
  assert.match(css.match(/section\.backdrop-open \{[^}]*\}/)[0], /--backdrop-veil-weight: 0;[^}]*--backdrop-dim-scrim: none;/);
});

test('css: the on-screen clear fade is wide, and the content box stays canvas', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib/base/base.finish.css'), 'utf8');
  const bleed = Number(css.match(/--backdrop-clear-bleed: calc\(var\(--_sec-1cqi, 1cqi\) \* ([\d.]+)\)/)[1]);
  const blur = Number(css.match(/--backdrop-clear-blur: calc\(var\(--_sec-1cqi, 1cqi\) \* ([\d.]+)\)/)[1]);
  // A narrow fade reads as a panel with a border (owner review, 2026-09-26).
  assert.ok(bleed >= 4, `bleed ${bleed}cqi is too narrow to read as a fade`);
  // Two standard deviations inside the bleed keeps the content box's edge ≥97.7% canvas.
  assert.ok(blur * 2 <= bleed, `blur ${blur}cqi reaches into the content box`);
});
