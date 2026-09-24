// lib/components/surfaces.js — which parts of a slide each component has. The
// `_class:` completion offers a modifier only where the surface it acts on exists.
// See engineering/decisions/2026-09-24-positional-class-completion.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { loadAll, manifestBucket } = require('../../../lib/components');
const { SURFACES, CONTENT_SURFACES, componentSurfaces } = require('../../../lib/components/surfaces');

const ROOT = path.join(__dirname, '..', '..', '..');
const byName = new Map(loadAll().map((m) => [m.name, m]));
const surfacesOf = (name, hosts) => {
  const m = byName.get(name);
  return componentSurfaces(m, { dir: path.join(ROOT, 'lib/components', manifestBucket(m), name), hosts });
};

test('every component has the slide surface, and only known surfaces', () => {
  for (const name of byName.keys()) {
    const s = surfacesOf(name);
    assert.ok(s.includes('slide'), name);
    for (const x of s) assert.ok(SURFACES.includes(x), `${name}: unknown surface ${x}`);
  }
});

test('a component with no heading slot has no heading surface', () => {
  assert.ok(!surfacesOf('big-number').includes('heading'));
  assert.ok(!surfacesOf('quote').includes('heading'));
  assert.ok(surfacesOf('content').includes('heading'));
});

test('card surfaces come from the facts the CSS and resolvers actually read', () => {
  assert.ok(surfacesOf('cards-grid').includes('card-row'), 'manifest `cards` field');
  assert.ok(!surfacesOf('content').includes('card-row'));
  assert.ok(surfacesOf('kpi').includes('card-surface'), 'kpi.styles.css reads --elevation-card');
  assert.ok(!surfacesOf('big-number').includes('card-surface'));
  assert.ok(surfacesOf('stats').includes('card-rail'), 'named in the rail paint rule');
  assert.ok(!surfacesOf('kpi').includes('card-rail'));
});

test('chart motion is offered only where the component draws data marks', () => {
  assert.ok(surfacesOf('bar').includes('chart-marks'));
  assert.ok(surfacesOf('scene').includes('chart-marks'), 'scene hosts motion through data-scene-spec');
  assert.ok(!surfacesOf('kanban').includes('chart-marks'));
});

test('a table surface comes from the anatomy', () => {
  assert.ok(surfacesOf('table').includes('table'));
  assert.ok(!surfacesOf('big-number').includes('table'));
});

test('the editorial blocks come from the render (hosts)', () => {
  const s = surfacesOf('quote', { 'key-insight': false, 'below-note': false, 'insight-label': false });
  assert.ok(!s.includes('key-insight') && !s.includes('below-note') && !s.includes('insight-label'));
  assert.ok(surfacesOf('content', {}).includes('key-insight'), 'an unknown host counts as present');
});

test('the editor kernel adds the same content surfaces as the engine side', async () => {
  const { CONTENT_SURFACES: kernel } = await import('../../../docs/src/playground/slide-context.js');
  assert.deepEqual([...kernel].sort(), [...CONTENT_SURFACES].sort());
});
