/**
 * Unit: the concept ontology (lib/concepts/**) — the engine-read encoding of the
 * cross-level relationship graph (design/concepts.md §2 lattice + §7 edge table).
 *
 * Asserts:
 *   (a) the shipped ontology loads, with every required concept present and every
 *       edge endpoint a declared node;
 *   (b) shape validation rejects an unknown edge endpoint, a bad relation, and a
 *       missing required concept;
 *   (c) the NODE drift gate — validateAgainstCatalogs — fires when a node's
 *       `source` points at a vocabulary the live catalogs don't ship;
 *   (d) the EDGE-reality gate — validateEdgesAgainstEngine — fires when the live
 *       catalogs stop honoring a structural relationship (e.g. frame→cell produces);
 *   (e) counts are derived from the live catalogs (not stored in the ontology);
 *   (f) dist/docs/concepts.json is fresh (regenerating produces no diff) —
 *       mirrors the forms.json / components.json freshness gates.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const concepts = require('../../../lib/concepts');
const { renderJson, JSON_FILE } = require('../../../tools/build-concepts');

test('the shipped ontology loads and is internally consistent', () => {
  const { nodes, edges, counts } = concepts.loadConcepts();
  const ids = new Set(nodes.map((n) => n.id));
  for (const id of concepts.REQUIRED_NODES) {
    assert.ok(ids.has(id), `required concept missing: ${id}`);
  }
  for (const e of edges) {
    assert.ok(ids.has(e.from), `edge from unknown node: ${e.from}`);
    assert.ok(ids.has(e.to), `edge to unknown node: ${e.to}`);
    assert.ok(concepts.RELATIONS.includes(e.relation), `unknown relation: ${e.relation}`);
  }
  // The four axes are present and orthogonality is encoded between them.
  for (const axis of ['function', 'form', 'substance', 'finish']) assert.ok(ids.has(axis));
  assert.ok(edges.some((e) => e.relation === 'orthogonal'));
  // Form is the axis that resolves into the structural nouns.
  for (const noun of ['frame', 'cell', 'tile']) {
    assert.ok(edges.some((e) => e.from === 'form' && e.to === noun && e.relation === 'resolves-into'));
  }
  // A Cell holds a Tile (the content Tile hosts the author's Component).
  assert.ok(edges.some((e) => e.from === 'cell' && e.to === 'tile' && e.relation === 'holds'));
  // Recursive frames-in-cells were rejected — the cell→frame "holds" edge must NOT
  // exist (engineering/decisions/2026-06-18-frame-recursion-cells.md).
  assert.ok(!edges.some((e) => e.from === 'cell' && e.to === 'frame' && e.relation === 'holds'));
  // counts are derived and positive for every node that claims a catalog.
  assert.ok(counts.function > 0 && counts.form > 0 && counts.frame > 0 && counts.component > 0);
});

test('shape validation rejects malformed graphs', () => {
  // unknown edge endpoint
  let errs = [];
  concepts.validateShape(
    { nodes: [{ id: 'a', kind: 'axis', system: 'A', definition: 'x' }], edges: [{ from: 'a', to: 'ghost', relation: 'orthogonal' }] },
    errs,
  );
  assert.ok(errs.some((e) => /unknown "to" node: ghost/.test(e)));

  // unknown relation
  errs = [];
  concepts.validateShape(
    { nodes: [{ id: 'a', kind: 'axis', system: 'A', definition: 'x' }, { id: 'b', kind: 'noun', system: 'B', definition: 'y' }], edges: [{ from: 'a', to: 'b', relation: 'wat' }] },
    errs,
  );
  assert.ok(errs.some((e) => /unknown relation "wat"/.test(e)));

  // a missing required concept (the shipped set minus one)
  errs = [];
  concepts.validateShape({ nodes: [{ id: 'function', kind: 'axis', system: 'Function', definition: 'x' }], edges: [] }, errs);
  assert.ok(errs.some((e) => /required concept missing from ontology: form/.test(e)));
});

test('the drift gate fires when a node points at a vocabulary the catalogs do not ship', () => {
  const live = concepts.liveVocabularies();
  const errs = [];
  concepts.validateAgainstCatalogs(
    { nodes: [{ id: 'form', kind: 'axis', system: 'Form', definition: 'x', source: { catalog: 'components', vocab: 'NOPE' } }] },
    live,
    errs,
  );
  assert.ok(errs.some((e) => /does not exist in the live catalog/.test(e)), 'drift gate should flag a missing vocabulary');

  // an unknown catalog name is also caught
  const errs2 = [];
  concepts.validateAgainstCatalogs(
    { nodes: [{ id: 'x', source: { catalog: 'ghost', vocab: 'FORMS' } }] },
    live,
    errs2,
  );
  assert.ok(errs2.some((e) => /is not a known catalog/.test(e)));

  // a well-formed source resolves cleanly (no error)
  const ok = [];
  concepts.validateAgainstCatalogs(
    { nodes: [{ id: 'form', source: { catalog: 'components', vocab: 'FORMS' } }] },
    live,
    ok,
  );
  assert.equal(ok.length, 0);
});

test('the edge-reality gate fires when the engine stops honoring a structural relationship', () => {
  // A live catalog where NO frame produces any cell → the frame→cell edge is broken.
  const brokenRaw = {
    frames: [{ id: 'f', cells: [] }],
    cells: [{ id: 'c', accepts: ['content'] }],
    tiles: [{ id: 't', fits: ['c'] }],
    components: [{ name: 'x', function: 'inventory', form: 'grid', substance: 'prose' }],
  };
  const errs = [];
  concepts.validateEdgesAgainstEngine(
    { edges: [{ from: 'frame', to: 'cell', relation: 'produces' }] },
    brokenRaw,
    errs,
  );
  assert.ok(errs.some((e) => /frame→cell \(produces\) is not honored/.test(e)), 'produces edge should be gated');

  // A component missing its `form` field → the "selects a Frame" join edge breaks.
  const errs2 = [];
  concepts.validateEdgesAgainstEngine(
    { edges: [{ from: 'component', to: 'form', relation: 'selects' }] },
    { ...brokenRaw, components: [{ name: 'x', function: 'inventory', substance: 'prose' }] },
    errs2,
  );
  assert.ok(errs2.some((e) => /component→form \(selects\)/.test(e)));

  // The real catalogs honor every structural edge (no error on the shipped graph).
  const live = concepts.liveVocabularies();
  const ok = [];
  concepts.validateEdgesAgainstEngine(concepts.readOntology(), live.raw, ok);
  assert.equal(ok.length, 0, `shipped edges should all be honored, got: ${ok.join('; ')}`);
});

test('counts are derived from the live catalogs, not stored in the ontology', () => {
  const raw = concepts.readOntology();
  // The source ontology must not hand-store counts (that is the drift the gate prevents).
  assert.equal(raw.counts, undefined);
  const live = concepts.liveVocabularies();
  const counts = concepts.deriveCounts(raw, live);
  assert.equal(counts.form, live.components.FORMS.length);
  assert.equal(counts.frame, live.forms.frames.length);
});

// STALENESS gate only, NOT a content oracle: renderJson() also generated the
// committed file, so a bug inside it corrupts both sides equally and passes.
// The CONTENT is independently checked by the deriveCounts / liveVocabularies
// tests above. A diff here means a source ontology changed without a rebuild —
// re-run the generator and commit; treat the diff as expected-on-change.
test('dist/docs/concepts.json is fresh (regenerating produces no diff)', () => {
  const committed = fs.readFileSync(JSON_FILE, 'utf8');
  assert.equal(renderJson(), committed, 'run `npm run docs:concepts` and commit the result');
});
