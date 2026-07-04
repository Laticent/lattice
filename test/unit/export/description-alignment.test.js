/**
 * Regression: PPTX/HTML accessibility descriptions must be index-locked to the
 * RENDERED slides, never re-derived from a source split.
 *
 * The bug this guards: a Studio export once built its per-slide description array
 * from `splitSlides(source)`. `splitSlides` treats the closing `---` of YAML
 * front matter as a slide separator, so on any real deck (front matter is
 * near-universal) it emits a phantom leading chunk — every description then shifts
 * onto the WRONG slide (slide 1 loses its alt, slide 2 gets slide 1's, …). "A
 * wrong alt is worse than none," so this is an accessibility correctness bug.
 *
 * The fix, verified here: descriptions come from the engine-rendered `<section>`s
 * — the SAME units the exporters rasterize — via notesCore.extractSlideDescriptions.
 * Front matter is consumed by the engine's directive layer and never becomes a
 * section, so the rendered basis has no phantom and stays 1:1 with the slides.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { render } = require('../../../lib/engine');
const notesCore = require('../../../lib/authoring/notes-core');

// Depth-counted scan over <section>…</section>, so a nested split-panel section
// stays inside its parent — the same "one <section> string per slide" shape the
// emulator + browser exporters consume (lattice-emulator.js engineSlides()).
function sectionsOf(html) {
  const re = /<section\b[^>]*>|<\/section>/gi;
  const out = [];
  let depth = 0;
  let start = -1;
  let m;
  while ((m = re.exec(html))) {
    if (m[0][1] !== '/') {
      if (depth === 0) start = m.index;
      depth++;
    } else if (depth > 0) {
      depth--;
      if (depth === 0) out.push(html.slice(start, re.lastIndex));
    }
  }
  return out;
}

describe('description alignment (front-matter phantom regression)', () => {
  test('a front-matter deck maps each describe to its own rendered slide (no phantom shift)', () => {
    const src = [
      '---',
      'theme: indaco',
      'paginate: true',
      '---',
      '',
      '# Slide one',
      '',
      '<!-- describe: The first slide. -->',
      '',
      '---',
      '',
      '# Slide two',
      '',
      '<!-- describe: The second slide. -->',
      '',
      '---',
      '',
      '# Slide three',
      '',
      '<!-- describe: The third slide. -->',
      '',
    ].join('\n');

    const out = render(src, { theme: 'indaco' });
    const html = typeof out === 'string' ? out : out.html;
    const slides = sectionsOf(html);

    // Front matter is consumed, not rendered — exactly three sections, no phantom.
    assert.equal(slides.length, 3, `expected 3 rendered sections, got ${slides.length}`);

    // Each description lands on its own slide, in order — the property the old
    // splitSlides(source) basis violated.
    assert.deepEqual(notesCore.extractSlideDescriptions(slides), [
      'The first slide.',
      'The second slide.',
      'The third slide.',
    ]);
  });
});
