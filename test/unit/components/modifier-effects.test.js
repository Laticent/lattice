// lib/core/modifier-effects.generated.json — the render proof's measurement, which
// the editor's `_class:` completion reads as the source for the surfaces it probes.
// Written by tools/check-modifier-effects.js (a browser run); this file checks its
// SHAPE and how it is published, without a browser.
// See engineering/decisions/2026-09-24-positional-class-completion.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { loadAll } = require('../../../lib/components');
const { PROBED_SURFACES, CONTENT_SURFACES, publishedSurfaces } = require('../../../lib/components/surfaces');
const oracle = require('../../../lib/core/modifier-effects.generated.json');

const names = new Set(loadAll().map((m) => m.name));

test('the measurement probes exactly the surfaces the model says it does', () => {
  assert.deepEqual([...oracle.probed].sort(), [...PROBED_SURFACES].sort());
});

// A component the proof has not measured yet keeps its derivation, so a new
// component does NOT fail here — requiring a browser run before `npm test` passes
// would tax every new-component PR. `npm run check:modifier-effects` lists it.
test('nothing unknown is measured', () => {
  const unknown = Object.keys(oracle.components).filter((n) => !names.has(n));
  assert.deepEqual(unknown, [], `measured components that no longer exist — re-bless: ${unknown.join(', ')}`);
});

test('entries name only probed surfaces, and inert ones only content surfaces', () => {
  for (const [name, e] of Object.entries(oracle.components)) {
    for (const s of e.surfaces) assert.ok(PROBED_SURFACES.includes(s), `${name}: ${s}`);
    for (const s of e.inert || []) assert.ok(CONTENT_SURFACES.includes(s), `${name} inert: ${s}`);
    for (const [v, list] of Object.entries(e.variants || {})) {
      for (const s of list) assert.ok(PROBED_SURFACES.includes(s) && !e.surfaces.includes(s), `${name} +${v}: ${s}`);
    }
  }
});

test('publishedSurfaces: measured replaces derived for probed surfaces only', () => {
  const measured = { x: { surfaces: ['heading'], inert: ['eyebrow'], variants: { ops: ['card-surface'] } } };
  const out = publishedSurfaces({ name: 'x' }, ['slide', 'eyebrow', 'heading', 'key-insight', 'card-surface'], measured);
  assert.deepEqual(out.surfaces, ['heading', 'key-insight', 'slide']);
  assert.deepEqual(out.variantSurfaces, { ops: ['card-surface'] });
  assert.deepEqual(out.inertSurfaces, ['eyebrow']);
  assert.deepEqual(publishedSurfaces({ name: 'new' }, ['slide', 'heading'], measured), { surfaces: ['slide', 'heading'] }, 'an unmeasured component keeps its derivation');
});
