/**
 * The `cover:` register — the surface of the front and back cover (lib/core/resolve-cover.js).
 *
 *   1. the kernel maps `light` to `cover-light`, stamps nothing for the default `inverse`, and
 *      drops what it does not know;
 *   2. BOTH render paths (the engine here, the real runtime bundle below) stamp the class on
 *      TITLE and CLOSING slides only, and a slide's own `cover-inverse` keeps its panel;
 *   3. the linter warns on an unknown word;
 *   4. the CSS repaints a light cover and leaves the old `title light` meaning alone (source
 *      shape here; the computed values are the finish-canvas matrix's job, in real Chromium).
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const latticeEngine = require(path.join(ROOT, 'lib/engine'));
const { COVER_REGISTER, coverClasses, coverDeckTokens, coverClassesFromFrontMatter } = require(path.join(ROOT, 'lib/core/resolve-cover.js'));
const { lintText } = require(path.join(ROOT, 'lib/authoring/lint.js'));
const { isSurfaceRegisterToken } = require(path.join(ROOT, 'lib/core/surface-registers.js'));

const TITLE = (cls = '') => `<!-- _class: title ${cls} -->\n\n# A deck.\n\n\`Eyebrow\`\n\nA subtitle.`;
const CONTENT = '## A content slide.\n\nWords.';
const CLOSING = (cls = '') => `<!-- _class: closing ${cls} -->\n\n## Thank you.\n\nA closing line.`;
const DIVIDER = '<!-- _class: divider -->\n\n## Part two.';
const deck = (fm, slides) => ['---', 'theme: indaco', ...fm, '---', '', slides.join('\n\n---\n\n')].join('\n');
const classesOf = (fm, slides) => {
  const doc = new JSDOM(latticeEngine.createEngine().render(deck(fm, slides)).html).window.document;
  return [...doc.querySelectorAll('section')].map((s) => s.className.split(/\s+/).filter(Boolean));
};

test('kernel: `light` stamps cover-light; `inverse`, unknown and absent stamp nothing', () => {
  assert.deepEqual(coverClasses('light'), ['cover-light']);
  assert.deepEqual(coverClasses('  LIGHT '), ['cover-light']);
  assert.deepEqual(coverClasses('inverse'), [], 'the default is the absence of a token, so old decks stay byte-identical');
  assert.deepEqual(coverClasses('pale'), []);
  assert.deepEqual(coverClassesFromFrontMatter('theme: indaco'), []);
  assert.deepEqual(coverClassesFromFrontMatter('cover: light'), ['cover-light']);
  assert.deepEqual(COVER_REGISTER.TOKENS, ['cover-inverse', 'cover-light']);
});

test('kernel: the token never collides with the `light` mood token or the narration `bookends`', () => {
  for (const t of COVER_REGISTER.TOKENS) assert.notEqual(t, 'light');
  assert.ok(isSurfaceRegisterToken('cover-light'), 'a decorating register rides a split page');
});

test('kernel: deck classes ride title and closing only, and never an axis the slide fills', () => {
  assert.deepEqual(coverDeckTokens(['title'], ['cover-light']), ['cover-light']);
  assert.deepEqual(coverDeckTokens(['closing', 'silent'], ['cover-light']), ['cover-light']);
  assert.deepEqual(coverDeckTokens(['content'], ['cover-light']), []);
  assert.deepEqual(coverDeckTokens(['divider'], ['cover-light']), [], 'dividers keep their own surface');
  assert.deepEqual(coverDeckTokens(['topic'], ['cover-light']), [], 'topic keeps its own surface');
  assert.deepEqual(coverDeckTokens(['title', 'cover-inverse'], ['cover-light']), [], 'a slide opts out with cover-inverse');
  assert.deepEqual(coverDeckTokens(['title'], []), []);
});

test('engine: stamps cover-light on title and closing only, and nothing without the key', () => {
  const [t, c, d, e] = classesOf(['cover: light'], [TITLE(), CONTENT, DIVIDER, CLOSING()]);
  assert.ok(t.includes('cover-light'), t.join(' '));
  assert.ok(!c.includes('cover-light'), c.join(' '));
  assert.ok(!d.includes('cover-light'), d.join(' '));
  assert.ok(e.includes('cover-light'), e.join(' '));
  for (const s of classesOf([], [TITLE(), CLOSING()])) assert.ok(!s.some((x) => x.startsWith('cover-')), s.join(' '));
  for (const s of classesOf(['cover: inverse'], [TITLE(), CLOSING()])) assert.ok(!s.some((x) => x.startsWith('cover-')), s.join(' '));
});

test('engine: a slide\'s cover-inverse keeps its panel in a `cover: light` deck', () => {
  const [t, e] = classesOf(['cover: light'], [TITLE(), CLOSING('cover-inverse')]);
  assert.ok(t.includes('cover-light'), t.join(' '));
  assert.ok(e.includes('cover-inverse') && !e.includes('cover-light'), e.join(' '));
});

/* ── The runtime's own mirror, from a baked block (the export path) ──────────────────── */

const RUNTIME_BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');
const { frontMatterBlock } = require(path.join(ROOT, 'lib/core/deck-front-matter.js'));

/** Run the real runtime bundle over `markup` and resolve once `ready(doc)` holds — a signal, not
 *  a duration (HARD RULE #32): the deck-class pass stamps every section in one go, so the first
 *  mutation that satisfies `ready` means the pass has run over all of them. */
function renderRuntimeBaked(deckSource, markup, ready) {
  const bundle = fs.readFileSync(RUNTIME_BUNDLE, 'utf8');
  assert.ok(bundle.includes('cover-light'),
    'dist/lattice-runtime.js predates the cover register — run `npm run build` and re-run.');
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>${markup}${frontMatterBlock(deckSource)}</body></html>`,
    { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  dom.window.fetch = () => Promise.reject(new Error('baked: no fetch expected'));
  const doc = dom.window.document;
  return new Promise((resolve) => {
    const obs = new dom.window.MutationObserver(() => {
      if (ready(doc)) { obs.disconnect(); resolve(doc); }
    });
    obs.observe(doc.body, { attributes: true, subtree: true, attributeFilter: ['class'] });
    const el = doc.createElement('script');
    el.textContent = bundle;
    doc.body.appendChild(el);
    if (ready(doc)) { obs.disconnect(); resolve(doc); }
  });
}

test('runtime: stamps title and closing only from a baked block, and honors cover-inverse', async () => {
  const markup = '<section class="title"><h1>One</h1></section>'
    + '<section class="content"><h2>Two</h2></section>'
    + '<section class="closing cover-inverse"><h2>Three</h2></section>'
    + '<section class="closing"><h2>Four</h2></section>';
  const doc = await renderRuntimeBaked(deck(['cover: light'], ['## x']), markup,
    (d) => d.querySelector('section.title')?.classList.contains('cover-light'));
  const [a, b, c, e] = [...doc.querySelectorAll('section')].map((s) => s.className.split(/\s+/));
  assert.ok(a.includes('cover-light'), a.join(' '));
  assert.ok(!b.includes('cover-light'), b.join(' '));
  assert.ok(!c.includes('cover-light'), c.join(' '));
  assert.ok(e.includes('cover-light'), e.join(' '));
});

/* ── lint ────────────────────────────────────────────────────────────────────────────── */

test('lint: an unknown word warns; a known one and the key itself do not', () => {
  const rules = (v) => lintText(deck([`cover: ${v}`], [TITLE()])).filter((f) => f.rule === 'unknown-cover');
  assert.equal(rules('light').length, 0);
  assert.equal(rules('inverse').length, 0);
  assert.equal(rules('pale').length, 1);
  assert.equal(lintText(deck(['cover: light'], [TITLE()])).filter((f) => f.rule === 'unknown-key').length, 0);
  const unknownClass = (cls) => lintText(deck([], [TITLE(cls)])).filter((f) => f.rule === 'unknown-class' && f.message?.includes(cls));
  assert.equal(unknownClass('cover-light').length, 0, 'the per-slide class is in the vocabulary');
  assert.equal(unknownClass('cover-inverse').length, 0, 'and so is the opt-out');
  assert.equal(unknownClass('cover-lite').length, 1, 'a misspelling is still flagged');
});

/* ── CSS ─────────────────────────────────────────────────────────────────────────────── */

test('css: the light cover repaints the canvas and the ink tokens, and `title light` is untouched', () => {
  const mods = fs.readFileSync(path.join(ROOT, 'lib/base/base.modifiers.css'), 'utf8');
  const finish = fs.readFileSync(path.join(ROOT, 'lib/base/base.finish.css'), 'utf8');
  const block = mods.match(/section:is\(\.title, \.closing\)\.cover-light:not\(\.print\) \{([^}]*)\}/);
  assert.ok(block, 'the light-cover block exists');
  for (const decl of ['background: var(--bg)', 'color-scheme: light', '--text-display: var(--text-heading)',
    '--on-dark-secondary: var(--text-secondary)', '--deck-logo-filter: initial']) {
    assert.ok(block[1].includes(decl), `the light cover declares ${decl}`);
  }
  // The dark-panel re-assert and the inverse --fin-canvas carve out ONLY cover-light — never `.light`,
  // whose bookend meaning (a scheme, not a surface) is pinned elsewhere.
  assert.ok(mods.includes('section:is(.title, .closing):not(.print, .cover-light),'));
  assert.ok(finish.includes('section:is(.title, .closing):not(.print, .cover-light),'));
  assert.ok(!/section:is\(\.title, \.closing\):not\([^)]*\.light\b(?!-)/.test(mods.replace(/\.cover-light/g, '')), 'no `.light` carve-out on the bookend rule');
});
