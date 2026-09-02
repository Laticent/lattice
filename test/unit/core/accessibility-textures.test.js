const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { texturePatternDefs } = require('../../../lib/core/accessibility-textures.js');

// GOLDEN BYTE-LOCK — the texture supply side is a shared kernel (every render calls
// texturePatternDefs()); its output must stay byte-for-byte stable across internal
// refactors (naming, comments, structure). The structural tests below are readable
// guards, but only this full-string compare catches attribute reordering, whitespace
// drift, or a set-ordering change. If this fails on an INTENTIONAL change, re-bless:
//   node -e "require('fs').writeFileSync('test/unit/core/texture-defs.golden.svg', \
//     require('./lib/core/accessibility-textures.js').texturePatternDefs())"
// and justify the diff in the PR. See engineering/textures.md.
test('texturePatternDefs() output is byte-identical to the committed golden', () => {
  const golden = fs.readFileSync(path.join(__dirname, 'texture-defs.golden.svg'), 'utf8');
  assert.equal(texturePatternDefs(), golden,
    'texture defs drifted from the golden — re-bless only with an intentional, justified change');
});

// The a11y LITERAL sets (latt-a11y-tex-*, latt-a11y-chart-tex-*) are the regression
// guard for the all-black-pie-on-Safari saga: they MUST paint with LITERAL hex and
// zero resolution dependency — no `var(--token)` (unresolved on older WebKit and/or
// out of reach from the page-level defs after the :root→:where(section) relocation)
// and no `<style>`/CSS rules. Either rendered the pie black on real iPhones. The
// onyx scheme-aware set (below) deliberately opts OUT of that rule to gain light/dark
// flipping — hence it is SEPARATE, and CVD themes keep using the literal sets.
// See engineering/decisions/2026-06-16-cvd-redundant-encoding.md.
test('a11y literal sets paint with literal hex — no var(), no <style> (iOS regression guard)', () => {
  const defs = texturePatternDefs();
  // The a11y patterns precede the onyx scheme-aware <style>; verify that portion is literal.
  const a11y = defs.slice(0, defs.indexOf('<style>'));
  assert.doesNotMatch(a11y, /var\(/, 'a11y sets must not reference any CSS custom property');
  assert.doesNotMatch(a11y, /<style/, 'a11y sets must not depend on a <style> block');
  assert.match(a11y, /<pattern id="latt-a11y-chart-tex-1"[^>]*>\s*<rect width="8" height="8" fill="#2e2e2e"/);
  assert.match(a11y, /<pattern id="latt-a11y-tex-1"[^>]*>\s*<rect width="8" height="8" fill="#e8e8e8"/);
});

// The onyx set flips rect fill + overlay ink with the deck color-scheme via
// light-dark() in a <style> (verified flipping in Chromium; iOS UNVERIFIED — the
// literal sets remain the CVD path). It uses light-dark(), NOT var(), so it carries
// no custom-property-resolution dependency.
test('onyx scheme-aware set flips fill + ink via light-dark() in a <style>', () => {
  const defs = texturePatternDefs();
  assert.equal((defs.match(/id="latt-onyx-tex-\d+"/g) || []).length, 12);
  // slot 1 rect flips light #e8e8e8 ↔ dark #1e1e1e (mirrors onyx's --cat-1-fill ramp;
  // the dark half moved with the 2026-09-01 categorical re-tune, which widened onyx's
  // dark wash ramp to clear the separation floor).
  assert.match(defs, /\.latt-onyx-tex-r1\{fill:light-dark\(#e8e8e8,#1e1e1e\)\}/);
  // slot 1 ink flips a subtle mid-gray #8a8a8a (on the light chip, so black text stays
  // dominant) ↔ light #f5f5f5 (on the dark chip).
  assert.match(defs, /\.latt-onyx-tex-i1\{[^}]*light-dark\(#8a8a8a,#f5f5f5\)/);
  assert.doesNotMatch(defs, /var\(/, 'the whole defs block must avoid var() (light-dark is a function, not a token)');
});

// Graceful degradation: on a renderer WITHOUT light-dark(), the CSS class is dropped
// and the LITERAL light-mode fallback in the presentation attribute paints — a light
// chip, NEVER SVG's default black. This is what keeps the scheme-aware sets from
// re-triggering the all-black-pie regression on old WebKit.
test('scheme-aware patterns carry a literal light-mode fallback presentation attribute', () => {
  const defs = texturePatternDefs();
  // onyx slot-1 rect: class for the flip AND fill="#e8e8e8" fallback attribute.
  assert.match(defs, /<rect class="latt-onyx-tex-r1" fill="#e8e8e8" width="8" height="8"\/>/);
  // concrete slot-1 rect: fallback to its light chip. The re-tune gave concrete §6's
  // luminance spread, so the ramp now DESCENDS from #FDFBFB rather than sitting flat
  // at #DFDDDD on all twelve slots.
  assert.match(defs, /<rect class="latt-concrete-tex-r1" fill="#FDFBFB" width="8" height="8"\/>/);
});

// concrete gets a SEPARATE scheme-aware set with BESPOKE raw-concrete motifs and its
// own ramp (near-white chips ⟷ muted-tint dark chips).
test('concrete scheme-aware set flips its own ramp with bespoke motifs', () => {
  const defs = texturePatternDefs();
  assert.equal((defs.match(/id="latt-concrete-tex-\d+"/g) || []).length, 12);
  // slot 1 rect flips concrete's #FDFBFB (light) ↔ #6A4E4E (dark), mirroring its ramp.
  // The dark half is unchanged: concrete's dark wash is a sanctioned shortfall (every
  // wider ramp costs its --cat-N-ink arm), so only the light ramp took the spread.
  assert.match(defs, /\.latt-concrete-tex-r1\{fill:light-dark\(#FDFBFB,#6A4E4E\)\}/);
  // slot 1 motif is board-form plank lines (two horizontals) — bespoke, NOT the onyx/a11y diagonal.
  assert.match(defs, /<pattern id="latt-concrete-tex-1"[^>]*>[\s\S]*?<path d="M0 2\.5 H8 M0 5\.5 H8"\/>/);
});

test('texturePatternDefs emits all pattern families (12 a11y cat + 8 a11y chart + 12 onyx + 12 concrete)', () => {
  const defs = texturePatternDefs();
  assert.equal((defs.match(/id="latt-a11y-tex-\d+"/g) || []).length, 12);
  assert.equal((defs.match(/id="latt-a11y-chart-tex-\d+"/g) || []).length, 8);
  assert.equal((defs.match(/id="latt-onyx-tex-\d+"/g) || []).length, 12);
  assert.equal((defs.match(/id="latt-concrete-tex-\d+"/g) || []).length, 12);
});

// ─────────────────────────────────────────────────────────────────────────────
// SELECTIVE EMISSION (#1863)
//
// A page used to ship all 92 patterns whatever its theme — 28,490 B of <defs>
// that, on a hue-carried palette like indaco, nothing referenced. `only` narrows
// that to the sets the document actually names. An unreferenced <pattern> paints
// nothing, so narrowing is provably zero visual change; MISSING one is a blank
// fill, so every fallback below errs toward emitting more.
// ─────────────────────────────────────────────────────────────────────────────

const {
  texturePrefixesReferencedIn, TEXTURE_SET_PREFIXES, TEXTURE_SENTINEL_PREFIX,
} = require('../../../lib/core/accessibility-textures.js');
const { themeChain } = require('../../../lib/theme/chain.mjs');
const { THEME_EDGES } = require('../../../lib/theme/edges.generated.mjs');

const THEMES_DIR = path.join(__dirname, '..', '..', '..', 'themes');
const PRINT_TEXTURES = path.join(__dirname, '..', '..', '..', 'lib', 'base', 'base.print-textures.css');

const patternIds = (svg) => (svg.match(/<pattern id="([^"]+)"/g) || []).map((m) => m.slice(13, -1));
const setsAttr = (svg) => svg.match(/data-latt-tex-sets="([^"]*)"/)[1];

test('a narrowed emission carries only the requested sets, in the canonical order', () => {
  // Deliberately out of order — emission order is the module's, not the caller's,
  // because the golden byte-lock above pins it.
  const defs = texturePatternDefs(['latt-onyx-tex-light', 'latt-a11y-tex']);
  assert.equal(setsAttr(defs), 'latt-a11y-tex latt-onyx-tex-light');
  assert.equal(patternIds(defs).length, 24);
  assert.match(defs, /id="latt-a11y-tex-1"/);
  assert.match(defs, /id="latt-onyx-tex-light-1"/);
  assert.doesNotMatch(defs, /id="latt-concrete-tex/);
  // `latt-onyx-tex-light` must NOT drag in the scheme-aware `latt-onyx-tex`.
  assert.doesNotMatch(defs, /id="latt-onyx-tex-\d/);
});

test('an omitted / non-array `only` still emits everything — the safe fallback', () => {
  for (const arg of [undefined, null, 'latt-a11y-tex']) {
    assert.equal(patternIds(texturePatternDefs(arg)).length, 92,
      'a caller that cannot read the document must get every set, not none');
  }
});

test('an empty request still emits the marker element', () => {
  // `.latt-a11y-defs` is how both call sites find their own previous injection;
  // dropping the wrapper would make a re-render inject a second one.
  const defs = texturePatternDefs([]);
  assert.match(defs, /class="latt-a11y-defs"/);
  assert.equal(setsAttr(defs), '');
  assert.equal(patternIds(defs).length, 0);
});

test('the reference scan reads all three spellings a url() can take', () => {
  // CSSOM re-serializes `url(#x)` as `url("#x")`, so the runtime — which reads
  // cssRules[i].cssText — sees quotes the author never wrote. A matcher that only
  // knew the bare form would emit nothing on the runtime path.
  for (const css of [
    '--cat-1-texture: url(#latt-concrete-tex-1);',
    '--cat-1-texture: url("#latt-concrete-tex-1");',
    "--cat-1-texture: url('#latt-concrete-tex-1');",
    '--cat-1-texture: url( "#latt-concrete-tex-1" );',
  ]) {
    assert.deepEqual(texturePrefixesReferencedIn(css), ['latt-concrete-tex'], css);
  }
});

test('the reference scan does not confuse a set with its longer-named sibling', () => {
  assert.deepEqual(texturePrefixesReferencedIn('url(#latt-onyx-tex-light-1)'), ['latt-onyx-tex-light']);
  assert.deepEqual(texturePrefixesReferencedIn('url(#latt-onyx-tex-1)'), ['latt-onyx-tex']);
  assert.deepEqual(texturePrefixesReferencedIn('url(#latt-onyx-tex-nope)'), [],
    'an id with no slot number is not a pattern reference');
  assert.deepEqual(texturePrefixesReferencedIn(''), []);
  assert.deepEqual(texturePrefixesReferencedIn(undefined), []);
});

// ── ACCEPTANCE #3: both emission sites derive the SAME answer ────────────────
//
// lattice-emulator.js scans the assembled deck stylesheet (theme chain files on
// disk + the layout sheet); lib/runtime/index.js scans the live document through
// CSSOM. Different routes to the same question, and the issue's stated risk is
// that they diverge. Two pins:
//
//   1. STRUCTURAL — neither site carries its own matcher. One kernel, HARD RULE #1.
//   2. BEHAVIORAL — the CSSOM route's re-serialized spelling lands on the same
//      set as the as-authored file, for every shipped palette.

test('neither emission site re-implements the reference matcher', () => {
  // An earlier version of this test escaped its own pattern one level too deep and
  // matched nothing, while the runtime really did carry a second hand-rolled
  // matcher (a sentinel regex) two lines from the kernel call. So assert on
  // something a mis-escape cannot make vacuous: strip comments, then require that
  // the only surviving mention of a texture id in each site is a CSS ATTRIBUTE
  // SELECTOR — never a regex, a slot number, or an id built by hand.
  const root = path.join(__dirname, '..', '..', '..');
  for (const site of ['lattice-emulator.js', 'lib/runtime/index.js']) {
    const src = fs.readFileSync(path.join(root, site), 'utf8');
    assert.match(src, /texturePrefixesReferencedIn/,
      `${site} must ask the kernel which sets to emit`);
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').map((l) => l.replace(/^\s*\/\/.*$/, '')).join('\n');
    const all = (code.match(/#latt-/g) || []).length;
    const inSelector = (code.match(/\[(?:fill|stroke|style)\*="#latt-"\]/g) || []).length;
    assert.equal(all, inSelector,
      `${site} mentions a texture id ${all - inSelector} time(s) outside a CSS attribute `
      + 'selector — the matching rules live in the kernel only');
    assert.doesNotMatch(code, /latt-a11y-tex-\\d|latt-[a-z-]*-\$\{|'latt-a11y-tex'/,
      `${site} appears to build or match a texture id itself`);
  }
});

const shippedPalettes = fs.readdirSync(THEMES_DIR)
  .filter((f) => f.endsWith('.css'))
  .map((f) => f.replace(/\.css$/, ''))
  .filter((n) => THEME_EDGES[n] !== undefined || fs.existsSync(path.join(THEMES_DIR, `${n}.manifest.json`)));

const chainCss = (name) => themeChain(name, THEME_EDGES)
  .map((n) => fs.readFileSync(path.join(THEMES_DIR, `${n}.css`), 'utf8'))
  .join('\n');

test('every shipped palette resolves the same set through both spellings', () => {
  assert.ok(shippedPalettes.length >= 20, `expected the real palette set, got ${shippedPalettes.length}`);
  for (const name of shippedPalettes) {
    const asAuthored = chainCss(name);
    // How CSSOM hands the same declarations back to the runtime.
    const viaCssom = asAuthored.replace(/url\(#([^)]+)\)/g, 'url("#$1")');
    assert.deepEqual(
      texturePrefixesReferencedIn(viaCssom), texturePrefixesReferencedIn(asAuthored),
      `${name}: the emulator (chain files) and the runtime (CSSOM) disagree on which sets to emit`,
    );
  }
});

test('every palette emits a superset of the pattern ids it references', () => {
  // The whole safety property, asserted end to end: for each palette, take the CSS
  // that will be in the document (its chain + the print overrides that ship in the
  // layout sheet for EVERY deck) and check that no `url(#…)` in it points at a
  // pattern the narrowed <defs> leaves out. A dangling paint-server ref renders as
  // SVG default black.
  const printCss = fs.readFileSync(PRINT_TEXTURES, 'utf8');
  for (const name of shippedPalettes) {
    const css = `${chainCss(name)}\n${printCss}`;
    const emitted = new Set(patternIds(texturePatternDefs(texturePrefixesReferencedIn(css))));
    for (const [, id] of css.matchAll(/url\(\s*["']?#(latt-[a-z0-9-]*-\d+)/g)) {
      assert.ok(emitted.has(id),
        `${name}: references #${id} but the narrowed <defs> does not emit it`);
    }
  }
});

test('`section.print` keeps its set on a palette that carries no texture of its own', () => {
  // print re-points all 12 slots at the a11y set for ANY theme, and those rules
  // ship in the layout sheet — so a hue-carried palette must still emit them.
  const printCss = fs.readFileSync(PRINT_TEXTURES, 'utf8');
  const wanted = texturePrefixesReferencedIn(`${chainCss('indaco')}\n${printCss}`);
  assert.deepEqual(wanted, ['latt-a11y-tex', 'latt-a11y-chart-tex']);
  // …and nothing else: indaco declares no texture channel.
  assert.deepEqual(texturePrefixesReferencedIn(chainCss('indaco')), []);
});

test('every table key names the set it actually builds', () => {
  // Narrow claim, deliberately: this compares TEXTURE_SET_PREFIXES against the ids
  // the full emission produces, and both come from TEXTURE_SETS — so it catches a
  // key that disagrees with its builder's prefix argument, and nothing else. It
  // does NOT catch "a set the table forgot"; the guard for that is the
  // superset-per-palette test above, which reads the themes rather than the table.
  const emitted = new Set(patternIds(texturePatternDefs()).map((id) => id.replace(/-\d+$/, '')));
  assert.deepEqual([...emitted].sort(), [...TEXTURE_SET_PREFIXES].sort());
});

test('the sentinel is a set every document really does reference', () => {
  // The runtime treats a scan without this prefix as "I cannot see the stylesheet"
  // and emits everything. That is only sound while the print overrides — which ship
  // in the engine sheet for EVERY theme — reference it.
  assert.ok(TEXTURE_SET_PREFIXES.includes(TEXTURE_SENTINEL_PREFIX));
  const printCss = fs.readFileSync(PRINT_TEXTURES, 'utf8');
  assert.ok(texturePrefixesReferencedIn(printCss).includes(TEXTURE_SENTINEL_PREFIX),
    'base.print-textures.css no longer references the sentinel set — the runtime\'s '
    + '"can I see the stylesheet?" check would start reading real decks as unreadable');
  // And it must be in the shipped bundle, not only in the source file.
  const bundled = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'dist', 'lattice.css'), 'utf8');
  assert.ok(texturePrefixesReferencedIn(bundled).includes(TEXTURE_SENTINEL_PREFIX),
    'dist/lattice.css does not reference the sentinel set');
});
