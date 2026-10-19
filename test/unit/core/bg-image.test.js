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
const { liftImageBgImages } = require('../../../lib/core/bg-lift');
const { render, createEngine } = require('../../../lib/engine');

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

// ── The page number is section chrome, not prose (#2206) ─────────────────────────
// The pagination Tile mints a real `<span class="lat-pagination">` at section level on
// every paginated frame. It is the only keep-out in this pass that carries TEXT, and that
// is what makes it the worst of them: the "is there any prose?" guard below strips tags
// and asks whether anything survives, so the numeral makes a slide the pass is explicitly
// written NOT to wrap get wrapped. Measured on a real `.pdf` export of a bg-only `image`
// slide before the fix: the span landed inside `.image-text` at `position: static`,
// `display: block`, ~473px wide — the page number rendered as body copy across the photo
// — the three marker berths were buried with it, and because the retirement rule keys on
// `section > .lat-pagination` the `::after` pseudo came back, so the slide drew TWO
// numbers. Found by the maker-checker pass on #2206.
describe('bg-image — the page number never folds into .image-text', () => {
  const sec = (inner) => `<section class="image" data-lattice-pagination="2">${inner}</section>`;
  const BGDIV = '<div class="lattice-bg lattice-bg-full" style="background-image:url(\'a.jpg\')"></div>';
  const PAGE = '<span class="lat-pagination">2</span>';

  test('a PROSE-FREE image slide stays unwrapped even though the numeral is text', () => {
    const out = bg.wrapImageText(sec(`${BGDIV}${PAGE}`));
    assert.doesNotMatch(out, /image-text/, 'the numeral must not count as prose');
    assert.match(out, /<span class="lat-pagination">2<\/span>/);
  });

  test('a slide WITH prose wraps the prose and leaves the numeral a direct child', () => {
    const out = bg.wrapImageText(sec(`${BGDIV}<h2>T</h2><p>B</p>${PAGE}`));
    assert.match(out, /<div class="image-text"><h2>T<\/h2><p>B<\/p><\/div>/);
    assert.doesNotMatch(out, /<div class="image-text">[\s\S]*lat-pagination[\s\S]*<\/div>/);
    assert.match(out, /<\/div><span class="lat-pagination">2<\/span><\/section>/);
  });
});

describe('bg-image — liftImageBgImages carries a class run to later slides', () => {
  const lifted = (md) => liftImageBgImages(md, 'file:///d/');
  test('`<!-- class: image -->` lifts every later slide until another class run replaces it', () => {
    const md = '# a\n\n![bg left](a.svg)\n\n---\n\n<!-- class: image -->\n\n![bg right](b.svg)\n\n---\n\n![bg left](c.svg)\n\n---\n\n<!-- class: plain -->\n\n![bg](d.svg)\n';
    const out = lifted(md);
    assert.match(out, /!\[bg left\]\(a\.svg\)/, 'before the run: untouched');
    assert.match(out, /lattice-bg-right[^>]*b\.svg/, 'the slide that starts the run');
    assert.match(out, /lattice-bg-left[^>]*c\.svg/, 'a later slide inherits it');
    assert.match(out, /!\[bg\]\(d\.svg\)/, 'a class run without `image` ends it');
  });
  test('front-matter `class:` seeds the run only with what the engine admits', () => {
    // The deck-class register refuses a component name, so the engine renders these slides
    // `content form`, and a lifted `![bg]` would draw an empty panel there.
    const out = lifted('---\ntheme: indaco\nclass: image\n---\n\n![bg left](a.svg)\n\n---\n\n![bg right](b.svg)\n');
    assert.equal((out.match(/lattice-bg /g) || []).length, 0);
  });
  test('front matter that never closes seeds nothing', () => {
    const out = lifted('---\nclass: image\n\n# s1\n\n![bg left](a.svg)\n');
    assert.match(out, /!\[bg left\]\(a\.svg\)/);
  });
  test('a class directive written across lines is still read', () => {
    const out = lifted('# s1\n\n---\n\n<!--\n_class: image\n-->\n\n![bg left](a.svg)\n\n---\n\n![bg left](b.svg)\n');
    assert.match(out, /lattice-bg-left[^>]*a\.svg/);
    assert.match(out, /!\[bg left\]\(b\.svg\)/, 'and, as a spot class, stays on its slide');
  });
  test('a `<!--` in the middle of prose is text: the slides after it still split', () => {
    const out = lifted('# s1\n\nUse <!-- to open a comment.\n\n---\n\n![bg left](a.svg)\n\n---\n\n<!-- _class: image -->\n\n![bg left](b.svg)\n');
    assert.match(out, /!\[bg left\]\(a\.svg\)/, 'the slide that is not image keeps its background');
    assert.match(out, /lattice-bg-left[^>]*b\.svg/);
  });
  test('a directive inside an open comment is part of the comment, as the engine reads it', () => {
    assert.match(lifted('# s1\n\n<!-- unclosed\n\n---\n\n<!-- _class: image -->\n\n![bg left](b.svg)\n'), /!\[bg left\]\(b\.svg\)/);
    assert.match(lifted('<!--\nnote\n--> text <!-- _class: image -->\n\n![bg left](a.svg)\n'), /!\[bg left\]\(a\.svg\)/);
  });
  test('a `---` inside an open comment is not a slide break', () => {
    const out = lifted('<!-- _class: image\n---\n-->\n\n![bg left](a.svg)\n');
    assert.match(out, /lattice-bg-left[^>]*a\.svg/);
  });
  test('a per-slide `_class: image` does not leak onto the next slide', () => {
    const out = lifted('<!-- _class: image -->\n\n![bg left](a.svg)\n\n---\n\n![bg left](b.svg)\n');
    assert.match(out, /!\[bg left\]\(b\.svg\)/);
  });
});

describe('bg-image — liftImageBgImages reads slides and directives as the engine does (followups.d/2739-p10)', () => {

  const { readClassAttr } = require('../../../lib/core/section-walk');
  // One picture per deck. The engine's verdict: is the slide that holds it `image`? The lift must
  // draw a `.lattice-bg` panel exactly then (a panel on a `content form` slide is an empty box).
  // The picture is always on the LAST slide in these decks.
  const engineSaysImage = (md) => /\bimage\b/.test(readClassAttr((String(render(md, {}).html).match(/<section\b[^>]*>/g) || []).pop() || ''));
  const liftDraws = (md) => /lattice-bg /.test(liftImageBgImages(md, 'file:///d/'));
  const cases = {
    'a `---` directly under a text line is a setext underline, not a slide break': ['<!-- _class: image -->\n\nTitle\n---\n\n![bg left](a.jpg)\n', true],
    'a directive indented as code is code': ['\t<!-- _class: image -->\n\n![bg left](a.jpg)\n', false],
    'a directive indented four spaces is code': ['    <!-- _class: image -->\n\n![bg left](a.jpg)\n', false],
    'text after the closing `-->` voids the directive': ['<!-- _class: image --> trailing\n\n![bg left](a.jpg)\n', false],
    // The paragraph rule must look at the whole run above the `---`: these all split the slide in the engine,
    // and the picture below belongs to a plain slide that must keep its full-bleed background.
    'a wrapped list item above `---` is not a setext heading': ['<!-- _class: image -->\n\n# One\n\n- an item that wraps\n  onto a second line\n---\n\n![bg](a.jpg)\n', false],
    'a quote continuation line above `---` is not a setext heading': ['<!-- _class: image -->\n\n# One\n\n> a quote\ncontinued lazily\n---\n\n![bg](a.jpg)\n', false],
    'an indented code line above `---` is not a setext heading': ['<!-- _class: image -->\n\n# One\n\nText\n\n    code line\n---\n\n![bg](a.jpg)\n', false],
    'a directive on the second line of an indented code block is code': ['# One\n\n    code\n    <!-- _class: image -->\n\n![bg left](a.jpg)\n', false],
    'a directive indented straight under a heading is code': ['# One\n    <!-- _class: image -->\n\n![bg left](a.jpg)\n', false],
    // From the second checker pass: a pipe, a `$$` or a lazy indented line inside a plain paragraph still makes a
    // setext heading; an unclosed trailing comment voids the directive; list content is not code; only the
    // line's first comment can carry the directive.
    'a pipe in prose above `---` is still a setext heading': ['<!-- _class: image -->\n\nA | B in prose\n---\n\n![bg left](a.jpg)\n', true],
    'inline `$$` above `---` is still a setext heading': ['<!-- _class: image -->\n\nPay $5 or $$x$$ inline\n---\n\n![bg left](a.jpg)\n', true],
    'a lazy indented line above `---` is still a setext heading': ['<!-- _class: image -->\n\nText\n    more indented\n---\n\n![bg left](a.jpg)\n', true],
    'a table above `---` is a table, and `---` a break': ['<!-- _class: image -->\n\na | b\n--- | ---\n1 | 2\n\n---\n\n![bg left](a.jpg)\n', false],
    'an unclosed comment after the directive voids it': ['<!-- _class: image --> <!-- b\n\n![bg left](a.jpg)\n', false],
    'a directive in a list item\'s indented continuation is read': ['- item\n\n    continuation para\n    <!-- _class: image -->\n\n![bg left](a.jpg)\n', true],
    'only the first comment on a line can carry the directive': ['<!-- a --> <!-- _class: image -->\n\n![bg left](a.jpg)\n', false],
    'a `===` heading above `---` leaves `---` a break': ['<!-- _class: image -->\n\nTitle\n===\n---\n\n![bg left](a.jpg)\n', false],
    'a paragraph ending in `-->` above `---` is still a setext heading': ['<!-- _class: image -->\n\nText -->\n---\n\n![bg left](a.jpg)\n', true],
    'a comment block above `---` leaves `---` a break': ['<!-- _class: image -->\n\n<!--\nnote\n-->\n---\n\n![bg left](a.jpg)\n', false],
    // The third checker's differential run (77e4c99): the default `split: headings` divider turns a setext `h2`
    // into a slide boundary, which the line walk never modeled. The lift now asks the engine's own boundaries.
    'a setext `h2` followed by a heading splits under `split: headings`': ['<!-- _class: image -->\n\nTitle\n---\n## Next\n\n![bg left](a.jpg)\n', false],
    'a setext `h2` that is the slide\'s second heading starts a slide': ['<!-- _class: image -->\n\n# Cover\n\nSubtitle\n---\n\n![bg left](a.jpg)\n', false],
    'the same deck under `split: rule` keeps one slide': ['---\nsplit: rule\n---\n\n<!-- _class: image -->\n\n# Cover\n\nSubtitle\n---\n\n![bg left](a.jpg)\n', true],
    'a list item\'s continuation paragraph above `---` leaves `---` a break': ['<!-- _class: image -->\n\n- item\n\n  para\n---\n\n![bg left](a.jpg)\n', false],
    'an ordered item\'s continuation paragraph above `---` leaves `---` a break': ['<!-- _class: image -->\n\n1. item\n\n   para\n---\n\n![bg left](a.jpg)\n', false],
    'a directive indented as code inside a list item is code': ['- item\n\n      <!-- _class: image -->\n\n![bg left](a.jpg)\n', false],
    'a pipe in prose above `---` is still a setext heading, and the heading after it splits': ['<!-- _class: image -->\n\nA | B prose\n---\n# H\n\n![bg left](a.jpg)\n', false],
    '`***` is a slide break too': ['<!-- _class: image -->\n\n# T\n\n***\n\n![bg left](a.jpg)\n', false],
    'a `---` inside a math block is not a break': ['<!-- _class: image -->\n\n# T\n\n$$\n---\n$$\n\n![bg left](a.jpg)\n', true],
    'inline HTML opening a paragraph above `---` is a setext heading': ['<!-- _class: image -->\n\n<em>x</em> text\n---\n\n![bg left](a.jpg)\n', true],
    'the plain case still lifts': ['<!-- _class: image -->\n\n# T\n\n![bg left](a.jpg)\n', true],
    'a blank line before `---` is a real break': ['<!-- _class: image -->\n\n# T\n\n---\n\n![bg left](a.jpg)\n', false],
    'a list item then `---` is a break, not a setext underline': ['- item\n---\n\n<!-- _class: image -->\n\n![bg left](a.jpg)\n', true],
  };
  for (const [name, [md, expected]] of Object.entries(cases)) {
    test(name, () => {
      assert.equal(engineSaysImage(md), expected, 'the premise: what the engine does');
      assert.equal(liftDraws(md), engineSaysImage(md), 'the lift agrees with the engine');
    });
  }
});

describe('bg-image — the lift reads the engine\'s boundaries, not a line walk', () => {
  const lifted = (md, fm) => liftImageBgImages(md, 'file:///d/', undefined, undefined, fm);
  test('a `![bg]` quoted in a fence or a comment on an image slide stays text', () => {
    assert.match(lifted('<!-- _class: image -->\n\n# T\n\n```md\n![bg left](a.jpg)\n```\n'), /!\[bg left\]\(a\.jpg\)/);
    assert.match(lifted('<!-- _class: image -->\n\n# T\n\n<!--\n![bg left](a.jpg)\n-->\n'), /!\[bg left\]\(a\.jpg\)/);
  });
  test('a body without its front matter reads the split mode from the front matter it is handed', () => {
    const body = '<!-- _class: image -->\n\n# Cover\n\nSubtitle\n---\n\n![bg left](a.jpg)\n';
    assert.doesNotMatch(lifted(body), /lattice-bg /, 'default `split: headings`: the picture is on a plain slide');
    assert.match(lifted(body, '---\nsplit: rule\n---\n'), /lattice-bg /, '`split: rule`: one image slide');
  });
  // The fourth checker's call-shape cases: what the engine and the hosts hand the lift, not the lift alone.
  const panels = (html) => [...String(html).matchAll(/<section\b[^>]*>/g)].map((m) => (/\bclass="[^"]*\bimage\b/.test(m[0]) ? 'image' : 'plain')).join(',') + (/lattice-bg /.test(String(html)) ? ' panel' : ' none');
  test('a body that opens with its own `---` block is a slide, not front matter, when the real front matter is handed separately', () => {
    assert.equal(panels(render('---\ntitle: x\n---\n---\n<!-- _class: image -->\n\n![bg left](x.jpg)\n\n---\n\nnext\n', {}).html), 'image,plain panel');
    assert.equal(panels(render('---\nsplit: rule\n---\n---\nintro\n---\n<!-- _class: image -->\n\n## A\n\n## B\n\n![bg left](x.jpg)\n', {}).html), 'image panel');
  });
  test('an engine with math off splits inside `$$` for the lift as it does for the render', () => {
    const deck = '<!-- _class: image -->\n\n$$\nx\n\n---\n\ny\n$$\n\n![bg left](x.jpg)\n';
    assert.equal(panels(createEngine({ math: false }).render(deck, {}).html), 'image,plain none');
    assert.equal(panels(render(deck, {}).html), 'image panel', 'math on: one image slide, and the parser is set back');
  });
  test('an engine with math off leaves the shared boundary parser as the host set it', async () => {
    const { boundaryParser } = await import('../../../lib/core/boundary-parser.mjs');
    createEngine({ math: false }).render('<!-- _class: image -->\n\n![bg left](x.jpg)\n', {});
    assert.deepEqual(boundaryParser.parse('$$\na\n\n---\n\nb\n$$\n', {}).map((t) => t.type), ['math_block']);
  });
  test('a `![bg]` inside an HTML block that is not a comment still lifts, as it did', () => {
    assert.equal(panels(render('<!-- _class: image -->\n\n<div>\n![bg left](x.jpg)\n</div>\n', {}).html), 'image panel');
  });
  test('only the `![bg]` lines change, and the front matter it was handed is not returned', () => {
    const body = '<!-- _class: image -->\r\n\r\n# T\r\n\r\n![bg left](a.jpg)\r\nafter\r\n';
    const out = lifted(body, '---\nsplit: rule\n---\n');
    assert.equal(out.replace(/<div class="lattice-bg[^>]*><\/div>/, '![bg left](a.jpg)'), body);
  });
});

describe('bg-image — a Marp ratio keeps the panel (followups.d/2739-p4)', () => {
  const lifted = (md) => liftImageBgImages(md, 'file:///d/');
  test('`![bg left:40%]` on an image slide lifts to the left panel; the share is the layout\'s own', () => {
    assert.match(lifted('<!-- _class: image -->\n\n# T\n\n![bg left:40%](a.svg)\n'), /lattice-bg-left[^>]*a\.svg/);
    assert.match(lifted('<!-- _class: image -->\n\n# T\n\n![bg right:30%](a.svg)\n'), /lattice-bg-right[^>]*a\.svg/);
  });
  test('modifiers with a value ride along: `![bg left:40% blur:10px]` still reads its side', () => {
    assert.match(lifted('<!-- _class: image -->\n\n# T\n\n![bg left:40% blur:10px](a.svg)\n'), /lattice-bg-left/);
  });
  test('a non-image slide keeps its picture as the engine\'s full-bleed background', () => {
    assert.match(lifted('# T\n\n![bg left:40%](a.svg)\n'), /!\[bg left:40%\]\(a\.svg\)/);
  });
});
