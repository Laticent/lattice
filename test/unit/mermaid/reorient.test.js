const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { reorientMermaidForPortrait } = require('../../../lib/plugins/mermaid/shared/reorient');

describe('reorientMermaidForPortrait', () => {
  test('portrait: flowchart LR → TB, graph RL → BT (direction preserved)', () => {
    assert.match(reorientMermaidForPortrait('flowchart LR\n  A --> B', 'portrait'), /^flowchart TB\b/);
    assert.match(reorientMermaidForPortrait('graph LR\n  A --> B', 'portrait'), /^graph TB\b/);
    assert.match(reorientMermaidForPortrait('graph RL\n  A --> B', 'portrait'), /^graph BT\b/);
  });

  test('portrait: subgraph `direction LR` also flips', () => {
    const out = reorientMermaidForPortrait('flowchart LR\n subgraph S\n  direction LR\n end', 'portrait');
    assert.match(out, /flowchart TB/);
    assert.match(out, /direction TB/);
  });

  test('landscape / square leave the source untouched (byte-identical)', () => {
    const src = 'graph LR\n  A --> B';
    assert.equal(reorientMermaidForPortrait(src, 'landscape'), src);
    assert.equal(reorientMermaidForPortrait(src, 'square'), src);
  });

  test('already-vertical and non-flowchart diagrams pass through unchanged', () => {
    const td = 'graph TD\n  A --> B';
    assert.equal(reorientMermaidForPortrait(td, 'portrait'), td); // TD/TB untouched
    const seq = 'sequenceDiagram\n  Alice->>Bob: hi'; // no LR/RL token
    assert.equal(reorientMermaidForPortrait(seq, 'portrait'), seq);
    const pie = 'pie\n  "A" : 10'; // no direction
    assert.equal(reorientMermaidForPortrait(pie, 'portrait'), pie);
  });

  test('does not rewrite an LR substring inside a node label', () => {
    // "LR" only flips as the declaration's direction token, not arbitrary text.
    const src = 'flowchart TB\n  A["pull LR data"] --> B';
    assert.equal(reorientMermaidForPortrait(src, 'portrait'), src);
  });
});
