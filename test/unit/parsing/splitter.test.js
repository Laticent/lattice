/**
 * Unit: lib/split-slides.js — fence-aware Marp slide splitter.
 *
 * The splitter is the foundation of every render path's correctness:
 * if it counts wrong, every downstream step (per-slide HTML, paginate
 * counters, expected-page-count fixtures) drifts. The semantic-invariant
 * suite pins expected page counts in the integration tier; this unit tier
 * pins the edge cases that integration can't easily reach.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { splitSlides } = require('../../../lib/core/split-slides');

describe('splitter', () => {
  test('empty input → empty array', () => {
    assert.deepEqual(splitSlides(''), []);
  });

  test('whitespace-only input → empty array', () => {
    assert.deepEqual(splitSlides('   \n\n   \n'), []);
  });

  test('single slide, no separators', () => {
    const slides = splitSlides('# Hello\n\nbody text');
    assert.equal(slides.length, 1);
    assert.match(slides[0], /^# Hello/);
  });

  test('two slides separated by ---', () => {
    const slides = splitSlides('# A\n\nbody\n\n---\n\n# B\n\nmore');
    assert.equal(slides.length, 2);
    assert.match(slides[0], /^# A/);
    assert.match(slides[1], /^# B/);
  });

  test('trailing --- does not produce empty slide', () => {
    const slides = splitSlides('# A\n\n---\n');
    assert.equal(slides.length, 1);
  });

  test('leading --- (after stripped front matter) is ignored', () => {
    // Caller strips front matter before invoking. A leading `---` on a
    // body that starts blank should not produce a phantom slide.
    const slides = splitSlides('\n---\n\n# A\n');
    assert.equal(slides.length, 1);
  });

  test('--- inside ``` fence is NOT a slide boundary', () => {
    const md = [
      '# A',
      '',
      '```markdown',
      '---',
      'theme: indaco',
      '---',
      '',
      '## Inner heading',
      '```',
      '',
      '---',
      '',
      '# B',
    ].join('\n');
    const slides = splitSlides(md);
    assert.equal(slides.length, 2, `expected 2 slides; got ${slides.length}`);
    assert.match(slides[0], /Inner heading/, 'fenced sample should belong to first slide');
    assert.match(slides[1], /^# B/);
  });

  test('--- inside ~~~ fence is NOT a slide boundary', () => {
    const md = [
      '# A',
      '',
      '~~~markdown',
      '---',
      '~~~',
      '',
      '---',
      '',
      '# B',
    ].join('\n');
    const slides = splitSlides(md);
    assert.equal(slides.length, 2);
  });

  test('nested fence with longer closer (4 backticks) is respected', () => {
    // markdown-it allows nested fences when outer uses 4+ backticks and
    // inner uses 3. Our simple tracker treats any fence opener of N≥3 as
    // open; close requires same char length≥N. So the outer 4-backtick
    // fence stays open across the inner 3-backtick block.
    const md = [
      '# A',
      '',
      '````markdown',
      '```',
      '---',
      '```',
      '````',
      '',
      '---',
      '',
      '# B',
    ].join('\n');
    const slides = splitSlides(md);
    assert.equal(slides.length, 2);
  });

  test('headingDivider:2 splits on h2 outside fences', () => {
    const md = [
      '## First',
      'body',
      '',
      '## Second',
      'more',
      '',
      '## Third',
      'last',
    ].join('\n');
    const slides = splitSlides(md, 2);
    assert.equal(slides.length, 3);
    assert.match(slides[0], /First/);
    assert.match(slides[1], /Second/);
    assert.match(slides[2], /Third/);
  });

  test('headingDivider:2 does NOT split on h2 inside a fence', () => {
    const md = [
      '## First',
      '',
      '```markdown',
      '## not a slide break',
      '```',
      '',
      '## Second',
    ].join('\n');
    const slides = splitSlides(md, 2);
    assert.equal(slides.length, 2);
    assert.match(slides[0], /not a slide break/);
  });

  test('headingDivider:1 splits on h1 only, not h2', () => {
    const md = [
      '# First',
      '## subheading',
      '',
      '# Second',
    ].join('\n');
    const slides = splitSlides(md, 1);
    assert.equal(slides.length, 2);
    assert.match(slides[0], /subheading/, 'h2 should stay with its h1');
  });

  test('headingDivider:3 splits on h1, h2, AND h3', () => {
    const md = [
      '# H1',
      '',
      '## H2',
      '',
      '### H3',
      '',
      '#### H4 stays here',
    ].join('\n');
    const slides = splitSlides(md, 3);
    assert.equal(slides.length, 3);
    assert.match(slides[2], /H3[\s\S]*H4 stays here/);
  });

  test('headingDivider with no leading content does not produce empty slide', () => {
    const md = [
      '## First',
      'body',
      '',
      '## Second',
    ].join('\n');
    const slides = splitSlides(md, 2);
    assert.equal(slides.length, 2);
    assert.match(slides[0], /^## First/);
  });

  test('--- with trailing whitespace still splits', () => {
    const slides = splitSlides('# A\n---   \n# B');
    assert.equal(slides.length, 2);
  });

  test('--- with leading whitespace does NOT split (Marp requires column 0)', () => {
    const slides = splitSlides('# A\n  ---\n# B');
    assert.equal(slides.length, 1, 'indented --- is not a slide boundary');
  });
});
