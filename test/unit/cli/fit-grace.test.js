/**
 * The pure half of lib/cli/fit-grace.js: how a claim is added to a slide, how the deck is cut into slides, and what the
 * author is told. The rendering half is test/integration/export/fit-grace.test.js.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const g = require('../../../lib/cli/fit-grace.js');

describe('fit-grace: adding a claim to a slide', () => {
  test('appends to the slide\'s own `_class:`', () => {
    assert.equal(g.withClaim('<!-- _class: gantt -->\n\n## T', 'claim-hero'), '<!-- _class: gantt claim-hero -->\n\n## T');
  });
  test('adds a directive to a slide that has none', () => {
    assert.equal(g.withClaim('## T\n\n- a', 'claim-quiet'), '<!-- _class: claim-quiet -->\n\n## T\n\n- a');
  });
  test('reads the slide\'s own classes', () => {
    assert.deepEqual(g.slideClasses('<!-- _class: bar  claim-quiet -->'), ['bar', 'claim-quiet']);
    assert.deepEqual(g.slideClasses('## no directive'), []);
  });
});

describe('fit-grace: the check deck', () => {
  test('`fit: report` replaces any fit/guards line, so page N is slide N', () => {
    const fm = g.reportFrontMatter('theme: indaco\nfit: trim\nguards: strict');
    assert.equal(fm, '---\ntheme: indaco\nfit: report\n---\n\n');
  });
  test('the deck is cut where the renderer cuts it (a `---` in a code fence is not a slide break)', () => {
    const { yaml, slides } = g.deckParts('---\ntheme: x\n---\n\n# A\n\n---\n\n```yaml\n---\n```\n\n---\n\n# C\n');
    assert.equal(yaml, 'theme: x');
    assert.equal(slides.length, 3);
  });
});

describe('fit-grace: what the author reads', () => {
  test('per slide, and only what was checked', () => {
    const lines = g.describe({ clipped: [3, 5], footerOnly: [], deck: null, perSlide: [
      { slide: 3, claim: 'claim-hero', had: null },
      { slide: 5, claim: null, had: 'claim-quiet' },
    ] });
    assert.match(lines[0], /slide 3 fits with `claim-hero`/);
    assert.match(lines[1], /slide 5 still clips with `claim-quiet` under every claim/);
  });
  test('a deck-wide claim comes with the slide-by-slide alternative', () => {
    const lines = g.describe({ clipped: [1, 2, 3], footerOnly: [9], deck: 'quiet', perSlide: [1, 2, 3].map((slide) => ({ slide, claim: 'claim-quiet', had: null })) });
    assert.match(lines[0], /`claim: quiet` in the front matter fits all 3/);
    assert.ok(lines.some((l) => /Or, slide by slide/.test(l)));
    assert.match(lines[lines.length - 1], /Not counted: page 9, where only the running footer is cut/);
  });
  test('says why it could not check a deck whose pages are not its slides', () => {
    assert.match(g.describe({ skipped: 'a `split:` rule divides it' })[0], /not checked; a `split:` rule divides it/);
  });
  test('says nothing when nothing clips', () => {
    assert.deepEqual(g.describe({ clipped: [], footerOnly: [], perSlide: [], deck: null }), []);
  });
});

// Review of #3362, finding 3: a slide that takes its layout from a running `class:` (Marp's bare global form) must keep
// it when a claim is added, and a trial slide rendered on its own must keep the directives it inherits.
describe('fit-grace: a slide that inherits its class and chrome', () => {
  const slides = ['<!-- class: gantt -->\n<!-- footer: "Board" -->\n\n## A', '## B', '<!-- _class: list -->\n\n## C'];
  const inh = g.inheritedDirectives(slides);
  test('the running directives run on to the following slides', () => {
    assert.deepEqual(inh[1], { class: 'gantt', footer: '"Board"' });
  });
  test('a claim on a slide with no `_class:` repeats the running class, so the layout survives', () => {
    assert.equal(g.withClaim('## B', 'claim-hero', inh[1].class), '<!-- _class: gantt claim-hero -->\n\n## B');
  });
  test('a slide alone carries its inherited chrome as spot directives', () => {
    assert.equal(g.standalone(slides[1], inh[1]), '<!-- _footer: "Board" -->\n\n## B');
    // its own directive wins
    assert.equal(g.standalone('<!-- _footer: x -->\n\n## C', inh[2]), '<!-- _footer: x -->\n\n## C');
  });
  test('the author is told the spot class to write, layout included', () => {
    const lines = g.describe({ clipped: [2], footerOnly: [], deck: null, perSlide: [{ slide: 2, claim: 'claim-hero', had: null, write: '<!-- _class: gantt claim-hero -->' }] });
    assert.match(lines[0], /fits with `<!-- _class: gantt claim-hero -->`/);
  });
});
