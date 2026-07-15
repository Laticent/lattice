const test = require('node:test');
const assert = require('node:assert/strict');
const { splitSourceToSections } = require('../../../lib/core/section-source-split.js');
const { narrateChart } = require('../../../lib/core/chart-narration.js');
const latticeEngine = require('../../../lib/engine');

// Export ↔ Present chart-narration parity + alignment (#902 Gap 1). The export's
// writeCaptionsSidecar recovers per-rendered-section Markdown with `splitSourceToSections`,
// then runs the SAME shared `narrateChart` Present's PresentOverlay runs on its own
// per-slide Markdown. These pin the two guarantees a browser-free unit test can assert:
//   1. ALIGNMENT — the recovered blocks line up 1:1 with the engine's rendered
//      `<section>` split, so a chart's computed narration substitutes onto the RIGHT
//      slide (not a parallel line-splitter that drifts on ***/setext/empty sections —
//      a reproduced red-team misalignment this replaces), and
//   2. ENRICHMENT — each chart block narrates via `narrateChart` to the rich,
//      computed-fact text that used to live only in Present, never in the exported .vtt.

/** Render the deck the way the export does and count its `<section>` elements — the
 *  index basis the caption projection (and thus the substitution) uses. */
function engineSectionCount(source) {
  const engine = latticeEngine.createEngine({ mathOutput: 'html' });
  const { html } = engine.render(source, 'indaco');
  return (html.match(/<section\b/g) || []).length;
}

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

test('recovered blocks align 1:1 with the engine sections (separator deck)', () => {
  const blocks = splitSourceToSections(separatorDeck);
  assert.equal(blocks.length, engineSectionCount(separatorDeck));
  assert.equal(blocks.length, 3);
});

test('each chart block narrates the computed-fact text via the shared narrateChart', () => {
  const blocks = splitSourceToSections(separatorDeck);
  assert.equal(narrateChart(blocks[0]), null); // non-chart title slide → defer
  const funnel = narrateChart(blocks[1]);
  assert.ok(funnel.includes('Signups: four thousand eight hundred, forty percent of the prior stage.'));
  const radar = narrateChart(blocks[2]);
  assert.ok(radar.includes('On a scale of zero to ten.'));
  assert.ok(radar.includes('Lattice: Performance, nine; Pricing, seven.'));
});

// Default `split: headings` deck with NO explicit `---` — the recovered split must
// still track the engine's heading-injected sections.
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

test('headings-mode deck (no explicit ---) aligns and narrates the chart', () => {
  const blocks = splitSourceToSections(headingsDeck);
  assert.equal(blocks.length, engineSectionCount(headingsDeck));
  assert.equal(blocks.length, 2);
  assert.equal(narrateChart(blocks[0]), null); // the cover
  assert.ok(narrateChart(blocks[1]).includes('forty percent of the prior stage'));
});

// The red-team misalignment class: a parallel `---`-only splitter drifts from the
// engine on non-`---` thematic breaks (`***`), setext underlines (`text`\n`---` = an H2,
// NOT a break), and empty middle sections — and two drifts of opposite sign restore an
// equal COUNT while offsetting the MAPPING, so a chart's numbers land on the wrong
// slide. These assert the engine-faithful split does NOT drift on those constructs.

test('aligns across a setext underline + a `***` thematic break (red-team trigger A)', () => {
  const deck = [
    '---',
    'split: rule',
    '---',
    '',
    'Intro paragraph', // setext heading: the `---` below underlines it, NOT a split
    '---',
    '',
    '<!-- _class: funnel -->',
    '',
    '## Funnel slide',
    '',
    '- Visitors `100`',
    '- Signups `50`',
    '',
    '***', // a real thematic break the `---`-only splitter would miss
    '',
    'Before the star',
    '',
    '***',
    '',
    'After the star',
  ].join('\n');
  const blocks = splitSourceToSections(deck);
  assert.equal(blocks.length, engineSectionCount(deck));
  // The funnel shares section 0 with its setext heading (the engine renders it there),
  // so its narration lands on section 0 — NOT spliced onto "Before the star".
  assert.ok(narrateChart(blocks[0]).includes('forty percent of the prior stage') || narrateChart(blocks[0]).includes('fifty percent'));
  assert.equal(narrateChart(blocks[1]), null); // "Before the star" — no chart
  assert.equal(narrateChart(blocks[2]), null); // "After the star" — no chart
});

test('aligns across a setext underline + an empty middle section (red-team trigger B)', () => {
  const deck = [
    '---',
    'split: rule',
    '---',
    '',
    'Intro',
    '---',
    '',
    '<!-- _class: funnel -->',
    '',
    '## Conversion',
    '',
    '- Leads `200`',
    '- Won `40`',
    '',
    '---',
    '',
    '---', // an empty section between two breaks — the engine renders it
    '',
    'Tail',
  ].join('\n');
  const blocks = splitSourceToSections(deck);
  assert.equal(blocks.length, engineSectionCount(deck));
  // The funnel narrates on its own section; the empty section narrates to nothing —
  // the conversion numbers do NOT splice onto the empty slide.
  assert.ok(narrateChart(blocks[0]).includes('twenty percent of the prior stage'));
  const empties = blocks.filter((b) => narrateChart(b) === null);
  assert.ok(empties.length >= 1);
});

// Mermaid diagram parity (2026-07-13-mermaid-diagram-narration.md §8). The EXPORT now
// recovers narration blocks from a FENCE-INTACT source (`appendAutoGlossary(md)`), not the
// mermaid-baked `rawMd`, so `narrateDiagram` sees the ```mermaid fence on the export exactly
// as Present does. These pin that (1) a ```mermaid fence does NOT shift the section alignment
// (an opaque fence token emits no stray `hr`/heading — the boundary concern a red-team pass
// raised), and (2) a flowchart narrates its topology while a non-flowchart type null-falls-back
// to the heading-only projection.
const mermaidDeck = [
  '---',
  'marp: true',
  'split: rule',
  '---',
  '',
  '# Title',
  '',
  '---',
  '',
  '<!-- _class: diagram -->',
  '',
  '## How a signal becomes a decision.',
  '',
  '```mermaid',
  '---',
  'title: Signal pipeline',
  '---',
  'flowchart LR',
  '  A{{"Signal Intake"}} --> B(["Scoring Model"])',
  '  B -->|"scored signal"| C["Decision Log"]',
  '```',
  '',
  '---',
  '',
  '<!-- _class: diagram -->',
  '',
  '## A sequence, not a flowchart.',
  '',
  '```mermaid',
  'sequenceDiagram',
  '  App->>SDK: score(signal)',
  '```',
  '',
  '---',
  '',
  '<!-- _class: funnel -->',
  '',
  '## Where the flow drops off.',
  '',
  '- Visitors `12,000`',
  '- Signups `4,800`',
].join('\n');

test('a ```mermaid fence does not shift the fence-intact section alignment', () => {
  const blocks = splitSourceToSections(mermaidDeck);
  assert.equal(blocks.length, engineSectionCount(mermaidDeck));
  assert.equal(blocks.length, 4);
});

test('the diagram flowchart AND sequence narrate on the export split (both mermaid types)', () => {
  const blocks = splitSourceToSections(mermaidDeck);
  assert.equal(narrateChart(blocks[0]), null); // title
  const flow = narrateChart(blocks[1]);
  assert.ok(flow.includes('A flowchart, Signal pipeline.'));
  // The unlabeled entry hop reads "leads to"; the labeled hop ("scored signal" — a noun
  // phrase, not a recognized verb) reads as the grammatical appositive.
  assert.ok(flow.includes('Signal Intake leads to Scoring Model'));
  assert.ok(flow.includes('Scoring Model, scored signal, leads to Decision Log'));
  // sequenceDiagram now narrates its message script on the same fence-intact export split.
  assert.ok(narrateChart(blocks[2]).includes('A one-message sequence diagram. App sends to SDK: score(signal).'));
  assert.ok(narrateChart(blocks[3]).includes('forty percent of the prior stage')); // funnel unaffected
});
