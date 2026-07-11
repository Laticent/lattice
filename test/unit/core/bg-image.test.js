/**
 * Unit tests for the `![bg …]` half-canvas image kernel (lib/core/bg-image.js)
 * that the emulator's engine-backed path uses to build the lattice-bg /
 * image-text panel. The image rides as a CSS `background-image` on the
 * `.lattice-bg` div (no <img>), with deck-relative URLs resolved to absolute
 * file:// URLs against the deck directory.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const bg = require('../../../lib/core/bg-image');

describe('bg-image — liftBgImages (markdown pre-pass)', () => {
  test('rewrites ![bg right] to the lattice-bg background div', () => {
    const out = bg.liftBgImages('## Heading\n\n![bg right](pic.svg)\n');
    assert.match(out, /<div class="lattice-bg lattice-bg-right" style="background-image:url\('pic\.svg'\)"><\/div>/);
    assert.doesNotMatch(out, /!\[bg/);
  });

  test('resolves deck-relative URLs against a file:// base', () => {
    const out = bg.liftBgImages('![bg right](pic.svg)', 'file:///decks/q/');
    assert.match(out, /background-image:url\('file:\/\/\/decks\/q\/pic\.svg'\)/);
  });

  test('maps left / (none) to the right side keyword', () => {
    assert.match(bg.liftBgImages('![bg left](a.svg)'), /lattice-bg-left/);
    assert.match(bg.liftBgImages('![bg](a.svg)'), /lattice-bg-full/);
    assert.match(bg.liftBgImages('![bg fit](a.svg)'), /lattice-bg-full/);
  });

  test('only matches at line start (inline `![bg…]` in code is left alone)', () => {
    const src = 'Write `![bg right](x)` to anchor the image.';
    assert.equal(bg.liftBgImages(src), src);
  });

  test('a multi-keyword run (e.g. `cover blur`) is captured and its side keyword still wins', () => {
    // The `(?:[^\S\r\n](?:[^\S\r\n]|\w)*)?` keyword capture must still carry every keyword
    // through to bgSide — a `left`/`right` anywhere in the run picks the split side.
    assert.match(bg.liftBgImages('![bg cover blur right](a.svg)'), /lattice-bg-right/);
    assert.match(bg.liftBgImages('![bg cover blur](a.svg)'), /lattice-bg-full/);
  });

  test('a Unicode / non-breaking space after `bg` still lifts (true superset of the old `\\s` run)', () => {
    // The keyword class is `[^\S\r\n]` (horizontal whitespace INCLUDING nbsp), not `[ \t]`:
    // a `![bg` + nbsp + `right](x)` pasted from Word/Docs rendered a panel under the old
    // `\s`-based regex and must keep doing so — a plain `[ \t]` would silently drop it.
    assert.match(bg.liftBgImages("![bg\u00A0right](a.svg)"), /lattice-bg-right/); // nbsp (U+00A0)
    assert.match(bg.liftBgImages("![bg\u202Fright](a.svg)"), /lattice-bg-right/); // narrow nbsp (U+202F)
    assert.match(bg.liftBgImages("![bg\u2003right](a.svg)"), /lattice-bg-right/); // em space (U+2003)
  });

  test('`![bgleft]` stays a normal image — a leading space is still required after `bg`', () => {
    // The keyword run is OPTIONAL but must start with whitespace, so `bg`+letters (no space)
    // is NOT a background directive: it must pass through untouched (parity with the old regex).
    const src = '![bgleft](a.svg)';
    assert.equal(bg.liftBgImages(src), src);
  });

  test('tolerates a trailing space before `]` (leniency win over the old form)', () => {
    // `![bg right ](x)` — the old `(?:\s+\w+)*` rejected a run ending in whitespace and left
    // the typo unrendered; the new form lifts it, and the trailing space is inert to bgSide().
    assert.match(bg.liftBgImages('![bg right ](a.svg)'), /lattice-bg-right/);
    assert.match(bg.liftBgImages('![bg ](a.svg)'), /lattice-bg-full/); // space-only run → full
  });

  test('does NOT cross a newline — a broken multi-line `![bg` never swallows following prose', () => {
    // The keyword class is `[^\S\r\n]`, not `\s`, so the run stops at the line end. This input
    // DISCRIMINATES the fix: the prose ends in a WORD char immediately before `](url)` (no
    // trailing space), so the OLD `(?:\s+\w+)*` form matched right across the newline —
    // `\s+`=`\n`, `\w+`=`Revenue`, … — swallowing three lines of prose into a bogus background
    // div. The new form stops at `\n` and leaves the source verbatim (revert `[^\S\r\n]`→`\s`
    // and THIS test goes red — the guard the earlier trailing-`\n` variant silently lacked).
    const src = '![bg right\nRevenue growth story\nmore prose here](oops.svg)\n';
    const out = bg.liftBgImages(src);
    assert.equal(out, src); // verbatim: no match, nothing lifted
    assert.match(out, /Revenue growth story/); // prose survives
    assert.doesNotMatch(out, /lattice-bg/);
  });

  test('a long keyword-like run without a closing `](…)` returns unchanged (no catastrophic backtracking)', () => {
    // The rewritten regex is linear: a pathological all-space lead with no `]( )` tail must
    // fail fast and leave the source verbatim, not hang the render.
    const src = `![bg${' '.repeat(5000)}`;
    assert.equal(bg.liftBgImages(src), src);
  });

  test('is a no-op when there is no bg directive', () => {
    assert.equal(bg.liftBgImages('## Just a heading\n\nbody'), '## Just a heading\n\nbody');
  });
});

describe('bg-image — wrapImageText (HTML post-pass)', () => {
  const sec = (cls, inner) => `<section class="${cls}">${inner}</section>`;
  const bgDiv = '<div class="lattice-bg lattice-bg-right" style="background-image:url(\'p.svg\')"></div>';

  test('wraps half-canvas image prose, keeping header/footer/lattice-bg siblings', () => {
    const html = sec('image', `<header>H</header>${bgDiv}<h2>Title</h2><p>Body</p><footer>F</footer>`);
    const out = bg.wrapImageText(html);
    assert.match(out, /<header>H<\/header><div class="lattice-bg[\s\S]*?<\/div><div class="image-text"><h2>Title<\/h2><p>Body<\/p><\/div><footer>F<\/footer>/);
  });

  test('wraps EVERY image variant — the adaptive layout picks its composition after authoring', () => {
    for (const cls of ['image full', 'image contain', 'image museum', 'image statement']) {
      const html = sec(cls, `${bgDiv}<h2>T</h2><p>B</p>`);
      assert.match(bg.wrapImageText(html), /<div class="image-text"><h2>T<\/h2><p>B<\/p><\/div>/, `should wrap ${cls}`);
    }
  });

  test('skips an image section with no prose (image-only slide)', () => {
    const html = sec('image full', bgDiv);
    assert.equal(bg.wrapImageText(html), html);
  });

  test('skips non-image sections', () => {
    const html = sec('content', '<h2>T</h2><p>B</p>');
    assert.equal(bg.wrapImageText(html), html);
  });

  test('is idempotent', () => {
    const html = sec('image', `${bgDiv}<h2>T</h2><p>B</p>`);
    const once = bg.wrapImageText(html);
    assert.equal(bg.wrapImageText(once), once);
  });
});

describe('bg-image — primitives', () => {
  test('isHalfCanvasImage', () => {
    assert.equal(bg.isHalfCanvasImage('image'), true);
    assert.equal(bg.isHalfCanvasImage('image dark'), true);
    assert.equal(bg.isHalfCanvasImage('image full'), false);
    assert.equal(bg.isHalfCanvasImage('content'), false);
  });

  test('bgDiv produces the canonical lattice-bg background div', () => {
    assert.equal(
      bg.bgDiv(' right', 'x.svg'),
      '<div class="lattice-bg lattice-bg-right" style="background-image:url(\'x.svg\')"></div>',
    );
  });

  test('resolveAssetUrl rebases deck-relative URLs, passes remote/data through', () => {
    assert.match(bg.resolveAssetUrl('pic.svg', 'file:///decks/q/'), /^file:\/\/\/decks\/q\/pic\.svg$/);
    // an http(s) base (the web playground) resolves the same way
    assert.equal(bg.resolveAssetUrl('pic.svg', 'https://o/assets/'), 'https://o/assets/pic.svg');
    assert.equal(bg.resolveAssetUrl('https://x/y.png', 'file:///decks/q/'), 'https://x/y.png');
    assert.equal(bg.resolveAssetUrl('data:image/svg+xml,abc', 'file:///decks/q/'), 'data:image/svg+xml,abc');
    assert.equal(bg.resolveAssetUrl('pic.svg'), 'pic.svg'); // no base → verbatim
  });

  test('resolveAssetUrl does not throw on a literal % in a filename', () => {
    // WHATWG URL must not throw on `100%.svg` (decodeURI would) — keep the render alive.
    assert.doesNotThrow(() => bg.resolveAssetUrl('100%.svg', 'file:///decks/q/'));
    assert.match(bg.resolveAssetUrl('100%.svg', 'file:///decks/q/'), /\/decks\/q\/100/);
  });

  test('resolveInlineImageSrcs rebases relative <img> srcs against the base only', () => {
    const html = '<img src="acme.svg" alt="Acme"><img alt="Remote" src="https://x/y.png"><img src="data:image/png,z">';
    const out = bg.resolveInlineImageSrcs(html, 'https://o/v/h/samples/');
    assert.match(out, /<img src="https:\/\/o\/v\/h\/samples\/acme\.svg" alt="Acme">/); // relative → absolute
    assert.match(out, /src="https:\/\/x\/y\.png"/); // remote untouched
    assert.match(out, /src="data:image\/png,z"/); // data untouched
  });

  test('resolveInlineImageSrcs is a no-op without a base (CLI/emulator export parity)', () => {
    const html = '<img src="acme.svg" alt="Acme">';
    assert.equal(bg.resolveInlineImageSrcs(html, undefined), html); // exported bytes untouched
    assert.equal(bg.resolveInlineImageSrcs(html, ''), html);
  });
});
