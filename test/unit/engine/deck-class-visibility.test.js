/**
 * Unit: a deck-wide `class:` token is VISIBLE TO THE HTML-STAGE TRANSFORMS, on
 * the slides that name their own `_class:` too.
 *
 * The absence of this test is why #1358 shipped. Every deck-wide register
 * (`class:`, `finish:`, `mode:`, …) is merged into the section's class list by
 * `deckClassPropagate` at the markdown-it TOKEN stage, i.e. before a single
 * HTML-stage transform runs — so a transform keyed on a class token is entitled
 * to read the resolved list and get the deck's answer. Nothing pinned that, and
 * two transforms were reading the WRONG ATTRIBUTE instead:
 *
 *   <section id="1" data-class="content" class="content no-note form" …>
 *                   ^^^^^^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^^^^^^^^^^^^^^
 *                   raw `_class:`        resolved — deck tokens merged in
 *
 * A bare `/class="([^"]*)"/` matches leftmost, so it read `data-class`. The
 * deck-wide token was nowhere in it, and the transform silently did the wrong
 * thing on exactly the slides carrying their own `_class:`.
 *
 * Three layers, because a single-transform regression test would not have caught
 * the second victim:
 *   1. the ATTRIBUTE CONTRACT — the resolved list carries the deck token;
 *   2. the READER — `readClassAttr` never returns the `data-class` payload;
 *   3. the two BEHAVIORS that regressed, asserted as a difference rather than
 *      an absence (a wrong `no-note` deck and a right one, side by side).
 *
 * The structural half — new code cannot reintroduce the unguarded regex — is a
 * build:check gate (`checkClassAttrReads` in tools/check-ownership.js), not a
 * test: it is a property of the source, not of a render.
 *
 * See engineering/decisions/2026-08-04-data-class-shadows-resolved-class.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { render } = require('../../../lib/engine');
const { readClassAttr } = require('../../../lib/core/section-walk');

// Every section's OPEN TAG, verbatim, in document order.
function openTags(html) {
  return html.match(/<section\b[^>]*>/g) || [];
}

function sections(markdown) {
  const html = String(render(markdown, {}).html || '');
  const tags = openTags(html);
  const bodies = html.split(/<section\b[^>]*>/).slice(1).map((s) => s.split('</section>')[0]);
  return tags.map((tag, i) => ({ tag, cls: readClassAttr(tag).split(/\s+/).filter(Boolean), body: bodies[i] }));
}

const deck = (fm, slides) => ['---', 'marp: true', 'theme: indaco', ...fm, '---', '', slides].join('\n');

describe('deck-class visibility — the resolved class list, not the `_class:` payload', () => {
  test('a deck-wide `class:` token lands on a slide that names its own `_class:`', () => {
    const [own, none] = sections(deck(['class: no-note'], [
      '<!-- _class: content -->', '', '## Names its own.', '', '- one', '', 'Trailing.', '',
      '---', '', '## Names none.', '', '- one', '', 'Trailing.', '',
    ].join('\n')));
    assert.ok(own.cls.includes('no-note'), `deck token missing from ${own.cls.join(' ')}`);
    assert.ok(own.cls.includes('content'), 'the slide keeps its own component');
    assert.ok(none.cls.includes('no-note'), 'sanity: the un-classed slide gets it too');
  });

  test('`data-class` carries the RAW payload and sits before `class` — the shadowing shape', () => {
    // Pinned, not incidental: this is the exact tag shape that made the naive regex
    // wrong, so if the attribute order or the raw-payload semantics ever change, the
    // reason `readClassAttr` exists changes with it and this test should be revisited.
    const [own] = sections(deck(['class: no-note'], '<!-- _class: content -->\n\n## H\n\n- one\n\nTrailing.\n'));
    assert.match(own.tag, /data-class="content"/, 'data-class holds the raw `_class:` payload');
    assert.ok(
      own.tag.indexOf('data-class="') < own.tag.indexOf(' class="'),
      'data-class precedes class — leftmost-match is what shadowed the resolved list',
    );
  });

  test('readClassAttr reads the resolved list past a leading `data-class`', () => {
    const tag = '<section id="1" data-class="content" class="content no-note form" style="--class:content;">';
    assert.equal(readClassAttr(tag), 'content no-note form');
    // The two forms this repo actually wrote, and why neither is a guard.
    assert.equal(tag.match(/class="([^"]*)"/)[1], 'content', 'bare: leftmost wins → data-class');
    assert.equal(tag.match(/\bclass="([^"]*)"/)[1], 'content', '`\\b`: `-`→`c` IS a word boundary');
    assert.equal(readClassAttr('<section>'), '', 'no class attribute → empty string, never null');
    assert.equal(readClassAttr(undefined), '', 'non-string → empty string');
  });

  test('below-note: deck-wide `no-note` suppresses promotion on a `_class:`-carrying slide', () => {
    const body = '## H.\n\n- one\n- two\n\nTrailing sentence.\n';
    const [suppressed] = sections(deck(['class: no-note'], `<!-- _class: content -->\n\n${body}`));
    const [promoted] = sections(deck([], `<!-- _class: content -->\n\n${body}`));
    // A DIFFERENCE, not an absence: the control proves the wrap is reachable at all.
    assert.ok(promoted.body.includes('class="below-note"'), 'control: promotion happens without the token');
    assert.ok(!suppressed.body.includes('class="below-note"'), 'deck-wide `no-note` suppresses it');
  });

  test('image structure: a deck-wide modifier still reaches the image transforms', () => {
    // The second victim, and the one no `no-note` regression test would have found:
    // the image transforms read `data-class` — the RAW `_class:` payload — and so
    // could not see a deck-wide token at all, while the DOM path (`className`)
    // could: a silent cross-path divergence.
    //
    // The original repro drove it with a deck-wide `class: image`. That spelling is
    // no longer reachable — a component name in the deck-wide register is refused
    // (lib/core/deck-class-register.js) — so the shadowing SHAPE is reproduced with
    // the halves swapped: the component is the slide's, the deck contributes the
    // `statement` variant, and only the resolved list carries both. `data-class`
    // still holds `image` alone, so a transform reading it builds no scrim.
    const body = '![bg](x.png)\n\n## Head\n\nProse here.\n';
    const [slide] = sections(deck(['class: statement'], `<!-- _class: image -->\n\n${body}`));
    assert.match(slide.tag, /data-class="image"/, 'the raw payload is missing the deck token');
    assert.ok(slide.cls.includes('statement'), 'sanity: the deck token resolved onto the slide');
    assert.ok(slide.body.includes('class="image-text"'), 'the image panel is built from the resolved list');
    assert.ok(slide.body.includes('class="image-scrim"'), 'the scrim needs image + the DECK-supplied statement');
  });

  test('a component name in the deck-wide `class:` is refused, and the slide keeps its own', () => {
    // The register is deck-WIDE: it is appended to every section, including one that
    // names its own `_class:`, so a component there collides rather than composes —
    // `_class: cards-grid` + `class: kpi` puts two components on one section and lets
    // CSS source order pick. Refused at the boundary, so it is never stamped.
    const [own, none] = sections(deck(['class: kpi no-note'], [
      '<!-- _class: cards-grid -->', '', '## Names its own.', '', '- one', '  - two', '',
      '---', '', '## Names none.', '', 'Prose.', '',
    ].join('\n')));
    assert.ok(!own.cls.includes('kpi'), `the deck-wide component is a no-op, got ${own.cls.join(' ')}`);
    assert.ok(own.cls.includes('cards-grid'), 'the slide keeps its own component');
    assert.ok(own.cls.includes('no-note'), 'a non-component deck token still propagates');
    assert.ok(!none.cls.includes('kpi'), 'and it is a no-op on an un-classed slide too');
    assert.ok(none.cls.includes('content'), 'which then falls back to the default component');
  });
});
