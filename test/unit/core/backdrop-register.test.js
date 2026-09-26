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
  assert.match(css, /opacity:\s*var\(--backdrop-opacity,\s*var\(--fin-backdrop-strength,\s*1\)\)/);
  assert.match(css, /background-image:\s*var\(--backdrop-scrim,\s*var\(--fin-backdrop-mask,\s*none\)\),\s*var\(--backdrop-dim-scrim,\s*none\)/);
  // Strength is a VEIL, never a group opacity below 1: an opacity group around the mask is
  // what poppler draws as a dark wedge in the PDF (see the CSS comment).
  for (const n of [20, 40, 60, 80]) {
    const rule = css.match(new RegExp(`section\\.backdrop-${n} \\{[^}]*\\}`));
    assert.ok(rule, `backdrop-${n} rule missing`);
    assert.match(rule[0], new RegExp(`--backdrop-dim-scrim:[^;]*var\\(--fin-canvas\\) ${100 - n}%`));
    assert.doesNotMatch(rule[0], /--backdrop-opacity:\s*0/);
  }
  for (const t of BACKDROP_TOKENS) {
    assert.ok(new RegExp(`section\\.${t}\\b`).test(css), `no rule for ${t}`);
  }
  // The export flip must FOLLOW the class rules, or a class would win in print and ship the
  // feathered mask, which grays in the vector PDF.
  const lastClass = css.lastIndexOf('section.backdrop-spot-br');
  const flip = css.indexOf('section.finish { --backdrop-scrim: var(--backdrop-scrim-opaque); }');
  assert.ok(flip > lastClass && lastClass > 0, 'export flip must come after the class rules');
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
  assert.ok(css.indexOf('section.finish-none,') > css.indexOf('section.finish { --backdrop-scrim: var(--backdrop-scrim-opaque); }'));
});

test('css: a mask class turns a baked dim into the veil, so no opacity group wraps the mask', () => {
  const css = fs.readFileSync(path.join(ROOT, 'lib/base/base.finish.css'), 'utf8');
  const rule = css.match(/section:is\(\.backdrop-clear,[^{]*\{[^}]*\}/);
  assert.ok(rule, 'mask-class rule missing');
  assert.match(rule[0], /--backdrop-opacity:\s*1/);
  assert.match(rule[0], /calc\(100% - var\(--fin-backdrop-strength, 1\) \* 100%\)/);
  // Strength classes come AFTER, so an explicit step still wins.
  assert.ok(css.indexOf(rule[0]) < css.indexOf('section.backdrop-20 {'));
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
