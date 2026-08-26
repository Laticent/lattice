/**
 * Unit tests for the tracked-changes transformer.
 *
 * The contract: every `<ins>` / `<del>` gets a visually-hidden edge span either
 * side of it, so a listener hears where an amendment's old wording stops and its
 * new wording starts. `<s>` joins them ONLY inside redline, which is the one
 * component that documents `~~text~~` as a tracked deletion.
 *
 * Both forms are covered, because they are two implementations of one rule and
 * that is exactly how they drift: the HTML-string kernel (lib/engine — the CLI /
 * PDF path and the browser playground) and the DOM walk (lattice-runtime.js —
 * the marp-vscode preview).
 *
 * THE ASSERTION THAT IS REALLY ABOUT SOMETHING ELSE: `the edge span carries no
 * padding or background`. The first implementation of this feature was four
 * lines of CSS on `::before`/`::after`, and it shipped a visible colored sliver
 * on every `<ins>` that wrapped — an empty inline fragment painting the wash
 * across the element's horizontal padding. A sibling span avoids it only for as
 * long as the span stays free of anything that paints. See the transformer's
 * header for the measurements.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const tc = require('../../../lib/transformers/tracked-changes');

const section = (cls, inner) => `<section class="${cls}">${inner}</section>`;
const dom = (html) => new JSDOM(`<body>${html}</body>`).window.document.body;

describe('tracked-changes — HTML kernel', () => {
  test('brackets a <del> with a start and an end label', () => {
    const out = tc.applyToHtml(section('redline', '<p>A <del>old</del> B</p>'));
    assert.match(out, /<span class="lat-change-edge"> \[deletion start\] <\/span><del>old<\/del><span class="lat-change-edge"> \[deletion end\] <\/span>/);
  });

  test('brackets an <ins> with insertion labels, not deletion ones', () => {
    const out = tc.applyToHtml(section('redline', '<p>A <ins>new</ins> B</p>'));
    assert.match(out, /\[insertion start\][\s\S]*<ins>new<\/ins>[\s\S]*\[insertion end\]/);
    assert.doesNotMatch(out, /deletion/);
  });

  test('the element itself is untouched — attributes and text survive verbatim', () => {
    const out = tc.applyToHtml(section('redline', '<p><del data-note="x" class="y">old &amp; gone</del></p>'));
    assert.ok(out.includes('<del data-note="x" class="y">old &amp; gone</del>'), out);
  });

  test('ins/del are labeled on ANY component, not just redline', () => {
    const out = tc.applyToHtml(section('content', '<p>Rate rose to <ins>4.2%</ins>.</p>'));
    assert.match(out, /\[insertion start\]/);
  });

  test('<s> is a deletion inside redline', () => {
    const out = tc.applyToHtml(section('redline', '<p>A <s>struck</s> B</p>'));
    assert.match(out, /\[deletion start\] <\/span><s>struck<\/s>/);
  });

  test('<s> is LEFT ALONE outside redline — it means "no longer accurate", not "deleted"', () => {
    const out = tc.applyToHtml(section('content', '<p>A <s>struck</s> B</p>'));
    assert.equal(out, section('content', '<p>A <s>struck</s> B</p>'));
  });

  test('two changes in one sentence each get their own pair', () => {
    const out = tc.applyToHtml(section('redline', '<p><del>a</del> and <ins>b</ins></p>'));
    assert.equal((out.match(/lat-change-edge/g) || []).length, 4);
  });

  test('a second pass changes nothing', () => {
    const once = tc.applyToHtml(section('redline', '<p>A <del>old</del> <ins>new</ins> B</p>'));
    assert.equal(tc.applyToHtml(once), once);
  });

  test('markup with no tracked change is returned byte-identical', () => {
    const html = section('content', '<p>Nothing to see.</p><table><tr><td>x</td></tr></table>');
    assert.equal(tc.applyToHtml(html), html);
  });

  test('non-string input passes straight through', () => {
    assert.equal(tc.applyToHtml(null), null);
    assert.equal(tc.applyToHtml(undefined), undefined);
  });
});

describe('tracked-changes — DOM walk', () => {
  test('inserts both edges as real siblings, outside the element', () => {
    const root = dom(section('redline', '<p>A <del>old</del> B</p>'));
    tc.applyToDom(root);
    const del = root.querySelector('del');
    assert.equal(del.previousSibling.className, 'lat-change-edge');
    assert.equal(del.nextSibling.className, 'lat-change-edge');
    assert.equal(del.childNodes.length, 1, 'the element itself gains no children');
  });

  test('the label text matches the string kernel word for word', () => {
    const root = dom(section('redline', '<p><ins>new</ins></p>'));
    tc.applyToDom(root);
    const ins = root.querySelector('ins');
    assert.equal(ins.previousSibling.textContent, ' [insertion start] ');
    assert.equal(ins.nextSibling.textContent, ' [insertion end] ');
  });

  test('<s> is a deletion inside redline and untouched outside it', () => {
    const root = dom(section('redline', '<p><s>a</s></p>') + section('content', '<p><s>b</s></p>'));
    tc.applyToDom(root);
    const [inRedline, outside] = [...root.querySelectorAll('s')];
    assert.equal(inRedline.previousSibling?.className, 'lat-change-edge');
    assert.equal(outside.previousSibling?.className, undefined);
  });

  test('a second pass inserts nothing further', () => {
    const root = dom(section('redline', '<p>A <del>old</del> <ins>new</ins> B</p>'));
    tc.applyToDom(root);
    const after = root.innerHTML;
    tc.applyToDom(root);
    assert.equal(root.innerHTML, after);
  });

  test('label text is set as TEXT, so a payload cannot become markup', () => {
    // The labels are literals, but the node is built with textContent rather
    // than innerHTML so the shape a future reader copies is the safe one.
    const root = dom(section('redline', '<p><del>&lt;img src=x onerror=1&gt;</del></p>'));
    tc.applyToDom(root);
    assert.equal(root.querySelectorAll('img').length, 0);
  });

  test('a document with no tracked change is left alone', () => {
    const root = dom(section('content', '<p>Nothing.</p>'));
    const before = root.innerHTML;
    tc.applyToDom(root);
    assert.equal(root.innerHTML, before);
  });
});

describe('tracked-changes — the two forms agree', () => {
  for (const markup of [
    '<p>A <del>old</del> <ins>new</ins> B</p>',
    '<p><ins>lead</ins> then <del>gone</del></p>',
    '<p>Nested <del>a <em>b</em> c</del> end</p>',
  ]) {
    test(`same edges for: ${markup.slice(0, 42)}`, () => {
      const viaString = tc.applyToHtml(section('redline', markup));
      const root = dom(section('redline', markup));
      tc.applyToDom(root);
      const edges = (h) => (h.match(/lat-change-edge">([^<]*)</g) || []).join('|');
      assert.equal(edges(root.innerHTML), edges(viaString));
    });
  }
});

describe('tracked-changes — the edge span must never paint', () => {
  test('base.elements.css hides it out of flow, clipped, with no ink of its own', () => {
    const css = require('node:fs').readFileSync(
      require('node:path').join(__dirname, '../../../lib/base/base.elements.css'), 'utf8');
    const rule = css.slice(css.indexOf('.lat-change-edge'));
    const block = rule.slice(rule.indexOf('{'), rule.indexOf('}') + 1);
    assert.match(block, /position:\s*absolute/);
    assert.match(block, /clip-path:\s*inset\(50%\)/);
    assert.match(block, /overflow:\s*hidden/);
    // The whole point of a sibling over a pseudo-element: nothing to paint.
    assert.doesNotMatch(block, /background|padding|border(?!-)|margin/);
  });
});
