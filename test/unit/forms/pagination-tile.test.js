/**
 * Unit: the self-contained pagination Tile kernel
 * (lib/forms/tile/pagination/pagination.transform.js).
 *
 * The Tile is what makes the page number ONE mark (#2206). Before it, the mark
 * a slide got was decided by its frame's `kind` and was invisible to the author:
 * a real `<span class="lat-pagination">` inside the footer Cell on `minimal` /
 * `standard`, the `section::after` PSEUDO on the other nine frames. This suite
 * pins the kernel's contract and the PARITY of its two adapters — the same
 * consolidation the meta / progress / watermark Tiles use (issue #356), so
 * "three paths must agree" (HARD RULE #1) is one implementation rather than
 * three hand-copied edits.
 *
 * The CSS half of the fix is pinned here too, and deliberately: the retirement
 * rule's SELECTOR SHAPE is load-bearing in two ways that no rendering test would
 * attribute correctly if it broke, and both were got wrong on the way in.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const pag = require('../../../lib/forms/tile/pagination/pagination.transform');

const ROOT = path.join(__dirname, '..', '..', '..');
const sec = (attrs, inner = '') => `<section ${attrs}>${inner}</section>`;
const paginated = (n, cls, inner = '') =>
  sec(`class="${cls}" data-lattice-slide="${n}" data-lattice-pagination="${n}"`, inner);
const doc = (html) => new JSDOM(`<!DOCTYPE html><body>${html}</body>`).window.document;
const spansHtml = (html) => [...html.matchAll(/<span class="lat-pagination">([^<]*)<\/span>/g)].map((m) => m[1]);
const spansDom = (d) => [...d.querySelectorAll('.lat-pagination')].map((n) => n.textContent);

describe('pagination Tile — applyToHtml (HTML-string path)', () => {
  test('mints the real element on a SOVEREIGN frame, seeded from the section attribute', () => {
    const html = paginated(3, 'premise');
    const out = pag.applyToHtml(html);
    assert.deepEqual(spansHtml(out), ['3']);
    // A DIRECT child of the section — the span is absolutely positioned against the
    // section's padding box, so a deeper home would resolve against the wrong element.
    assert.ok(out.endsWith('<span class="lat-pagination">3</span></section>'));
  });

  test('no-op where a footer Cell already holds the real element', () => {
    const html = paginated(4, 'content form', '<div class="cell-footer"><span class="lat-pagination">4</span></div>');
    assert.deepEqual(spansHtml(pag.applyToHtml(html)), ['4']);
  });

  test('an UNPAGINATED section gets nothing', () => {
    const html = sec('class="premise" data-lattice-slide="2"', '<h2>x</h2>');
    assert.equal(pag.applyToHtml(html), html);
  });

  test('idempotent — a second pass adds no second mark', () => {
    const once = pag.applyToHtml(paginated(7, 'split-panel'));
    assert.equal(pag.applyToHtml(once), once);
  });

  test('a deck of mixed frame kinds gets exactly one mark per paginated slide', () => {
    const html = [
      paginated(1, 'title silent spectrum'),
      paginated(2, 'content form', '<div class="cell-footer"><span class="lat-pagination">2</span></div>'),
      paginated(3, 'premise'),
      sec('class="content form" data-lattice-slide="4"'),
    ].join('');
    assert.deepEqual(spansHtml(pag.applyToHtml(html)), ['1', '2', '3']);
  });

  test('a split run\'s hierarchical number rides through verbatim (repaginate writes 2.3, not 2)', () => {
    // auto-split's `repaginate` rewrites the ATTRIBUTE before this Tile is re-run on a
    // re-render, so the seed has to be whatever the attribute says — never a counter of
    // its own. A counter would renumber a run's pages back to sequential and undo the
    // hierarchical numbering the split exists to preserve.
    const html = sec('class="premise" data-lattice-pagination="2.3"');
    assert.deepEqual(spansHtml(pag.applyToHtml(html)), ['2.3']);
  });

  test('a document with no paginated slide is returned untouched (fast path)', () => {
    const html = sec('class="premise"', '<h2>x</h2>');
    assert.equal(pag.applyToHtml(html), html);
  });
});

describe('pagination Tile — applyToDom (live-DOM path)', () => {
  test('parity with applyToHtml on a mixed deck', () => {
    const html = [
      paginated(1, 'title'),
      paginated(2, 'content form', '<div class="cell-footer"><span class="lat-pagination">2</span></div>'),
      paginated(3, 'premise'),
    ].join('');
    const d = doc(html);
    pag.applyToDom(d);
    assert.deepEqual(spansDom(d).sort(), spansHtml(pag.applyToHtml(html)).sort());
  });

  test('idempotent', () => {
    const d = doc(paginated(5, 'scene'));
    pag.applyToDom(d);
    pag.applyToDom(d);
    assert.deepEqual(spansDom(d), ['5']);
  });

  test('the DOM adapter also lands the span as a DIRECT child', () => {
    const d = doc(paginated(6, 'premise', '<div class="cell-stage">body</div>'));
    pag.applyToDom(d);
    const span = d.querySelector('.lat-pagination');
    assert.equal(span.parentElement.tagName, 'SECTION');
  });
});

describe('the two marks read the SAME --pagination-inset default', () => {
  // The pagination-right Cell owns the page number's POSITION (design/forms.md 7.3), and
  // since #2206 two rules read its token: `section.form::after` in the Cell's own file
  // (what the Marp path still draws) and `section > .lat-pagination` in the Tile's
  // (what every Lattice render draws). Both spell the same fallback. Nothing made them
  // stay equal, and a drift would move the mark on ONE path only — the cross-path split
  // HARD RULE #1 exists to stop, and the hardest kind to notice because each path looks
  // internally consistent. Compared as TEXT because that is the only thing a CSS file
  // offers; if the fallback is ever extracted into a shared token this arm should follow
  // it rather than be deleted.
  const inset = (file) => {
    const css = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const m = css.match(/inset:\s*var\(--pagination-inset,\s*([^)]*\)?[^;]*)\);/);
    return m ? m[1].replace(/\s+/g, ' ').trim() : null;
  };

  test('the Cell\'s pseudo rule and the Tile\'s element rule agree', () => {
    const cell = inset('lib/forms/cell/pagination-right/pagination-right.css');
    const tile = inset('lib/forms/tile/pagination/pagination.css');
    assert.ok(cell, 'no --pagination-inset default found in the pagination-right Cell');
    assert.ok(tile, 'no --pagination-inset default found in the pagination Tile');
    assert.equal(tile, cell, 'the two marks would sit in different places on different paths');
  });
});

describe('the retirement rule\'s SELECTOR SHAPE (lib/forms/cell/stage/stage.css)', () => {
  const stageCss = fs.readFileSync(path.join(ROOT, 'lib/forms/cell/stage/stage.css'), 'utf8');
  // The two arms, as committed. Matched on the selector text rather than on a render,
  // because a render can only report that the pseudo came back — it cannot say which of
  // these two properties was lost, and they fail in different places.
  const arms = stageCss
    .split('\n')
    .filter((l) => /^section\[data-lattice-pagination\].*::after/.test(l.trim()));

  test('both arms are present', () => {
    assert.equal(arms.length, 2, 'expected the direct-child and footer-Cell arms');
  });

  test('each arm carries a CHILD COMBINATOR inside :has(), so packTheme cannot mask it', () => {
    // lib/engine/css.js mirrors Marpit's pagination plugin: on a SLIDE-OWN
    // `section…::after` rule it comments out every `content` declaration that is not
    // `attr(data-lattice-pagination)`. The test is the selector SHAPE — no whitespace and
    // no combinator — so `section:has(.lat-pagination)::after` (the descendant form) is a
    // target and its `content: none` would be deleted on the packed path the Playground,
    // the Studio and lib/runtime load. `> ` is what keeps it out of reach; it is the same
    // trap that leaves `section.silent.silent::after { content: none }` inert there.
    const { isPaginationTarget } = require('../../../lib/engine/css');
    for (const arm of arms) {
      const sel = arm.replace(/\s*\{.*$/, '').replace(/,$/, '').trim();
      assert.ok(/:has\(>\s/.test(sel), `arm must use the child combinator inside :has(): ${sel}`);
      assert.equal(isPaginationTarget(sel), false, `packTheme would mask this arm: ${sel}`);
    }
  });

  test('each arm carries a SECOND class-level term, so it outranks the engine scaffold', () => {
    // `:has()` takes the specificity of its most specific argument, so a bare
    // `section:has(> .lat-pagination)::after` is (0,1,2) — which LOSES to the scaffold's
    // `article.lattice > section::after { content: attr(…) }` at (0,1,3). Written that
    // way, the pseudo kept painting UNDERNEATH the new element: two numerals overprinted
    // in one corner on all seven sovereign slides of bloom-engineering-journey. The
    // `[data-lattice-pagination]` term is what carries each arm to (0,2,2).
    for (const arm of arms) {
      assert.ok(arm.includes('section[data-lattice-pagination]'),
        `arm must carry the attribute term for specificity: ${arm}`);
    }
  });
});
