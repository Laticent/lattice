const test = require('node:test');
const assert = require('node:assert/strict');

// Slide ownership in the component render matrix. The first nightly run in CI (2026-10-16) found
// two components credited with ZERO slides: a layout consumes its own class, so the section the
// browser sees never carries `columns` or `rows`.
const { ownerOf, summarize } = require('../../../tools/conformance-render.js');

const headers = new Map([['Lattice · columns', 'columns'], ['Lattice · bar', 'bar']]);

test('a slide that kept its component class is owned by it', () => {
  assert.equal(ownerOf({ header: 'Lattice · bar', cls: ['bar', 'dark'] }, headers), 'bar');
});

test('a LAYOUT slide, whose own class the engine consumed, is still owned', () => {
  assert.equal(ownerOf({ header: 'Lattice · columns', cls: ['dark', 'lat-pane-host', 'form'] }, headers), 'columns');
  assert.equal(ownerOf({ header: 'Lattice · columns', cls: ['form'] }, headers), 'columns');
});

test('the slides a gallery generates are never credited to its component', () => {
  for (const c of ['title', 'closing', 'cards-stack']) {
    assert.equal(ownerOf({ header: 'Lattice · bar', cls: [c, 'form'] }, headers), null, c);
  }
});

test('a slide with an unknown or empty header has no owner', () => {
  assert.equal(ownerOf({ header: '', cls: ['bar'] }, headers), null);
  assert.equal(ownerOf({ header: 'Lattice · nope', cls: ['bar'] }, headers), null);
});

test('summarize: a headerless GENERATED slide is not a harness fault; a headerless ordinary one is', () => {
  const r = {
    files: [{ name: 'columns' }],
    slideOwner: new Map([[1, null], [2, 'columns'], [3, null]]),
    index: [
      { slide: 1, header: '', cls: ['title'] }, // the diagram gallery blanks its own title header
      { slide: 2, header: 'Lattice · columns', cls: ['form'] },
      { slide: 3, header: '', cls: ['dark'] }, // an ordinary slide that lost its header: a real fault
    ],
    overflow: [{ slide: 1, over: true }, { slide: 3, over: true }],
    cardRows: [],
    axeViolations: [],
    swept: null,
  };
  const s = summarize(r);
  assert.deepEqual(s.unowned, [3]);
  assert.equal(s.generated.overflow, 1, 'the blanked-header title slide is counted as generated, not dropped');
  assert.equal(s.components[0].slides, 1);
});
