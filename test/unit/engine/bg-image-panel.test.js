// THE IMAGE PANEL IS THE ENGINE'S OWN ANSWER (followups.d/2739-p10, p13). On an `image` slide the engine draws the
// slide's one lone picture, `![A](a.jpg)`, as the layout's `.lattice-bg` panel, reading the slide's class as the engine
// resolved it (lib/core/placed-picture.mjs). The cases are the ones #2776's four checker rounds found a source line walk
// getting wrong, first written for Marp's `![bg]` (which the engine no longer reads, 2026-11-13) and kept for the
// shortcut, whose placement turns on the same question: which slide is the picture on? Each asserts the premise (what the
// engine says about the slide) and that the panel follows it.
const test = require('node:test');
const assert = require('node:assert/strict');
const { render, createEngine } = require('../../../lib/engine');
const { readClassAttr } = require('@laticent/markup');

const lastSection = (html) => (String(html).match(/<section\b[^>]*>/g) || []).pop() || '';
const engineSaysImage = (md) => /\bimage\b/.test(readClassAttr(lastSection(render(md.replace(/!\[A\]\([^)]*\)/g, 'MARK'), {}).html)));
const panelDrawn = (md) => /class="lattice-bg /.test(render(md, {}).html);

const cases = {
  'a `---` directly under a text line is a setext underline, not a slide break': ['<!-- _class: image -->\n\nTitle\n---\n\n![A](a.jpg)\n', true],
  'a directive indented as code is code': ['\t<!-- _class: image -->\n\n![A](a.jpg)\n', false],
  'a directive indented four spaces is code': ['    <!-- _class: image -->\n\n![A](a.jpg)\n', false],
  'text after the closing `-->` voids the directive': ['<!-- _class: image --> trailing\n\n![A](a.jpg)\n', false],
  // The paragraph rule must look at the whole run above the `---`: these all split the slide in the engine,
  // and the picture below belongs to a plain slide that must keep its full-bleed background.
  'a wrapped list item above `---` is not a setext heading': ['<!-- _class: image -->\n\n# One\n\n- an item that wraps\n  onto a second line\n---\n\n![A](a.jpg)\n', false],
  'a quote continuation line above `---` is not a setext heading': ['<!-- _class: image -->\n\n# One\n\n> a quote\ncontinued lazily\n---\n\n![A](a.jpg)\n', false],
  'an indented code line above `---` is not a setext heading': ['<!-- _class: image -->\n\n# One\n\nText\n\n    code line\n---\n\n![A](a.jpg)\n', false],
  'a directive on the second line of an indented code block is code': ['# One\n\n    code\n    <!-- _class: image -->\n\n![A](a.jpg)\n', false],
  'a directive indented straight under a heading is code': ['# One\n    <!-- _class: image -->\n\n![A](a.jpg)\n', false],
  // From the second checker pass: a pipe, a `$$` or a lazy indented line inside a plain paragraph still makes a
  // setext heading; an unclosed trailing comment voids the directive; list content is not code; only the
  // line's first comment can carry the directive.
  'a pipe in prose above `---` is still a setext heading': ['<!-- _class: image -->\n\nA | B in prose\n---\n\n![A](a.jpg)\n', true],
  'inline `$$` above `---` is still a setext heading': ['<!-- _class: image -->\n\nPay $5 or $$x$$ inline\n---\n\n![A](a.jpg)\n', true],
  'a lazy indented line above `---` is still a setext heading': ['<!-- _class: image -->\n\nText\n    more indented\n---\n\n![A](a.jpg)\n', true],
  'a table above `---` is a table, and `---` a break': ['<!-- _class: image -->\n\na | b\n--- | ---\n1 | 2\n\n---\n\n![A](a.jpg)\n', false],
  'an unclosed comment after the directive voids it': ['<!-- _class: image --> <!-- b\n\n![A](a.jpg)\n', false],
  'a directive in a list item\'s indented continuation is read': ['- item\n\n    continuation para\n    <!-- _class: image -->\n\n![A](a.jpg)\n', true],
  'only the first comment on a line can carry the directive': ['<!-- a --> <!-- _class: image -->\n\n![A](a.jpg)\n', false],
  'a `===` heading above `---` leaves `---` a break': ['<!-- _class: image -->\n\nTitle\n===\n---\n\n![A](a.jpg)\n', false],
  'a paragraph ending in `-->` above `---` is still a setext heading': ['<!-- _class: image -->\n\nText -->\n---\n\n![A](a.jpg)\n', true],
  'a comment block above `---` leaves `---` a break': ['<!-- _class: image -->\n\n<!--\nnote\n-->\n---\n\n![A](a.jpg)\n', false],
  // The third checker's differential run (77e4c99): the default `split: headings` divider turns a setext `h2`
  // into a slide boundary, which the line walk never modeled. The lift now asks the engine's own boundaries.
  'a setext `h2` followed by a heading splits under `split: headings`': ['<!-- _class: image -->\n\nTitle\n---\n## Next\n\n![A](a.jpg)\n', false],
  'a setext `h2` that is the slide\'s second heading starts a slide': ['<!-- _class: image -->\n\n# Cover\n\nSubtitle\n---\n\n![A](a.jpg)\n', false],
  'the same deck under `split: rule` keeps one slide': ['---\nsplit: rule\n---\n\n<!-- _class: image -->\n\n# Cover\n\nSubtitle\n---\n\n![A](a.jpg)\n', true],
  'a list item\'s continuation paragraph above `---` leaves `---` a break': ['<!-- _class: image -->\n\n- item\n\n  para\n---\n\n![A](a.jpg)\n', false],
  'an ordered item\'s continuation paragraph above `---` leaves `---` a break': ['<!-- _class: image -->\n\n1. item\n\n   para\n---\n\n![A](a.jpg)\n', false],
  'a directive indented as code inside a list item is code': ['- item\n\n      <!-- _class: image -->\n\n![A](a.jpg)\n', false],
  'a pipe in prose above `---` is still a setext heading, and the heading after it splits': ['<!-- _class: image -->\n\nA | B prose\n---\n# H\n\n![A](a.jpg)\n', false],
  '`***` is a slide break too': ['<!-- _class: image -->\n\n# T\n\n***\n\n![A](a.jpg)\n', false],
  'a `---` inside a math block is not a break': ['<!-- _class: image -->\n\n# T\n\n$$\n---\n$$\n\n![A](a.jpg)\n', true],
  'inline HTML opening a paragraph above `---` is a setext heading': ['<!-- _class: image -->\n\n<em>x</em> text\n---\n\n![A](a.jpg)\n', true],
  'the plain case still lifts': ['<!-- _class: image -->\n\n# T\n\n![A](a.jpg)\n', true],
  'a blank line before `---` is a real break': ['<!-- _class: image -->\n\n# T\n\n---\n\n![A](a.jpg)\n', false],
  'a list item then `---` is a break, not a setext underline': ['- item\n---\n\n<!-- _class: image -->\n\n![A](a.jpg)\n', true],
};

for (const [name, [md, expected]] of Object.entries(cases)) {
  test(name, () => {
    assert.equal(engineSaysImage(md), expected, 'the premise: what the engine does');
    assert.equal(panelDrawn(md), expected, 'the panel follows the engine');
  });
}

const panels = (html) => [...String(html).matchAll(/<section\b[^>]*>/g)].map((m) => (/\bclass="[^"]*\bimage\b/.test(m[0]) ? 'image' : 'plain')).join(',') + (/class="lattice-bg /.test(String(html)) ? ' panel' : ' none');

test('a body that opens with its own `---` block is a slide, not front matter', () => {
  assert.equal(panels(render('---\ntitle: x\n---\n---\n<!-- _class: image -->\n\n![A](x.jpg)\n\n---\n\nnext\n', {}).html), 'image,plain panel');
});

test('an engine with math off splits inside `$$`, and the panel follows', () => {
  const deck = '<!-- _class: image -->\n\n$$\nx\n\n---\n\ny\n$$\n\n![A](x.jpg)\n';
  assert.equal(panels(createEngine({ math: false }).render(deck, {}).html), 'image,plain none');
  assert.equal(panels(render(deck, {}).html), 'image panel');
});

test('a picture inside a raw HTML block, a comment or a fence is text, as markdown-it reads it', () => {
  assert.equal(panels(render('<!-- _class: image -->\n\n<div>\n![A](x.jpg)\n</div>\n', {}).html), 'image none');
  assert.equal(panels(render('<!-- _class: image -->\n\n# T\n\n<!--\n![A](a.jpg)\n-->\n', {}).html), 'image none');
  assert.equal(panels(render('<!-- _class: image -->\n\n# T\n\n```md\n![A](a.jpg)\n```\n', {}).html), 'image none');
});

test('the panel resolves against the render\'s base, and an address the allowlist refuses never becomes a panel', () => {
  assert.match(render('<!-- _class: image -->\n\n![A](pics/a.jpg)\n', undefined, { baseUrl: 'file:///d/' }).html, /class="lattice-bg[^>]*file:\/\/\/d\/pics\/a\.jpg/);
  assert.doesNotMatch(render('<!-- _class: image -->\n\n![A](javascript:alert(1))\n', {}).html, /lattice-bg/);
});

// THE ENGINE BREAK (2026-11-13; engineering/decisions/2026-10-16-media-plugins.md §9). Marp's `![bg …]` keywords are not
// read: the picture is an ordinary `<img>` wherever it stands, never a panel and never the section's background, and the
// image plugin's `image-marp-keyword` lint names the fix. Each arm fails on the engine before the break.
test('a Marp `![bg]` is an ordinary picture: never a panel, never a section background', () => {
  for (const md of ['<!-- _class: image -->\n\n# T\n\n![bg left](a.jpg)\n', '# T\n\n![bg](a.jpg)\n', '<!-- _class: content bleed -->\n\n# T\n\n![bg right:40%](a.jpg)\n']) {
    const html = render(md, {}).html;
    assert.doesNotMatch(html, /class="lattice-bg /, md);
    assert.doesNotMatch(html, /background-image:url/, md);
    assert.match(html, /<img src="a\.jpg" alt="bg[^"]*"/, md);
  }
});

test('a Marp `![bg]` keeps a lone picture beside it out of the panel, so an unswept deck does not promote its logo', () => {
  const html = render('<!-- _class: image -->\n\n# T\n\n![bg right](photo.jpg)\n\n![Logo](logo.png)\n', {}).html;
  assert.doesNotMatch(html, /class="lattice-bg /);
});

// A panes slide on a deck that cannot lay panes side by side (9:16) is split into one page per pane, and the image pane's page
// is an ordinary `image` slide by the time the engine places pictures, so its lone picture is the panel (followups.d/2739-p13).
test('a split image pane places its photo on a 9:16 deck', () => {
  const deck = `---\ntheme: indaco\nsize: story\n---\n\n<!-- _class: columns -->\n\n## The site\n\n<!-- _pane: image -->\n![The site](photo.jpg)\n\n<!-- _pane: list -->\n### What changes\n\n- The hall opens in May\n`;
  assert.equal(panels(render(deck, {}).html), 'image,plain panel');
});

