// Guards the perf-torture engine's PUBLIC CONTRACT — the measurement seam + the autonomous-driving
// primitives that the `explore`/`replay` crawl driver (Slice 3/4) reuses rather than duplicates
// (HARD RULE #1; 2026-07-20-autonomous-torture-profiler.md §8, slice 2). A silent drop of any of these
// exports would break the driver at a distance; this is the cheap tripwire. These tests assert the
// export/contract SHAPE only — the primitives run entirely in page.evaluate, so their browser behavior
// (visibility filtering, selector uniqueness, role/label match) is NOT exercised in CI (needs Chromium).
// It was smoke-tested against the built Studio during development (real-surface, HARD RULE #23) and is
// driven for real by the Slice-3 `explore` driver; here it remains UNVERIFIED.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

test('perf-torture engine exports the measurement seam + autonomous-driving primitives', async () => {
	const mod = await import('../../../tools/perf-torture/engine.mjs');

	// Measurement seam — exported so a second driver reuses the engine's measurement (HARD RULE #1).
	for (const name of ['analyze', 'controlSlopesFrom', 'peakDuring', 'sample', 'serve']) {
		assert.equal(typeof mod[name], 'function', `measurement seam: ${name} must be an exported function`);
	}
	// The universal metric keys + floors a driver needs to trend/calibrate its own laps.
	assert.ok(Array.isArray(mod.UNIVERSAL_KEYS) && mod.UNIVERSAL_KEYS.includes('retainedHeap'), 'UNIVERSAL_KEYS must be the exported metric-key array');
	assert.equal(typeof mod.UNIVERSAL_FLOOR, 'object', 'UNIVERSAL_FLOOR must be the exported floor map');

	// Autonomous-driving primitives — discover + safely click controls the crawler didn't author.
	for (const name of ['enumerateInteractables', 'resolveAndClick']) {
		assert.equal(typeof mod[name], 'function', `autonomous primitive: ${name} must be an exported function`);
	}
	assert.equal(typeof mod.INTERACTABLE_SEL, 'string', 'INTERACTABLE_SEL must be the exported clickable-surface selector');
	assert.match(mod.INTERACTABLE_SEL, /button/, 'INTERACTABLE_SEL should cover buttons');

	// The observer-safe helper set the anti-pollution invariant depends on stays exported.
	for (const name of ['clickIn', 'clickNth', 'countSel', 'settle', 'wait']) {
		assert.equal(typeof mod[name], 'function', `observer-safe helper: ${name} must stay exported`);
	}
});

// The realm-class over-count guard (2026-07-20-playground-theme-toggle-not-a-leak.md): a snapshot diff
// whose growers are V8 realm scaffolding must be flagged UNCONFIRMED (HeapProfiler over-counts detached
// realms a real GC reclaims), but an ordinary JS-object leak must NOT be flagged.
test('perf-torture: realmClassGrowth flags realm scaffolding but not ordinary object growth', async () => {
	const { realmClassGrowth } = await import('../../../tools/perf-torture/engine.mjs');
	assert.equal(realmClassGrowth(null), null, 'no snapDiff → null');
	assert.equal(realmClassGrowth({ top: [] }), null, 'empty diff → null');
	// A real detached-realm diff (the Playground shape) → flagged.
	const realm = realmClassGrowth({ top: [{ k: 'hidden:system / NativeContext', dCount: 30, dSelf: 37000 }, { k: 'code:system / FunctionTemplateInfo', dCount: 1260, dSelf: 81000 }] });
	assert.ok(Array.isArray(realm) && realm.length >= 1, 'realm scaffolding growth is flagged');
	assert.match(realm[0], /NativeContext/, 'names the realm constructor');
	// An ordinary JS-object leak (a growing Map/array) → NOT flagged (that IS real retained heap).
	assert.equal(realmClassGrowth({ top: [{ k: 'object:Object', dCount: 5000, dSelf: 900000 }, { k: 'object:Array', dCount: 400, dSelf: 300000 }] }), null, 'ordinary object growth is not a realm over-count');
	// A realm constructor below the count threshold (noise) → not flagged.
	assert.equal(realmClassGrowth({ top: [{ k: 'hidden:system / NativeContext', dCount: 2, dSelf: 3000 }] }), null, 'sub-threshold realm noise is not flagged');
});

// The a11y probe (norm/roleOf/labelOf) is inlined SEPARATELY in enumerateInteractables and
// resolveAndClick — a closure can't cross into page.evaluate, so the source is duplicated by necessity.
// If the two copies ever drift, resolveAndClick would recompute role/label differently from what
// enumerate stored and falsely abort EVERY click as 'mismatch'. Comment-only "keep identical" isn't a
// guard; this is. (Maker-checker follow-up F2, 2026-07-20-autonomous-torture-profiler.md.)
test('perf-torture: the two inlined a11y probes stay byte-identical (no drift)', () => {
	const src = readFileSync(join(__dirname, '../../../tools/perf-torture/engine.mjs'), 'utf8');
	// Capture each probe: from `const norm = (s)` through the `labelOf` line (the shared trio).
	const blocks = [...src.matchAll(/const norm = \(s\)[\s\S]*?const labelOf = \(el\) => norm\([^\n]*\n/g)].map((m) => m[0]);
	assert.equal(blocks.length, 2, `expected exactly two inlined a11y probes, found ${blocks.length}`);
	assert.equal(blocks[0], blocks[1], 'the two inlined a11y probes (norm/roleOf/labelOf) must be byte-identical — they drifted');
});
