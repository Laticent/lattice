const test = require('node:test');
const assert = require('node:assert/strict');
const { bakeSplits } = require('../../../lib/core/bake-splits.js');
const { splitSlides } = require('../../../lib/core/split-slides.js');
const { narrateChart } = require('../../../lib/core/chart-narration.js');

// Export ↔ Present chart-narration parity (#902 Gap 1). The export's
// writeCaptionsSidecar recovers per-authored-slide Markdown with EXACTLY this
// bake-then-split pipeline, then runs the SAME shared `narrateChart` Present's
// PresentOverlay runs on its own per-slide Markdown — so the two surfaces narrate a
// chart slide identically by construction. These pin the two pieces the end-to-end
// CLI render can't assert in a browser-free unit test:
//   1. the alignment split yields one block per authored slide (so projected[i] and
//      blocks[i] line up before substitution), and
//   2. each chart block narrates via `narrateChart` to the rich, computed-fact text —
//      the very text that used to live only in Present, never in the exported .vtt.

/** Mirror lattice-emulator.js's perSlideMarkdownBlocks: bake the live `split:
 *  headings` boundaries to literal `---`, drop front matter, split fence-aware. */
function perSlideMarkdownBlocks(source) {
  const baked = bakeSplits(source);
  const body = baked.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  return splitSlides(body);
}

// A `---`-separated chart deck (the explicit-separator case): each block is a slide.
const separatorDeck = [
  '---',
  'marp: true',
  'split: rule',
  '---',
  '',
  '# Title',
  '',
  'Intro.',
  '',
  '---',
  '',
  '<!-- _class: funnel -->',
  '',
  '## Where the flow drops off.',
  '',
  '- Visitors `12,000`',
  '- Signups `4,800`',
  '',
  '---',
  '',
  '<!-- _class: radar -->',
  '',
  '## How we stack up.',
  '',
  '- Lattice',
  '  - Performance `9`',
  '  - Pricing `7`',
].join('\n');

test('alignment split yields one block per authored slide (separator deck)', () => {
  const blocks = perSlideMarkdownBlocks(separatorDeck);
  assert.equal(blocks.length, 3);
});

test('each chart block narrates the computed-fact text via the shared narrateChart', () => {
  const blocks = perSlideMarkdownBlocks(separatorDeck);
  // Non-chart title slide: narrateChart defers (returns null) → projection/notes stand.
  assert.equal(narrateChart(blocks[0]), null);
  // Funnel: the conversion % that lives only in the render, now in the export.
  const funnel = narrateChart(blocks[1]);
  assert.ok(funnel.includes('Signups: four thousand eight hundred, forty percent of the prior stage.'));
  // Radar: the auto-fit scale an unlabeled axis is plotted against.
  const radar = narrateChart(blocks[2]);
  assert.ok(radar.includes('On a scale of zero to ten.'));
  assert.ok(radar.includes('Lattice: Performance, nine; Pricing, seven.'));
});

// A default `split: headings` deck with NO explicit `---` between slides — the export
// must still recover one block per rendered section (bakeSplits injects the boundaries
// the renderer splits on), else the count guard would stand chart narration down.
const headingsDeck = [
  '---',
  'marp: true',
  '---',
  '',
  '`Eyebrow`',
  '',
  '# Cover',
  '',
  'Lead.',
  '',
  '<!-- _class: funnel -->',
  '',
  '## Where the flow drops off.',
  '',
  '- Visitors `12,000`',
  '- Signups `4,800`',
].join('\n');

test('headings-mode deck (no explicit ---) splits into one block per slide', () => {
  const blocks = perSlideMarkdownBlocks(headingsDeck);
  assert.equal(blocks.length, 2);
  assert.equal(narrateChart(blocks[0]), null); // the cover
  assert.ok(narrateChart(blocks[1]).includes('forty percent of the prior stage'));
});
