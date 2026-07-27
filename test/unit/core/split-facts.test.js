/**
 * Unit: lib/core/split-facts.js — the STANDING ORACLE's resolver (§8 rule 5 / rule 11 of
 * engineering/decisions/2026-07-22-structure-derived-split-patterns.md).
 *
 * The oracle exists because §0c assigns every component a treatment in PROSE and nothing
 * checked the manifests against it, so `matrix-2x2` (resolved atomic) and `split-compare`
 * (resolved read-across) both shipped a live split axis and a portrait render shredded a
 * 2×2 into pages showing two of four quadrants. These tests cover the resolver + the
 * consistency rules; the blessed-record diff itself is exercised by `oracle:check` and by
 * `checkSplitOracle` in build:check.
 */

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { splitFactsFor, treatmentViolations, TREATMENTS } = require('../../../lib/core/split-facts');
const { loadAll } = require('../../../lib/components');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');

describe('core: splitFactsFor — mirrors what the split registry actually reads', () => {
  test('a top-level capacity.axis is recorded, with WHERE it was declared', () => {
    const f = splitFactsFor({ name: 'checklist', capacity: { axis: 'item', perPage: 2 } });
    assert.equal(f.axis, 'item');
    assert.equal(f.declaredIn, 'capacity');
    assert.equal(f.enrolled, true);
    assert.equal(f.perPage, 2);
  });

  // The drift that bit us: an axis under `adapt.capacity` reads like a per-family COUNT
  // estimate, but lattice-emulator.js's SPLIT_CAP resolves `capacity.axis ??
  // adapt.capacity.axis` and the registry consumes the result as an OPT-IN switch. The
  // resolver must therefore treat it as enrolling, and say which site it came from.
  test('an axis hidden under adapt.capacity still ENROLLS, and declaredIn says so', () => {
    const f = splitFactsFor({ name: 'matrix-2x2', adapt: { capacity: { axis: 'item' } } });
    assert.equal(f.axis, 'item');
    assert.equal(f.declaredIn, 'adapt.capacity');
    assert.equal(f.enrolled, true, 'an adapt-only axis is not "just an estimate" to the registry');
  });

  test('width-reducing strategies are distinguished from vertical paginators (§8 rule 2)', () => {
    const reshape = (s) => splitFactsFor({ name: 'x', split: { strategy: s } }).reshape;
    for (const s of ['cover-code', 'cover-sides', 'cover-cards']) assert.equal(reshape(s), 'width-reducing', s);
    for (const s of ['cover-paginate', 'cover-rows', 'cover-decision', 'kanban-lanes']) {
      assert.equal(reshape(s), 'paginator', s);
    }
  });

  // Why the rule-9 invariant gate is hollow today: it keys on the CLASS `lat-split-cover`,
  // which the per-layout strategies never emit. The oracle records that difference so the
  // discrepancy is visible in data rather than only in a render.
  test('per-layout strategies emit their OWN cover class, not lat-split-cover', () => {
    assert.equal(splitFactsFor({ name: 'glossary', split: { strategy: 'cover-paginate' } }).coverClass, 'lat-split-cover');
    assert.equal(splitFactsFor({ name: 'split-panel', split: { strategy: 'feature-cover' } }).coverClass, 'split-panel-cover');
    assert.equal(splitFactsFor({ name: 'title' }).coverClass, null);
  });
});

describe('core: treatmentViolations — the invariants prose cannot enforce', () => {
  test('an atomic/graphic/anchor/asset component that opts into splitting FAILS', () => {
    for (const [name, treatment] of [['matrix-2x2', 'atomic'], ['funnel', 'graphic'], ['title', 'anchor'], ['image', 'asset']]) {
      const m = { name, adapt: { capacity: { axis: 'item' } } };
      const v = treatmentViolations(m, splitFactsFor(m));
      assert.equal(v.length, 1, `${name} (${treatment}) must be flagged`);
      assert.match(v[0], /never splits/);
    }
  });

  test('a read-across component with a bare axis and no strategy FAILS', () => {
    const m = { name: 'split-compare', adapt: { capacity: { axis: 'item' } } };
    const v = treatmentViolations(m, splitFactsFor(m));
    assert.equal(v.length, 1);
    assert.match(v[0], /read-across/);
  });

  test('…but a read-across component WITH a carousel strategy is fine', () => {
    const m = { name: 'compare-table', capacity: { axis: 'row' }, split: { strategy: 'cover-cards' } };
    assert.deepEqual(treatmentViolations(m, splitFactsFor(m)), []);
  });

  test('a component with no §0c treatment FAILS (rule 11 — placement is a decision)', () => {
    const m = { name: 'brand-new-component', capacity: { axis: 'item' } };
    const v = treatmentViolations(m, splitFactsFor(m));
    assert.equal(v.length, 1);
    assert.match(v[0], /no §0c treatment placed/);
  });
});

describe('core: the oracle covers the real catalog', () => {
  const manifests = loadAll(path.join(ROOT, 'lib', 'components'));

  test('every shipped component has a §0c treatment placed', () => {
    const unplaced = manifests.filter((m) => !TREATMENTS[m.name]).map((m) => m.name);
    assert.deepEqual(unplaced, [], `unplaced components: ${unplaced.join(', ')}`);
  });

  test('and no treatment names a component that no longer exists (no stale entries)', () => {
    const names = new Set(manifests.map((m) => m.name));
    const stale = Object.keys(TREATMENTS).filter((n) => !names.has(n));
    assert.deepEqual(stale, [], `stale treatments: ${stale.join(', ')}`);
  });

  test('the shipped catalog currently satisfies every treatment invariant', () => {
    const all = manifests.flatMap((m) => treatmentViolations(m, splitFactsFor(m)));
    assert.deepEqual(all, [], all.join('\n'));
  });
});
