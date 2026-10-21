// What a drawn Mermaid diagram carries once baked (lib/plugins/mermaid/shared/baked-figure.js), shared
// by the CLI bake, the browser pass and the Studio's Webpage export so the two hosts' files match byte
// for byte (engineering/decisions/2026-10-16-player-as-library-audit.md §11.9).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  mermaidKindLabel, labelDiagramSvg, collapseSankeyText, DIAGRAM_STAGE_WIDTH, STAGE_TEXT_RESET,
} = require('../../../lib/plugins/mermaid/shared/baked-figure.js');
const { bakedFigureOpenTag, stampFigureIndex } = require('../../../lib/plugins/mermaid/shared/baked-figure-tag.js');

const ROOT = path.join(__dirname, '..', '..', '..');

test('the name floor reads the type off the first meaningful line, past directives and front matter', () => {
  assert.equal(mermaidKindLabel('pie showData\n  "a" : 1'), 'Pie chart');
  assert.equal(mermaidKindLabel('%%{init: {"theme":"base"}}%%\nflowchart LR\n  A --> B'), 'Flowchart');
  assert.equal(mermaidKindLabel('---\ntitle: Orders\n---\nsequenceDiagram\n  A->>B: hi'), 'Sequence diagram');
  assert.equal(mermaidKindLabel('notAType\n'), 'Diagram');
});

test('the floor labels a nameless root and leaves a named or titled one alone', () => {
  assert.equal(labelDiagramSvg('<svg id="x"><g/></svg>', 'pie\n'), '<svg aria-label="Pie chart" id="x"><g/></svg>');
  const named = '<svg aria-labelledby="t" id="x"><g/></svg>';
  assert.equal(labelDiagramSvg(named, 'pie\n'), named);
  const titled = '<svg id="x"><title>Mine</title></svg>';
  assert.equal(labelDiagramSvg(titled, 'pie\n'), titled);
});

test('a sankey label goes on one line; no other family is touched', () => {
  const sankey = '<svg><g class="links"></g><text x="1">Wages\n550</text></svg>';
  assert.equal(collapseSankeyText(sankey), '<svg><g class="links"></g><text x="1">Wages 550</text></svg>');
  const flow = '<svg><text>a\nb</text></svg>';
  assert.equal(collapseSankeyText(flow), flow);
});

test('the figure-baked wrapper is the CLI shape, index right after the class', () => {
  assert.equal(bakedFigureOpenTag({ name: 'mermaid' }), '<div class="mermaid-svg" data-lattice-figure="mermaid">');
  assert.equal(
    bakedFigureOpenTag({ name: 'mermaid', pinned: true, idx: 2 }),
    '<div class="mermaid-svg" data-mmd-idx="2" data-lattice-figure="mermaid" data-author-theme="1">',
  );
  assert.equal(stampFigureIndex('<div class="mermaid-svg" data-lattice-figure="mermaid"><svg/></div>', 0), '<div class="mermaid-svg" data-mmd-idx="0" data-lattice-figure="mermaid"><svg/></div>');
});

// The arm that fails if one path stops sharing. Each consumer must take the piece from this module,
// not keep a copy: the browser pass for the floor, the collapse and the stage width; the CLI bake for
// all three string pieces; the worker for the width; the Studio's export for the wrapper.
test('every path takes these pieces from the one module', () => {
  const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const hydrate = read('lib/plugins/mermaid/mermaid.hydrate.js');
  assert.match(hydrate, /labelDiagramSvg\(collapseSankeyText\(result\.svg\), source\)/);
  assert.match(hydrate, /width:\$\{DIAGRAM_STAGE_WIDTH\}px/);
  const bake = read('lib/plugins/mermaid/mermaid.bake.js');
  assert.match(bake, /svg = collapseSankeyText\(svg\);/);
  assert.match(bake, /svg = labelDiagramSvg\(svg, definition\);/);
  assert.match(bake, /bakedFigureOpenTag\(\{ name: ctx\.name/);
  assert.doesNotMatch(bake, /const MERMAID_KINDS/, 'the kind table lives in baked-figure.js only');
  assert.match(read('lib/plugins/mermaid/shared/render-worker.js'), /#container\{width:\$\{DIAGRAM_STAGE_WIDTH\}px\}/);
  assert.match(read('docs/src/components/studio/export/deck-export.js'), /bakedFigureOpenTag\(\{ name: 'mermaid'/);
  assert.equal(DIAGRAM_STAGE_WIDTH, 784, 'the box the CLI has always drawn in: 800 px viewport less 8 px margins');
});

test('the export stage starts from a bare page\'s text styles, and keeps its own box (followups.d/2739-p9)', () => {
  // `all` leaves `direction` out by spec, so it is named; `display` goes back to the stage's block box.
  assert.equal(STAGE_TEXT_RESET, 'all:initial;direction:ltr;display:block;');
  const hydrate = fs.readFileSync(path.join(ROOT, 'lib/plugins/mermaid/mermaid.hydrate.js'), 'utf8');
  assert.match(hydrate, /cssText = `\$\{STAGE_TEXT_RESET\}position:absolute;left:0;top:0;width:\$\{DIAGRAM_STAGE_WIDTH\}px;visibility:hidden;pointer-events:none;`/, 'the reset comes first, so the stage\'s own box and hiding win');
});
