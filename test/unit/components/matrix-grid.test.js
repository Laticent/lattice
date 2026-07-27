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
  test('two inline-code spans in one paragraph become the axis labels, arrows generated', () => {
    const html = [
      '<h2>Title</h2>',
      '<p><code>Wider reach</code> <code>Deeper cognition</code></p>',
      '<table><tbody><tr><td>a</td></tr></tbody></table>',
    ].join('');
    const { html: out } = buildMatrixGridSection(html, ctx);
    // The axis paragraph is consumed entirely — it is chrome for the grid, not
    // body copy, so it must not also render as a stray code pill.
    assert.doesNotMatch(out, /<p>\s*<code>/);
    // Arrows are GENERATED: the author wrote only the axis names. The row axis
    // is pre-flipped (▼ displays as ▲ after the label's 180° rotation).
    assert.match(out, /data-col-axis="Wider reach ▶"/);
    assert.match(out, /data-row-axis="Deeper cognition ▼"/);
    assert.match(out, /<div class="matrix-grid-figure"[^>]*><table>/);
  });

  test('an arrow the author typed anyway is stripped, never doubled', () => {
    for (const [c, r] of [['Wider reach →', 'Deeper cognition ↑'], ['Wider reach ▶', 'Deeper cognition ▲']]) {
      const html = `<h2>Title</h2><p><code>${c}</code> <code>${r}</code></p><table><tbody><tr><td>a</td></tr></tbody></table>`;
      const { html: out } = buildMatrixGridSection(html, ctx);
      assert.match(out, /data-col-axis="Wider reach ▶"/, c);
      assert.match(out, /data-row-axis="Deeper cognition ▼"/, r);
    }
  });

  test('no axis paragraph: the grid renders with no axis labels at all', () => {
    const html = '<h2>Title</h2><table><tbody><tr><td>a</td></tr></tbody></table>';
    const { html: out } = buildMatrixGridSection(html, ctx);
    assert.doesNotMatch(out, /data-col-axis/);
    assert.doesNotMatch(out, /data-row-axis/);
    assert.match(out, /<div class="matrix-grid-figure">\s*<table>/);
  });

  test('a paragraph with only ONE code is not an axis pair — left as a plain eyebrow', () => {
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
      '<h2>Title</h2>',
      '<p><code>Wider reach</code> <code>Research &amp; development</code></p>',
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
