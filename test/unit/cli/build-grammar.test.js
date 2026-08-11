/**
 * Unit: the LFM grammar projection (dist/docs/grammar.json), emitted by
 * tools/build-docs-portal.js `renderGrammarJson` from the component manifests.
 *
 * grammar.json is the machine-readable per-component grammar for LFM
 * (Lattice-Flavored Markdown) — see spec/LFM-1.0.md and spec/diagnostics.md.
 * It is a third projection of the same manifest source as components.json, so
 * these tests lock the projection's contract and its agreement with the
 * manifests it is generated from.
 *
 * Covers:
 *   1. Top-level shape: spec id, state-marker grammar, fence sub-languages.
 *   2. One entry per manifest; classToken === name.
 *   3. requiredSlots are exactly the slots flagged `required: true`, and are a
 *      subset of the component's slot keys.
 *   4. stateMarkerComponents are real component names, and readsStateMarkers is
 *      true for exactly those components.
 *   5. The four universal state markers are present with their gfm flag — the
 *      degradation contract LFM 1.0 §5.1 hinges on.
 *   6. Deterministic / idempotent: re-rendering is byte-identical.
 *   7. The committed dist/docs/grammar.json is not stale vs the manifests.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { renderGrammarJson, GRAMMAR_FILE } = require('../../../tools/build-docs-portal');
const { loadAll } = require('../../../lib/components');

describe('LFM grammar.json projection', () => {
  const manifests = loadAll();
  const doc = JSON.parse(renderGrammarJson(manifests));
  const byName = new Map(doc.components.map((c) => [c.name, c]));

  test('declares the LFM spec id and the fence sub-languages', () => {
    assert.equal(doc.spec, 'LFM 1.0');
    assert.ok(doc.fences.functionplot, 'functionplot fence is declared');
    assert.ok(doc.fences.mermaid, 'mermaid fence is declared');
    // The fence is named after its renderer, not Lattice-branded; the old
    // `latticeplot` name survives only as a recorded deprecated alias.
    assert.ok(!doc.fences.latticeplot, 'latticeplot is not a first-class fence (renamed)');
    assert.deepEqual(doc.fences.functionplot.deprecatedAliases, ['latticeplot']);
    for (const f of Object.values(doc.fences)) {
      assert.equal(f.degradesTo, 'code-block', 'every fence degrades to a code block (LFM §3.3)');
    }
  });

  test('the four universal state markers carry a gfm-degradation flag', () => {
    for (const m of ['[x]', '[ ]', '[-]', '[/]']) {
      assert.ok(doc.stateMarkers[m], `${m} is in the state-marker grammar`);
      assert.equal(typeof doc.stateMarkers[m].gfm, 'boolean', `${m} flags its GFM-cleanliness`);
    }
    // The known non-GFM-clean constructs (LFM 1.0 §5.1).
    assert.equal(doc.stateMarkers['[x]'].gfm, true);
    assert.equal(doc.stateMarkers['[ ]'].gfm, true);
    assert.equal(doc.stateMarkers['[-]'].gfm, false);
    assert.equal(doc.stateMarkers['[/]'].gfm, false);
  });

  test('one entry per manifest; classToken === name', () => {
    // No `count` field — an aggregate over every manifest is the one value two
    // concurrent PRs cannot both be right about (#1594). The array's own length is.
    assert.equal('count' in doc, false, 'grammar.json must carry no aggregate `count` — see #1594');
    assert.equal(doc.components.length, manifests.length);
    for (const c of doc.components) {
      assert.equal(c.classToken, c.name, `${c.name} classToken matches its name`);
    }
  });

  test('requiredSlots are exactly the slots flagged required, and a subset of slot keys', () => {
    for (const c of doc.components) {
      const slotKeys = Object.keys(c.slots || {});
      const expectedRequired = slotKeys.filter((k) => c.slots[k] && c.slots[k].required === true);
      assert.deepEqual(
        [...c.requiredSlots].sort(),
        [...expectedRequired].sort(),
        `${c.name} requiredSlots mirror the required-flagged slots`,
      );
      for (const r of c.requiredSlots) {
        assert.ok(slotKeys.includes(r), `${c.name} requiredSlot '${r}' is a real slot`);
      }
    }
  });

  test('stateMarkerComponents are real components, and readsStateMarkers matches', () => {
    const stateSet = new Set(doc.stateMarkerComponents);
    for (const name of doc.stateMarkerComponents) {
      assert.ok(byName.has(name), `state-marker component '${name}' exists in the catalog`);
    }
    for (const c of doc.components) {
      assert.equal(
        c.readsStateMarkers,
        stateSet.has(c.name),
        `${c.name}.readsStateMarkers agrees with stateMarkerComponents`,
      );
    }
  });

  test('deterministic / idempotent', () => {
    assert.equal(renderGrammarJson(manifests), renderGrammarJson(manifests));
  });

  test('committed dist/docs/grammar.json is not stale vs the manifests', () => {
    const committed = fs.readFileSync(GRAMMAR_FILE, 'utf8');
    assert.equal(committed, renderGrammarJson(manifests), 'run `npm run docs:portal` to regenerate');
  });
});
