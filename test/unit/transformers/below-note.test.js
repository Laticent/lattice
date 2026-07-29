/**
 * Unit tests for the universal below-note kernel (lib/core/below-note.js) and
 * its registry adapter (lib/transformers/below-note.js).
 *
 * Contract: a layout's trailing `<p>` that follows a structural block
 * (div/ul/ol/table/pre/blockquote) is wrapped in `.below-note` for the
 * hairline treatment — UNLESS the section's class is on the exclusion list,
 * or the `<p>` follows another `<p>` (that is main content). The registry
 * wires two consumers: `applyToHtml` (lib/engine — the CLI/PDF path and the
 * browser playground, which share the call) on full sections with a trailing
 * `<footer>`, and `applyToDom` (lattice-runtime.js). `wrapSectionBody`
 * (pre-chrome body, no footer) is a lower-level kernel helper — not
 * currently wired into either registry consumer — pinned here for
 * byte-identical parity with the pre-kernel inline regex it replaced.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const belowNote = require('../../../lib/core/below-note');
const adapter = require('../../../lib/transformers/below-note');

const WRAP = '<div class="below-note">';
const sec = (cls, inner) => `<section class="${cls}">${inner}</section>`;

describe('below-note — wrapSectionBody (pre-chrome kernel helper, unwired)', () => {
  test('wraps a trailing <p> after a list', () => {
    const out = belowNote.wrapSectionBody('<ul><li>a</li></ul><p>note</p>', 'list-checks');
    assert.equal(out, '<ul><li>a</li></ul><div class="below-note"><p>note</p></div>');
  });

  test('is byte-identical to the legacy inline regex (drops trailing whitespace)', () => {
    const out = belowNote.wrapSectionBody('<table><tr><td>x</td></tr></table>\n<p>n</p>\n', 'list-tabular');
    assert.equal(out, '<table><tr><td>x</td></tr></table>\n<div class="below-note"><p>n</p></div>');
  });

  test('skips excluded layouts', () => {
    const html = '<ul><li>a</li></ul><p>note</p>';
    for (const cls of ['content', 'diagram', 'title', 'split-panel', 'code']) {
      assert.equal(belowNote.wrapSectionBody(html, cls), html, `should skip ${cls}`);
    }
  });

  test('does not wrap a <p> that follows another <p> (main content)', () => {
    const html = '<p>body</p><p>more body</p>';
    assert.equal(belowNote.wrapSectionBody(html, 'statement'), html);
  });
});

describe('below-note — applyToHtml (lib/engine: CLI/PDF + browser playground)', () => {
  test('wraps the trailing <p> and preserves a following <footer>', () => {
    const out = belowNote.applyToHtml(
      sec('list-checks', '<ul><li>a</li></ul><p>note</p><footer>f</footer>'),
    );
    assert.ok(out.includes('<div class="below-note"><p>note</p></div><footer>f</footer>'));
  });

  test('finds the trailing <p> inside a masthead-lift .cell-stage cell (Form default)', () => {
    // Mirrors what lib/forms/cell/masthead/masthead.transform.js produces for a
    // STAGE_MIGRATED Form slide: the trailing <footer>/pagination already moved
    // into a sibling .cell-footer, so the stage's own tail is note-<p> exactly.
    const out = belowNote.applyToHtml(
      sec(
        'cards-grid form',
        '<div class="cell-masthead"></div>' +
          '<div class="cell-stage"><ul><li>a</li></ul><blockquote><p>q</p></blockquote><p>note</p></div>' +
          '<div class="cell-footer"><footer>f</footer></div>',
      ),
    );
    assert.ok(
      out.includes('<blockquote><p>q</p></blockquote><div class="below-note"><p>note</p></div></div>'),
      out,
    );
    assert.ok(out.includes('<div class="cell-footer"><footer>f</footer></div>'), 'footer cell untouched');
  });

  test('finds the cell by its CLASS, not its tag — a <figure> stage works identically', () => {
    // The stage's ELEMENT is not fixed: masthead.transform.js builds it as a <figure>
    // when it holds a captioned graphic. A matcher pinned to `<div class="cell-stage">`
    // finds nothing on those slides and falls back to the flat section-level anchor —
    // a wrong answer that still renders, so no pixel or DOM-shape gate would see it.
    // `state-chart` is a live instance: it is NOT in EXCLUDED and its stage IS a figure.
    const body = '<ul><li>a</li></ul><blockquote><p>q</p></blockquote><p>note</p>';
    const asDiv = belowNote.applyToHtml(sec('cards-grid form', `<div class="cell-stage">${body}</div>`));
    const asFigure = belowNote.applyToHtml(sec('cards-grid form', `<figure class="cell-stage">${body}</figure>`));
    assert.equal(
      asFigure.replace(/figure/g, 'div'), asDiv,
      'the <figure> stage must be treated exactly as the <div> stage is',
    );
    assert.ok(asFigure.includes('<div class="below-note"><p>note</p></div></figure>'), asFigure);
  });

  test('finds a NAMED <figure> stage — the open tag carries more than the class', () => {
    // The figure stage carries an aria-label the div stage does not. A matcher that
    // required the tag to end right after `class="cell-stage"` found nothing on exactly
    // the slides the retag was for. Keying on the class is only half the lesson; the
    // other half is not pinning the rest of the opening tag.
    const body = '<ul><li>a</li></ul><p>note</p>';
    const out = belowNote.applyToHtml(
      sec('cards-grid form', `<figure class="cell-stage" aria-label="Source: Linear.">${body}</figure>`),
    );
    assert.ok(out.includes('<div class="below-note"><p>note</p></div></figure>'), out);
  });

  test('a trailing `/` does not close an HTML element — <div/> is an OPEN tag', () => {
    // HTML parsers honor self-closing only on void elements and foreign-content roots.
    // Treating `<div/>` as self-closing ended the cell one element early and left the
    // real trailing <p> outside it; an unbalanced scan must fall through untouched
    // rather than guess.
    // `<div/>` opens a level the single `</div>` then closes, so the stage never closes:
    // the scan finds no balanced cell and falls through to the section-level anchor —
    // byte-identical to what this did before the rewrite. The defect to avoid is the
    // OTHER answer, where honoring `/>` ends the cell early and silently returns a
    // narrower body than the parser would.
    const s = sec('cards-grid form', '<div class="cell-stage"><div class="x"/></div><p>after</p>');
    assert.ok(belowNote.applyToHtml(s).includes('<div class="below-note"><p>after</p></div>'),
      'falls through to the flat anchor rather than guessing a cell boundary');
    // …but a foreign-content root genuinely does self-close.
    const svg = belowNote.applyToHtml(
      sec('cards-grid form', '<figure class="cell-stage"><svg/><p>note</p></figure>'),
    );
    assert.ok(svg.includes('<p>note</p>'), 'the svg case still resolves');
  });

  test('balances the stage on the tag it actually opened with', () => {
    // The close scan used to be hardcoded to `</div>`. On a <figure> stage that walks
    // straight past the cell's own close and swallows following siblings.
    const out = belowNote.applyToHtml(
      sec(
        'state-chart form',
        '<figure class="cell-stage"><div class="chart-body"><div>x</div></div><p>note</p></figure>' +
          '<div class="cell-footer"><footer>f</footer></div>',
      ),
    );
    assert.ok(out.includes('<div class="below-note"><p>note</p></div></figure>'), out);
    assert.ok(out.includes('<div class="cell-footer"><footer>f</footer></div>'), 'footer cell untouched');
  });

  test('wraps the real trailing <p> when a <pre> sample merely mentions the literal cell-stage string', () => {
    // Regression: extractStage used to do a bare `indexOf('<div class="cell-
    // stage">')`, which matched this literal text INSIDE the <pre> sample —
    // a false "stage" whose balanced-close landed mid-sample, whose body
    // never matched STAGE_TRAILING_NOTE, so wrapTrailingNote returned `inner`
    // UNCHANGED instead of falling through to the real trailing <p> below.
    const html = sec(
      'list-checks',
      '<pre><code><div class="cell-stage">sample</div></code></pre>' +
        '<ul><li>a</li></ul><p>note</p>',
    );
    const out = belowNote.applyToHtml(html);
    assert.ok(out.includes('<div class="below-note"><p>note</p></div>'), out);
  });

  test('ignores a fake nested .cell-stage div and still wraps the real trailing <p>', () => {
    // Regression: a non-top-level <div class="cell-stage"> (nested inside
    // unrelated markup) used to be treated as the real masthead-lift stage,
    // hijacking extraction and leaving the section's true trailing <p> bare.
    const html = sec(
      'list-checks',
      '<div class="callout"><div class="cell-stage">nested, not top-level</div></div>' +
        '<ul><li>a</li></ul><p>note</p>',
    );
    const out = belowNote.applyToHtml(html);
    assert.ok(out.includes('<div class="below-note"><p>note</p></div>'), out);
  });

  test('does not wrap a math slide (chrome-exempt, no local below-note treatment)', () => {
    const html = sec('math theorem form', '<blockquote><p>Theorem.</p></blockquote><p>So x = 1.</p>');
    assert.equal(belowNote.applyToHtml(html), html);
  });

  test('is idempotent through a .cell-stage cell', () => {
    const once = belowNote.applyToHtml(
      sec('list form', '<div class="cell-stage"><ul><li>a</li></ul><p>n</p></div>'),
    );
    assert.equal(belowNote.applyToHtml(once), once);
  });

  test('reads each section class independently', () => {
    const out = belowNote.applyToHtml(
      sec('list-checks', '<ul><li>a</li></ul><p>kept</p>') +
      sec('content', '<ul><li>b</li></ul><p>untouched</p>'),
    );
    assert.equal(out.split(WRAP).length - 1, 1); // exactly one wrap
    assert.ok(out.includes('<p>untouched</p>'));
    assert.ok(!out.includes('below-note"><p>untouched'));
  });

  test('leaves nested split-panel sections intact (excluded outer, no inner wrap)', () => {
    const html = sec('split-panel', sec('panel', '<ul><li>a</li></ul><p>n</p>'));
    assert.equal(belowNote.applyToHtml(html), html);
  });

  test('is idempotent', () => {
    const once = belowNote.applyToHtml(sec('list-checks', '<ul><li>a</li></ul><p>n</p>'));
    assert.equal(belowNote.applyToHtml(once), once);
  });
});

describe('below-note — applyToDom (runtime path)', () => {
  const dom = (body) => new JSDOM(`<!DOCTYPE html><body>${body}</body>`).window.document;

  test('wraps a trailing <p> after a list, before the footer', () => {
    const doc = dom(sec('list-checks', '<ul><li>a</li></ul><p>note</p><footer>f</footer>'));
    adapter.applyToDom(doc);
    const wrap = doc.querySelector('section > .below-note');
    assert.ok(wrap, 'expected a .below-note wrapper');
    assert.equal(wrap.querySelector('p').textContent, 'note');
    assert.equal(wrap.nextElementSibling.tagName, 'FOOTER');
  });

  test('skips excluded sections and main-content paragraphs', () => {
    const doc = dom(
      sec('content', '<ul><li>a</li></ul><p>x</p>') +
      sec('statement', '<p>body</p><p>more</p>'),
    );
    adapter.applyToDom(doc);
    assert.equal(doc.querySelector('.below-note'), null);
  });

  test('is idempotent', () => {
    const doc = dom(sec('list-checks', '<ul><li>a</li></ul><p>n</p>'));
    adapter.applyToDom(doc);
    adapter.applyToDom(doc);
    assert.equal(doc.querySelectorAll('.below-note').length, 1);
  });

  test('finds the trailing <p> inside a masthead-lift .cell-stage cell (Form default)', () => {
    const doc = dom(
      sec(
        'cards-grid form',
        '<div class="cell-masthead"></div>' +
          '<div class="cell-stage"><ul><li>a</li></ul><p>note</p></div>' +
          '<div class="cell-footer"><footer>f</footer></div>',
      ),
    );
    adapter.applyToDom(doc);
    const wrap = doc.querySelector('.cell-stage > .below-note');
    assert.ok(wrap, 'expected a .below-note wrapper inside .cell-stage');
    assert.equal(wrap.querySelector('p').textContent, 'note');
    assert.equal(doc.querySelector('.cell-footer footer').textContent, 'f');
  });

  test('does not independently process a literal nested <section> in slide content', () => {
    // A hand-authored nested <section> whose OWN trailing <p> would qualify
    // for the wrap in isolation. applyToHtml's depth-aware walk only ever
    // visits TOP-LEVEL sections (a nested one is opaque content inside the
    // outer section's captured `inner`), so it never wraps here — the outer
    // section's own tail is the nested `</section>`, not a `<p>`. Before the
    // `section:not(section section)` scoping fix, applyToDom's unscoped
    // `querySelectorAll('section')` visited the inner section independently
    // and wrapped ITS trailing <p> — a real DOM-vs-HTML-string divergence.
    const doc = dom(sec('list', '<ul><li>a</li></ul>' + sec('list', '<ul><li>b</li></ul><p>inner note</p>')));
    adapter.applyToDom(doc);
    assert.equal(doc.querySelectorAll('.below-note').length, 0);
  });
});
