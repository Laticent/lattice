/**
 * The `cover-layout:` register: the composition of the front and back cover (lib/core/resolve-cover.js).
 * engineering/decisions/2026-11-23-cover-layout.md.
 *
 *   1. the kernel maps a composition word to `cover-<word>`, stamps nothing for the default `plain`,
 *      and knows no surface word: a cover's color is the slide's color mode, like every slide;
 *   2. BOTH render paths (the engine here, the real runtime bundle below) stamp the class on TITLE and
 *      CLOSING slides only, and a slide's own composition or `cover-plain` evicts the deck's;
 *   3. the linter warns on an unknown word and turns the retired `cover:` / `cover-light` /
 *      `cover-inverse` into errors with a fix;
 *   4. the CSS forces no scheme on a bookend and paints each from a `light-dark()` pair (source shape
 *      here; the computed values are the finish-canvas matrix's and bookend-ink's job, in real Chromium);
 *   5. `stage` / `poster` grow down, never up.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const latticeEngine = require(path.join(ROOT, 'lib/engine'));
const { COVER_REGISTER, COVER_COMPOSITION_CLASSES, coverClasses, coverDeckTokens, coverClassesFromFrontMatter } = require(path.join(ROOT, 'lib/core/resolve-cover.js'));
const { lintText, buildVocab } = require(path.join(ROOT, 'lib/authoring/lint.js'));
const { applyAllFixes } = require(path.join(ROOT, 'lib/authoring/lint-core.js'));
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

const COMPOSITIONS = ['masthead', 'ledger', 'column', 'label', 'stage', 'frame', 'poster'];

test('kernel: a composition word stamps cover-<word>; plain, a surface word, unknown and absent stamp nothing', () => {
  for (const c of COMPOSITIONS) {
    assert.deepEqual(coverClasses(c), [`cover-${c}`]);
    assert.deepEqual(coverClassesFromFrontMatter(`cover-layout: ${c}`), [`cover-${c}`]);
  }
  assert.deepEqual(coverClasses('  POSTER '), ['cover-poster']);
  assert.deepEqual(coverClasses('plain'), [], 'the default composition stamps nothing deck-wide');
  assert.deepEqual(coverClasses('poster stage'), ['cover-poster'], 'one word for the one axis: the first wins');
  for (const w of ['light', 'inverse', 'dark', 'pale']) assert.deepEqual(coverClasses(w), [], `${w} is not a composition`);
  assert.deepEqual(coverClassesFromFrontMatter('theme: indaco'), []);
  assert.deepEqual(coverClassesFromFrontMatter('cover: light poster'), [], 'the retired key is not read');
  assert.equal(COVER_REGISTER.AXES.length, 1, 'composition is the only axis');
  assert.ok(!COVER_REGISTER.TOKENS.includes('cover-light') && !COVER_REGISTER.TOKENS.includes('cover-inverse'));
  assert.deepEqual(COVER_COMPOSITION_CLASSES, COMPOSITIONS.map((c) => `cover-${c}`));
});

test('kernel: a slide\'s own composition (or cover-plain) evicts the deck\'s, and only title and closing take it', () => {
  assert.deepEqual(coverDeckTokens(['title'], ['cover-poster']), ['cover-poster']);
  assert.deepEqual(coverDeckTokens(['closing', 'silent'], ['cover-poster']), ['cover-poster']);
  assert.deepEqual(coverDeckTokens(['closing', 'cover-plain'], ['cover-poster']), []);
  assert.deepEqual(coverDeckTokens(['closing', 'cover-stage'], ['cover-poster']), []);
  assert.deepEqual(coverDeckTokens(['title', 'dark'], ['cover-poster']), ['cover-poster'], 'the color mode is another axis');
  for (const l of ['content', 'divider', 'topic']) assert.deepEqual(coverDeckTokens([l], ['cover-poster']), [], l);
  assert.deepEqual(coverDeckTokens(['title'], []), []);
});

test('manifests: title and closing declare exactly the seven compositions as variants, in one exclusive axis', () => {
  for (const name of ['title', 'closing']) {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, `lib/components/anchor/${name}/${name}.manifest.json`), 'utf8'));
    assert.deepEqual(m.variants.filter((v) => v.startsWith('cover-')), COVER_COMPOSITION_CLASSES, name);
    const axis = (m.variantAxes || []).find((a) => a.label === 'Composition');
    assert.ok(axis?.exclusive, `${name} declares the exclusive Composition axis`);
    assert.deepEqual(axis.members, COVER_COMPOSITION_CLASSES, name);
    for (const v of COVER_COMPOSITION_CLASSES) assert.ok(m.variantDocs?.[v]?.sample, `${name} documents ${v}`);
  }
});

test('engine: `cover-layout: poster` stamps title and closing only, cover-plain opts one out, and nothing without the key', () => {
  const [t, c, d, e] = classesOf(['cover-layout: poster'], [TITLE(), CONTENT, DIVIDER, CLOSING('cover-plain')]);
  assert.ok(t.includes('cover-poster'), t.join(' '));
  assert.ok(!c.some((x) => x.startsWith('cover-')), c.join(' '));
  assert.ok(!d.some((x) => x.startsWith('cover-')), d.join(' '));
  assert.ok(e.includes('cover-plain') && !e.includes('cover-poster'), e.join(' '));
  for (const s of classesOf([], [TITLE(), CLOSING()])) assert.ok(!s.some((x) => x.startsWith('cover-')), s.join(' '));
  for (const s of classesOf(['cover-layout: plain'], [TITLE(), CLOSING()])) assert.ok(!s.some((x) => x.startsWith('cover-')), s.join(' '));
});

test('engine: a cover takes the slide\'s own color mode word, and no surface class is stamped', () => {
  const [t, e] = classesOf(['cover-layout: masthead'], [TITLE('dark'), CLOSING()]);
  assert.ok(t.includes('dark') && t.includes('cover-masthead'), t.join(' '));
  assert.ok(!t.includes('cover-light') && !t.includes('cover-inverse') && !e.includes('cover-light'), `${t.join(' ')} / ${e.join(' ')}`);
});

test('lint: a composition word is known on the register and as a slide class', () => {
  const unknown = (v) => lintText(deck([`cover-layout: ${v}`], [TITLE()])).filter((f) => f.rule === 'unknown-cover-layout');
  for (const c of ['plain', ...COMPOSITIONS]) assert.equal(unknown(c).length, 0, c);
  assert.equal(unknown('collumn').length, 1);
  assert.equal(unknown('light').length, 1, 'a surface word is not a layout');
  assert.equal(lintText(deck(['cover-layout: column'], [TITLE()])).filter((f) => f.rule === 'unknown-key').length, 0);
  const unknownClass = (cls) => lintText(deck([], [TITLE(cls)])).filter((f) => f.rule === 'unknown-class' && f.message?.includes(cls));
  for (const c of [...COVER_COMPOSITION_CLASSES, 'cover-plain']) assert.equal(unknownClass(c).length, 0, c);
  assert.equal(unknownClass('cover-lite').length, 1, 'a misspelling is still flagged');
});

test('css: every composition is scoped to its own component, and the size changes are role tokens', () => {
  for (const name of ['title', 'closing']) {
    const css = fs.readFileSync(path.join(ROOT, `lib/components/anchor/${name}/${name}.styles.css`), 'utf8');
    for (const v of COVER_COMPOSITION_CLASSES) assert.ok(css.includes(`section.${name}.${v}`), `${name} styles ${v}`);
    const sizes = [...css.matchAll(/section\.\w+\.cover-[a-z]+[^{]*\{[^}]*font-size:\s*([^;]+);/g)].map((m) => m[1].trim());
    assert.ok(sizes.length >= 3, `${name}: stage, poster and label set a size`);
    // A display heading too long for three lines grows DOWN from the content box and overflows at the
    // foot, where the probe reports it, never up into the top band and a logo (check:jank, 2026-11-21).
    const display = css.match(new RegExp(`section\\.${name}:is\\(\\.cover-stage, \\.cover-poster\\) \\{([^}]*)\\}`));
    assert.ok(display && display[1].includes('justify-content: safe center'), `${name}: stage and poster center safely`);
    assert.ok(display[1].includes('- var(--_cover-foot)'), `${name}: the footer reserve leaves the section's padding`);
    assert.ok(css.includes(`section.${name}:is(.cover-stage, .cover-poster) > :nth-last-child(1 of`), `${name}: and lands on the last flowed child, where the probe sees it`);
    for (const v of sizes) assert.match(v, /^(var\(--fs-[a-z0-9]+\)|max\(var\(--fs-meta\), calc\(var\(--fs-h2\) \* var\(--eyebrow-anchor-scale\)\)\))$/, `${name}: ${v} is a role token`);
  }
});

/* ── The retired surface axis: errors with one fix ────────────────────────────────────── */

const retired = (src) => lintText(src).filter((f) => f.rule === 'retired-cover-key');

test('lint: the retired `cover:` key and the per-slide cover-light / cover-inverse are errors', () => {
  const key = retired(deck(['cover: light column'], [TITLE()]));
  assert.deepEqual(key.map((f) => [f.slide, f.severity]), [[0, 'error'], [1, 'error']],
    'the key, and the title the fix gives `light` so the cover keeps its look');
  const slides = retired(deck([], [TITLE('cover-light'), CONTENT, CLOSING('cover-inverse')]));
  assert.deepEqual(slides.map((f) => [f.slide, f.classToken]), [[1, 'cover-light'], [3, 'cover-inverse']]);
  assert.equal(retired(deck(['cover-layout: column'], [TITLE('dark'), DIVIDER.replace('divider', 'divider light')])).length, 0,
    '`title dark` and `divider light` are the color mode, valid on any slide');
});

test('fix: one pass migrates a deck, keeps its look, and lints clean of the rule', () => {
  const src = deck(['cover: inverse masthead'], [TITLE(), CONTENT, '<!-- @meta{layout=closing, class=cover-light} -->\n\n## Bye.']);
  const fixed = applyAllFixes(src, buildVocab());
  assert.match(fixed, /^cover-layout: masthead$/m);
  assert.doesNotMatch(fixed, /^cover:/m);
  assert.match(fixed, /_class: title dark|layout=title, class=dark/, '`inverse` keeps the dark cover');
  assert.match(fixed, /layout=closing, class=light/, 'a slide that said cover-light keeps its light cover');
  assert.equal(retired(fixed).length, 0);
});

test('lint: slides are counted the way the engine splits them (a `***` break, a `---` inside a fence)', () => {
  const src = deck([], ['## One', '```yaml\n---\ncover: light\n---\n```', TITLE('cover-light')]).replace('\n\n---\n\n## One', '\n\n## One').replace(/\n\n---\n\n```yaml/, '\n\n***\n\n```yaml');
  assert.deepEqual(retired(src).map((f) => f.slide), [3]);
});

/* ── The runtime's own mirror, from a baked block (the export path) ──────────────────── */
const RUNTIME_BUNDLE = path.join(ROOT, 'dist', 'lattice-runtime.js');
const { frontMatterBlock } = require(path.join(ROOT, 'lib/core/deck-front-matter.js'));

/** Run the real runtime bundle over `markup` and resolve once `ready(doc)` holds — a signal, not
 *  a duration (HARD RULE #32): the deck-class pass stamps every section in one go, so the first
 *  mutation that satisfies `ready` means the pass has run over all of them. */
function renderRuntimeBaked(deckSource, markup, ready) {
  const bundle = fs.readFileSync(RUNTIME_BUNDLE, 'utf8');
  assert.ok(bundle.includes('cover-layout'),
    'dist/lattice-runtime.js predates the cover-layout register — run `npm run build` and re-run.');
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

// The timeout is a deadline for a regression, not a timing assertion: the test waits on a signal, and
// without a deadline a broken wiring would hang the run instead of failing it.
test('runtime: stamps title and closing only from a baked block, and a slide\'s cover-plain opts out', { timeout: 60_000 }, async () => {
  const markup = '<section class="title"><h1>One</h1></section>'
    + '<section class="content"><h2>Two</h2></section>'
    + '<section class="closing cover-plain"><h2>Three</h2></section>'
    + '<section class="closing dark"><h2>Four</h2></section>';
  const doc = await renderRuntimeBaked(deck(['cover-layout: poster'], ['## x']), markup,
    (d) => d.querySelector('section.title')?.classList.contains('cover-poster'));
  const [a, b, c, e] = [...doc.querySelectorAll('section')].map((s) => s.className.split(/\s+/));
  assert.ok(a.includes('cover-poster'), a.join(' '));
  assert.ok(!b.includes('cover-poster'), b.join(' '));
  assert.ok(!c.includes('cover-poster'), c.join(' '));
  assert.ok(e.includes('cover-poster') && e.includes('dark'), e.join(' '));
});

/* ── CSS ─────────────────────────────────────────────────────────────────────────────── */

test('css: no bookend forces a color scheme, and each paints its field from a light-dark() pair', () => {
  const mods = fs.readFileSync(path.join(ROOT, 'lib/base/base.modifiers.css'), 'utf8');
  for (const name of ['title', 'closing', 'divider']) {
    const css = fs.readFileSync(path.join(ROOT, `lib/components/anchor/${name}/${name}.styles.css`), 'utf8');
    assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /color-scheme:\s*dark/, `${name}.styles.css forces no scheme`);
  }
  const code = mods.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /cover-light|cover-inverse/, 'the retired surface classes are gone from the engine');
  assert.doesNotMatch(code, /section:is\(\.title, \.closing\)[^{]*\{[^}]*color-scheme:\s*dark/, 'no force-dark rule on the covers');
  assert.match(code, /section:is\(\.title, \.closing\):not\(\.print\) \{\s*background-color: light-dark\(var\(--bg\), var\(--surface-inverse\)\);/,
    'a cover paints the canvas in light and the brand panel in dark (D4b)');
  assert.match(code, /section\.divider:not\(\.print\) \{\s*background-color: light-dark\(var\(--accent\), color-mix\(in oklab, var\(--accent\) \d+%, var\(--bg\)\)\);/,
    'a divider paints the accent in light and the dimmed accent in dark (D12)');
});

test('kernel: the composition tokens never collide with the `light` mood token', () => {
  for (const t of COVER_REGISTER.TOKENS) assert.notEqual(t, 'light');
  assert.ok(isSurfaceRegisterToken('cover-poster'), 'a decorating register rides a split page');
});
