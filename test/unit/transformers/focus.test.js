/**
 * Unit tests for the focus resolver transformer.
 *
 * Covers both the HTML-string kernel (applyToHtml, used by lattice-emulator via
 * lib/engine) and the DOM walk (applyToDom, used by lattice-runtime) — the two
 * must agree (HARD RULE 1). The contract: the ordinal target of `_focus:` (via
 * the `data-focus` attribute the directive apply step stamps) is tagged
 * `.lat-focus`, siblings `.lat-recede`; the section gets `data-focus-axis` and
 * the resolved `data-focus-style` (content-aware default, or explicit override).
 *
 * Design: engineering/decisions/2026-06-16-focus-highlighting.md.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const focus = require('../../../lib/transformers/focus');

describe('focus — grammar', () => {
  test('parses a single ordinal', () => {
    assert.deepEqual(focus.parseFocusSpec('row 4').map((g) => ({ axis: g.axis, i: [...g.indices] })),
      [{ axis: 'row', i: [4] }]);
  });
  test('parses a range and merges repeated axes', () => {
    assert.deepEqual(focus.parseFocusSpec('item 2-4, item 6').map((g) => ({ axis: g.axis, i: [...g.indices] })),
      [{ axis: 'item', i: [2, 3, 4, 6] }]);
  });
  test('ignores malformed tokens without throwing', () => {
    assert.deepEqual(focus.parseFocusSpec('row banana').map((g) => [...g.indices]), [[]]);
  });
});

describe('focus — HTML kernel (applyToHtml)', () => {
  const TABLE = '<section data-focus="row 2" class="compare-table"><table><thead><tr><th>A</th></tr></thead><tbody>\n<tr><td>r1</td></tr>\n<tr><td>r2</td></tr>\n<tr><td>r3</td></tr>\n</tbody></table></section>';
  const GRID = '<section data-focus="item 2" class="cards-grid"><h2>x</h2><ul>\n<li>One<ul><li>b1</li></ul></li>\n<li>Two<ul><li>b2</li></ul></li>\n<li>Three</li>\n</ul></section>';

  test('tags the Nth table row .lat-focus, siblings .lat-recede; thead untouched', () => {
    const out = focus.applyToHtml(TABLE);
    assert.match(out, /<tr class="lat-recede"><td>r1/);
    assert.match(out, /<tr class="lat-focus"><td>r2/);
    assert.match(out, /<tr class="lat-recede"><td>r3/);
    assert.match(out, /<thead><tr><th>A/); // header never tagged
  });

  test('table axis resolves to the ring default + stamps axis/resolved', () => {
    const out = focus.applyToHtml(TABLE);
    assert.match(out, /data-focus-axis="row"/);
    assert.match(out, /data-focus-style="ring"/);
    assert.match(out, /data-focus-resolved/);
  });

  test('counts only top-level <li> (nested description list is not a sibling)', () => {
    const out = focus.applyToHtml(GRID);
    assert.match(out, /<li class="lat-recede">One/);
    assert.match(out, /<li class="lat-focus">Two/);
    assert.match(out, /<li class="lat-recede">Three/);
    assert.match(out, /data-focus-style="spotlight"/); // item axis → spotlight default
  });

  test('an explicit _focusStyle overrides the content-aware default', () => {
    const out = focus.applyToHtml(GRID.replace('data-focus="item 2"', 'data-focus="item 2" data-focus-style="ring"'));
    assert.match(out, /data-focus-style="ring"/);
  });

  test('idempotent — a resolved section is left alone on a second pass', () => {
    const once = focus.applyToHtml(TABLE);
    assert.equal(focus.applyToHtml(once), once);
  });

  test('no data-focus → unchanged', () => {
    const plain = '<section class="list"><ul><li>a</li><li>b</li></ul></section>';
    assert.equal(focus.applyToHtml(plain), plain);
  });

  test('col axis tags the Nth cell of every row (header + body), ring default', () => {
    const out = focus.applyToHtml('<section data-focus="col 2" class="compare-table"><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table></section>');
    assert.match(out, /<th class="lat-recede">A.*<th class="lat-focus">B/s);
    assert.match(out, /<td class="lat-recede">1.*<td class="lat-focus">2/s);
    assert.match(out, /data-focus-axis="col"/);
    assert.match(out, /data-focus-style="ring"/);
  });

  test('cell axis tags exactly one body cell at R,C', () => {
    const out = focus.applyToHtml('<section data-focus="cell 2,3" class="compare-table"><table><tbody><tr><td>1</td><td>2</td><td>3</td></tr><tr><td>4</td><td>5</td><td>6</td></tr></tbody></table></section>');
    assert.equal((out.match(/lat-focus/g) || []).length, 1);
    assert.match(out, /<td class="lat-focus">6/);
    assert.match(out, /data-focus-axis="cell"/);
  });

  test('line axis wraps code lines and tags the range; hljs spans survive', () => {
    const out = focus.applyToHtml('<section data-focus="line 2-3" class="code"><pre><code class="language-js"><span class="hljs-keyword">import</span> x;\nconst a=1;\nconst b=2;\nconst c=3;</code></pre></section>');
    assert.match(out, /<span class="ln lat-recede"><span class="hljs-keyword">import<\/span> x;<\/span>/);
    assert.match(out, /<span class="ln lat-focus">const a=1;<\/span>/);
    assert.match(out, /<span class="ln lat-focus">const b=2;<\/span>/);
    assert.match(out, /<span class="ln lat-recede">const c=3;<\/span>/);
    assert.match(out, /data-focus-axis="line"/);
    assert.match(out, /data-focus-style="spotlight"/);
  });

  test('splitCodeLines keeps a newline inside an hljs span on one line', () => {
    const lines = focus.splitCodeLines('<span class="hljs-string">"a\nb"</span>\nnext');
    assert.equal(lines.length, 2);
    assert.match(lines[0], /"a\nb"/);
  });
});

describe('focus — DOM kernel (applyToDom) agrees with the HTML kernel', () => {
  test('tags rows and stamps attrs on the live DOM', () => {
    const dom = new JSDOM('<section data-focus="row 2" class="compare-table"><table><tbody><tr><td>r1</td></tr><tr><td>r2</td></tr><tr><td>r3</td></tr></tbody></table></section>');
    focus.applyToDom(dom.window.document.body);
    const sec = dom.window.document.querySelector('section');
    const rows = [...dom.window.document.querySelectorAll('tbody tr')];
    assert.equal(rows[0].className, 'lat-recede');
    assert.equal(rows[1].className, 'lat-focus');
    assert.equal(rows[2].className, 'lat-recede');
    assert.equal(sec.getAttribute('data-focus-axis'), 'row');
    assert.equal(sec.getAttribute('data-focus-style'), 'ring');
  });

  test('tags grid items (top-level li only) and applies spotlight default', () => {
    const dom = new JSDOM('<section data-focus="item 3" class="cards-grid"><ul><li>One<ul><li>b</li></ul></li><li>Two</li><li>Three</li></ul></section>');
    focus.applyToDom(dom.window.document.body);
    const items = [...dom.window.document.querySelectorAll(':scope > ul > li, section > ul > li')]
      .filter((li) => li.parentElement.parentElement.tagName === 'SECTION');
    assert.equal(items[2].classList.contains('lat-focus'), true);
    assert.equal(dom.window.document.querySelector('section').getAttribute('data-focus-style'), 'spotlight');
  });

  // Form-migration audit (2026-07-09): masthead-lift wraps a Form slide's body
  // into `.cell-stage` for STAGE_MIGRATED layouts (the common case, since Form
  // has been default since 2026-06-26); the strict `:scope > ul` selector
  // silently found nothing once the list moved one level deeper, so `_focus:
  // item N` no-op'd on the runtime/DOM path while working fine on the export.
  test('tags items when the list is wrapped in .cell-stage (masthead-lift, Form default)', () => {
    const dom = new JSDOM(
      '<section data-focus="item 2" class="content form"><div class="cell-stage"><ul><li>One</li><li>Two</li><li>Three</li></ul></div></section>',
    );
    focus.applyToDom(dom.window.document.body);
    const items = [...dom.window.document.querySelectorAll('.cell-stage > ul > li')];
    assert.deepEqual(items.map((li) => li.className), ['lat-recede', 'lat-focus', 'lat-recede']);
    assert.equal(dom.window.document.querySelector('section').getAttribute('data-focus-axis'), 'item');
  });
});
