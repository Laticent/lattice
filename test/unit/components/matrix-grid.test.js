/**
 * Unit tests for matrix-grid's chart-family builder
 * (lib/components/chart/_chart-family/chart-family.js buildMatrixGridSection).
 *
 * buildMatrixGridSection runs on the raw section HTML before the generic
 * chart-frame skeleton wrap (eyebrow/h2/subtitle/caption lift). It does three
 * things: splits a two-part eyebrow ("column axis · row axis") so the row
 * axis renders as a rotated side label, wraps the table in
 * `.matrix-grid-figure`, and wraps the trailing legend paragraph's inner
 * content in one `<span>` (so the shared flex-column `.chart-caption` rule
 * doesn't tear a `<strong>…</strong> · <em>…</em>` legend into stacked lines).
 *
 * Several cases below are regression locks for an independent checker's
 * findings on the initial implementation: an unanchored eyebrow regex that
 * could shred a code-only subtitle or legend (finding #3), `String.replace`
 * special replacement patterns (`$&`, `` $` ``, `$'`, `$$`) splicing
 * unrelated HTML into the table or legend when a cell/legend contained one
 * literally (finding #2), and the row axis being escaped twice — once by
 * markdown-it's own HTML-entity escaping, once by `escAttr` — corrupting an
 * `&` in the label (finding #4).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { buildMatrixGridSection } = require('../../../lib/components/chart/_chart-family/chart-family');

const ctx = { cls: 'matrix-grid', classTokens: ['matrix-grid'], orientation: 'landscape' };

describe('buildMatrixGridSection', () => {
  test('two-part eyebrow: both halves move to the figure (data-col-axis, data-row-axis), masthead eyebrow removed', () => {
    const html = [
      '<p><code>Wider reach → · Deeper cognition ↑</code></p>',
      '<h2>Title</h2>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    // The masthead eyebrow paragraph is gone entirely — both halves render
    // beside the grid (column axis centered above it, row axis rotated on
    // the left), not as a title-adjacent chart-eyebrow.
    assert.doesNotMatch(out, /<p>\s*<code>/);
    // The thin arrow glyph is normalized to a solid triangle for both axes
    // (reads at the label's own bold weight, not a stray thin stroke). The
    // row axis's glyph is pre-flipped (▼, not ▲) — matrix-grid.styles.css
    // rotates the whole row-axis label 180°, so ▼ is what displays as ▲.
    assert.match(out, /data-col-axis="Wider reach ▶"/);
    assert.match(out, /data-row-axis="Deeper cognition ▼"/);
    assert.match(out, /<div class="matrix-grid-figure"[^>]*><table>/);
  });

  test('axis arrow normalization: every direction on both axes maps to a solid triangle, pre-flipped only on the rotated row axis', () => {
    const cases = [
      ['left ← · up ↑', 'left ◀', 'up ▼'],
      ['right → · down ↓', 'right ▶', 'down ▲'],
      // Already a solid triangle: still normalized (col unchanged, row still pre-flipped).
      ['right ▶ · up ▲', 'right ▶', 'up ▼'],
    ];
    for (const [eyebrow, wantCol, wantRow] of cases) {
      const html = [
        `<p><code>${eyebrow}</code></p>`,
        '<h2>Title</h2>',
        '<table><tbody><tr><td>a</td></tr></tbody></table>',
      ].join('');
      const { html: out } = buildMatrixGridSection(html, ctx);
      assert.match(out, new RegExp(`data-col-axis="${wantCol}"`), eyebrow);
      assert.match(out, new RegExp(`data-row-axis="${wantRow}"`), eyebrow);
    }
  });

  test('axis arrow normalization: no trailing glyph is left untouched, not given an arrow', () => {
    const html = [
      '<p><code>Category · Depth</code></p>',
      '<h2>Title</h2>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.match(out, /data-col-axis="Category"/);
    assert.match(out, /data-row-axis="Depth"/);
  });

  test('single-part eyebrow (no ·): left as a plain eyebrow, no data-row-axis', () => {
    const html = [
      '<p><code>Wider reach →</code></p>',
      '<h2>Title</h2>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.match(out, /<p><code>Wider reach →<\/code><\/p>/);
    assert.doesNotMatch(out, /data-row-axis/);
    assert.doesNotMatch(out, /data-col-axis/);
  });

  test('no eyebrow at all: the table still wraps, no data-row-axis', () => {
    const html = '<h2>Title</h2><table><tbody><tr><td>a</td></tr></tbody></table>';
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.match(out, /<div class="matrix-grid-figure">\s*<table>/);
    assert.doesNotMatch(out, /data-row-axis/);
  });

  test('legend: wraps the trailing paragraph inner content in one span', () => {
    const html = [
      '<h2>Title</h2>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
      '<p><strong>Your level</strong> · <em>reachable</em> — a caveat.</p>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.match(
      out,
      /<p><span class="matrix-grid-legend"><strong>Your level<\/strong> · <em>reachable<\/em> — a caveat\.<\/span><\/p>/,
    );
  });

  test('regression (finding #3a): an unanchored eyebrow regex must not shred a code-only SUBTITLE after the h2', () => {
    // No eyebrow before the h2 — the code pill below is the subtitle. An
    // unanchored scan for "the first <p><code>…</code></p> anywhere" finds
    // this one instead, truncates it at the first "·", and steals the rest
    // into data-row-axis — even though it never appeared before the heading.
    const html = [
      '<h2>Title</h2>',
      '<p><code>Read · this way</code></p>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.doesNotMatch(out, /data-row-axis/, 'a post-h2 code pill is never the eyebrow');
    assert.match(out, /<p><code>Read · this way<\/code><\/p>/, 'the subtitle survives intact');
  });

  test('regression (finding #3b): an unanchored eyebrow regex must not shred a code-only LEGEND', () => {
    const html = [
      '<h2>Title</h2>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
      '<p><code>filled · outlined</code></p>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.doesNotMatch(out, /data-row-axis/, 'a trailing code pill is never the eyebrow');
    assert.match(out, /<span class="matrix-grid-legend"><code>filled · outlined<\/code><\/span>/);
  });

  test('regression (finding #2a): a table cell containing "$\'" must not splice the legend into the table', () => {
    const html = [
      '<h2>Title</h2>',
      "<table><tbody><tr><td>Cost $' each</td></tr></tbody></table>",
      '<p>a distinctive legend sentence</p>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.doesNotMatch(out, /a distinctive legend sentence[\s\S]*<\/table>/, 'the legend must not appear inside the table');
    assert.match(out, /Cost \$' each/, 'the literal cell text survives unmangled');
  });

  test('regression (finding #2b): a legend containing "$&", "$\'" or "$`" must not corrupt the caption', () => {
    const html = [
      '<h2>Title</h2>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
      "<p>Cost per $&amp; unit and $` and $' here.</p>",
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    // The wrapped legend must be exactly one span with the literal text intact —
    // no nested <p>, no duplicated/garbled fragments from $-pattern substitution.
    assert.match(
      out,
      /<p><span class="matrix-grid-legend">Cost per \$&amp; unit and \$` and \$' here\.<\/span><\/p>/,
    );
  });

  test('regression (finding #4): the row axis is escaped exactly once — a literal "&" round-trips as one entity', () => {
    const html = [
      '<p><code>Wider reach → · Research &amp; development ↑</code></p>',
      '<h2>Title</h2>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    // Exactly one level of escaping: the attribute value decodes (by any HTML
    // parser) to "Research & development ▼" — never "&amp;" surviving as
    // literal text inside the attribute. (The trailing glyph is normalized
    // to a pre-flipped solid triangle — see the two-part eyebrow test above.)
    assert.match(out, /data-row-axis="Research &amp; development ▼"/);
    assert.doesNotMatch(out, /&amp;amp;/, 'the ampersand must not be double-escaped');
  });

  test('a table with no eyebrow and no legend still wraps cleanly', () => {
    const html = '<h2>Title</h2><table><tbody><tr><td>a</td></tr></tbody></table>';
    const { html: out, cls } = buildMatrixGridSection(html, ctx);
    assert.match(out, /<div class="matrix-grid-figure">/);
    assert.equal(cls, ctx.cls);
  });
});
