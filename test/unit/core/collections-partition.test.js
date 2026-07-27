/**
 * Unit: lib/core/collections.js partitionAxis — the split-move kernel.
 *
 * The discrete actuator of the Fit Ladder (engineering/decisions/2026-06-22-the-fit-
 * spine.md §3): given a slide's resolved HTML it partitions the primary collection
 * along an axis into groups of at most N, repeating the slide's structure (heading,
 * wrapper, table header) on each. The split-move sibling of countAxis — and the
 * pure kernel a build-time exporter will consume (HARD RULE 1: one implementation,
 * shared). Tri-state contract: [html] = fits / no-op · [..>1] = split · null =
 * not splittable (caller escalates).
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { partitionAxis, directChildren, firstList, countAxis } = require('../../../lib/core/collections');

describe('collections: partitionAxis', () => {
  test('item: splits a list into ceil(n/perSlide) slides, last group smaller', () => {
    const html = '<h2>T</h2><ul><li>A</li><li>B</li><li>C</li><li>D</li><li>E</li></ul>';
    const slides = partitionAxis(html, 'item', 2);
    assert.equal(slides.length, 3);
    assert.equal(slides[0], '<h2>T</h2><ul><li>A</li><li>B</li></ul>');
    assert.equal(slides[1], '<h2>T</h2><ul><li>C</li><li>D</li></ul>');
    assert.equal(slides[2], '<h2>T</h2><ul><li>E</li></ul>');
  });

  test('item: heading + intro + wrapper (pre) and trailing (post) repeat on every slide', () => {
    const html = '<h2>Steps</h2><p>lead</p><ul><li>A</li><li>B</li><li>C</li></ul><footer>fin</footer>';
    const slides = partitionAxis(html, 'item', 2);
    assert.equal(slides.length, 2);
    for (const s of slides) {
      assert.match(s, /^<h2>Steps<\/h2><p>lead<\/p><ul>/);
      assert.match(s, /<\/ul><footer>fin<\/footer>$/);
    }
  });

  test('item: <ol> keeps numbering continuous via start= on slides 2+', () => {
    const html = '<ol><li>A</li><li>B</li><li>C</li><li>D</li><li>E</li></ol>';
    const slides = partitionAxis(html, 'item', 2);
    assert.equal(slides[0], '<ol><li>A</li><li>B</li></ol>');           // no start on the first
    assert.equal(slides[1], '<ol start="3"><li>C</li><li>D</li></ol>'); // 3rd item overall
    assert.equal(slides[2], '<ol start="5"><li>E</li></ol>');           // 5th item overall
  });

  test('item: an existing start= on the <ol> is replaced, not duplicated', () => {
    const html = '<ol start="1"><li>A</li><li>B</li><li>C</li></ol>';
    const slides = partitionAxis(html, 'item', 2);
    assert.equal(slides[1], '<ol start="3"><li>C</li></ol>');
    assert.doesNotMatch(slides[1], /start="1"/);
  });

  test('item: splits on TOP-LEVEL <li> only — a nested list rides with its parent', () => {
    const html = '<ul><li>A<ul><li>a1</li><li>a2</li></ul></li><li>B</li><li>C</li></ul>';
    const slides = partitionAxis(html, 'item', 2);
    assert.equal(slides.length, 2);
    assert.equal(slides[0], '<ul><li>A<ul><li>a1</li><li>a2</li></ul></li><li>B</li></ul>');
    assert.equal(slides[1], '<ul><li>C</li></ul>');
  });

  test('item: a collection that already fits is a single no-op slide (NOT null)', () => {
    const html = '<ul><li>A</li><li>B</li></ul>';
    assert.deepEqual(partitionAxis(html, 'item', 2), [html]);
    assert.deepEqual(partitionAxis(html, 'item', 5), [html]);
  });

  test('item: absent collection → single no-op slide', () => {
    const html = '<h2>no list here</h2><p>prose</p>';
    assert.deepEqual(partitionAxis(html, 'item', 2), [html]);
  });

  test('row: splits tbody rows and REPEATS the <thead> header on every slide', () => {
    const html =
      '<table><thead><tr><th>H</th></tr></thead>' +
      '<tbody><tr><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr></tbody></table>';
    const slides = partitionAxis(html, 'row', 2);
    assert.equal(slides.length, 2);
    assert.equal(
      slides[0],
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>',
    );
    assert.equal(
      slides[1],
      '<table><thead><tr><th>H</th></tr></thead><tbody><tr><td>3</td></tr></tbody></table>',
    );
    for (const s of slides) assert.match(s, /<thead><tr><th>H<\/th><\/tr><\/thead>/);
  });

  test('row: a table that fits is a single no-op slide', () => {
    const html = '<table><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>';
    assert.deepEqual(partitionAxis(html, 'row', 4), [html]);
  });

  test('col / cell / line are NOT splittable → null (caller escalates)', () => {
    const table = '<table><tbody><tr><td>1</td><td>2</td><td>3</td></tr></tbody></table>';
    const code = '<pre><code>a\nb\nc\nd</code></pre>';
    assert.equal(partitionAxis(table, 'col', 1), null);
    assert.equal(partitionAxis(table, 'cell', 1), null);
    assert.equal(partitionAxis(code, 'line', 1), null);
  });

  test('invalid perSlide (0, negative, non-integer) → no-op single slide', () => {
    const html = '<ul><li>A</li><li>B</li><li>C</li></ul>';
    assert.deepEqual(partitionAxis(html, 'item', 0), [html]);
    assert.deepEqual(partitionAxis(html, 'item', -2), [html]);
    assert.deepEqual(partitionAxis(html, 'item', 1.5), [html]);
  });

  test('unknown axis → no-op single slide (not null — null means "can\'t split")', () => {
    const html = '<ul><li>A</li><li>B</li><li>C</li></ul>';
    assert.deepEqual(partitionAxis(html, 'banana', 1), [html]);
  });

  test('no content is lost: every original <li> appears across the split, in order', () => {
    const items = Array.from({ length: 7 }, (_, i) => `<li>item ${i + 1}</li>`).join('');
    const html = `<h2>T</h2><ul>${items}</ul>`;
    const slides = partitionAxis(html, 'item', 3);
    assert.equal(slides.length, 3); // 3 + 3 + 1
    const recombined = slides.flatMap((s) => {
      const { body } = firstList(s);
      return directChildren(body, 'li').map((sp) => body.slice(sp.start, sp.end));
    });
    assert.equal(recombined.length, 7);
    assert.deepEqual(recombined, Array.from({ length: 7 }, (_, i) => `<li>item ${i + 1}</li>`));
  });

  test('perSlide of 1 yields one member per slide', () => {
    const html = '<ul><li>A</li><li>B</li><li>C</li></ul>';
    const slides = partitionAxis(html, 'item', 1);
    assert.deepEqual(slides, ['<ul><li>A</li></ul>', '<ul><li>B</li></ul>', '<ul><li>C</li></ul>']);
  });

  test('whitespace between items is preserved exactly across the split (byte round-trip)', () => {
    const html = '<ul>\n  <li>A</li>\n  <li>B</li>\n  <li>C</li>\n</ul>';
    const slides = partitionAxis(html, 'item', 2);
    assert.equal(slides.length, 2);
    // Each slide's inner-list body, recombined in order, equals the original body
    // verbatim — no leading/seam/trailing whitespace dropped.
    const bodies = slides.map((s) => firstList(s).body).join('');
    assert.equal(bodies, firstList(html).body);
  });

  test('row: a table WITHOUT <thead> splits with the tbody wrapper repeated', () => {
    const html = '<table><tbody><tr><td>1</td></tr><tr><td>2</td></tr><tr><td>3</td></tr></tbody></table>';
    const slides = partitionAxis(html, 'row', 2);
    assert.equal(slides.length, 2);
    assert.equal(slides[0], '<table><tbody><tr><td>1</td></tr><tr><td>2</td></tr></tbody></table>');
    assert.equal(slides[1], '<table><tbody><tr><td>3</td></tr></tbody></table>');
    for (const s of slides) assert.doesNotMatch(s, /<thead/);
  });

  test('item: an <ol> carries its other attributes onto every split slide', () => {
    const html = '<ol class="numbered" id="main"><li>A</li><li>B</li><li>C</li></ol>';
    const slides = partitionAxis(html, 'item', 2);
    assert.equal(slides[0], '<ol class="numbered" id="main"><li>A</li><li>B</li></ol>');
    assert.equal(slides[1], '<ol class="numbered" id="main" start="3"><li>C</li></ol>');
  });

  test('item: with multiple top-level lists, only the FIRST splits (rest ride in post)', () => {
    const html = '<ul><li>A</li><li>B</li><li>C</li></ul><ul><li>X</li><li>Y</li></ul>';
    const slides = partitionAxis(html, 'item', 2);
    assert.equal(slides.length, 2);
    // The trailing second list is part of `post`, so it repeats whole on each slide.
    for (const s of slides) assert.match(s, /<ul><li>X<\/li><li>Y<\/li><\/ul>$/);
  });

  test('item: an empty list is a no-op single slide', () => {
    const html = '<ul></ul>';
    assert.deepEqual(partitionAxis(html, 'item', 1), [html]);
  });
});

describe('collections: firstList picks the PRIMARY collection, not the first one', () => {
  // Reproduced on a real render before it was fixed: an `inventory` slide with a two-item
  // bulleted aside above its six records split the ASIDE — one aside bullet per page, all six
  // records repeated verbatim on both, both pages clipped, under a "(cont.)" heading. §8 rule
  // 1's `deriveAxis` hardening cannot help: it resolves which AXIS is on the page, and both
  // lists are `item`. The container choice lives here. The rule-6 conservation gate is
  // structurally blind to it — containment reports shortfalls, never duplicates.
  const aside = '<ul><li>aside A</li><li>aside B</li></ul>';
  const register = '<ul><li>rec 1</li><li>rec 2</li><li>rec 3</li><li>rec 4</li></ul>';

  test('the bigger list is the collection, wherever it sits', () => {
    const html = `<h2>T</h2>${aside}${register}`;
    assert.equal(countAxis(html, 'item'), 4, 'capacity counted the aside before this');
    const slides = partitionAxis(html, 'item', 2);
    assert.equal(slides.length, 2);
    for (const s of slides) {
      assert.equal((s.match(/aside A/g) || []).length, 1, 'the aside is framing — it repeats, once per page');
      assert.equal((s.match(/aside B/g) || []).length, 1);
    }
    // …and every record appears exactly ONCE across the run, which is the whole point.
    const all = slides.join('');
    for (const rec of ['rec 1', 'rec 2', 'rec 3', 'rec 4']) {
      assert.equal((all.match(new RegExp(rec, 'g')) || []).length, 1, `${rec} must appear exactly once`);
    }
  });

  test('…and symmetrically when the big list comes FIRST (no positional preference at all)', () => {
    const html = `<h2>T</h2>${register}${aside}`;
    assert.equal(countAxis(html, 'item'), 4);
    const all = partitionAxis(html, 'item', 2).join('');
    for (const rec of ['rec 1', 'rec 4']) {
      assert.equal((all.match(new RegExp(rec, 'g')) || []).length, 1);
    }
  });

  test('a nested list is a member BODY, never a candidate collection', () => {
    // The card contract (`- Title` / `  - body`) nests a list inside every <li>. A nested list
    // with more entries than the outer one must not be mistaken for the slide's collection.
    const html = '<ul><li>A<ul><li>b1</li><li>b2</li><li>b3</li></ul></li><li>B<ul><li>b4</li></ul></li></ul>';
    assert.equal(countAxis(html, 'item'), 2, 'two outer members, not the three nested bullets');
  });

  test('ties go to the first, and a single-list slide is untouched', () => {
    const tie = '<ul><li>x1</li><li>x2</li></ul><ul><li>y1</li><li>y2</li></ul>';
    assert.match(firstList(tie).body, /x1/);
    const one = '<h2>T</h2><ul><li>only</li></ul>';
    assert.equal(firstList(one).body, '<li>only</li>');
  });
});
