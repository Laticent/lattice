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

// The realm-class growth guard (2026-07-20-playground-theme-toggle-not-a-leak.md). Keys below are the
// REAL `type:name` strings a Playground-toggle snapshot emits (captured, not invented). The trigger MUST
// anchor on JS-unmintable realm-binding classes (FunctionTemplateInfo/ObjectTemplateInfo/NativeContext/
// ScriptContext) and MUST NOT fire on the loud-but-ambiguous classes realm churn also produces yet
// ordinary leaks produce too — else a real closure/accessor/object leak gets mislabeled "realm, reclaimed"
// and dismissed (the dangerous false-negative the adversarial trio flagged).
test('perf-torture: realmClassGrowth anchors on realm-binding classes, never dismisses ordinary leaks', async () => {
	const { realmClassGrowth } = await import('../../../tools/perf-torture/engine.mjs');
	assert.equal(realmClassGrowth(null), null, 'no snapDiff → null');
	assert.equal(realmClassGrowth({ top: [] }), null, 'empty diff → null');
	// Real realm churn (FunctionTemplateInfo / NativeContext grow) → flagged.
	const realm = realmClassGrowth({ top: [{ k: 'hidden:system / FunctionTemplateInfo', dCount: 959, dSelf: 61000 }, { k: 'hidden:system / NativeContext', dCount: 30, dSelf: 37000 }] });
	assert.ok(Array.isArray(realm) && realm.length >= 1, 'realm-binding growth is flagged');
	assert.match(realm.join(' '), /FunctionTemplateInfo|NativeContext/, 'names the realm-binding class');
	// MUST NOT fire on the ambiguous classes alone — these grow for ORDINARY JS too:
	assert.equal(realmClassGrowth({ top: [{ k: 'object:system / Context', dCount: 932, dSelf: 18000 }] }), null, 'closure Context (accumulating closures) is NOT dismissed as realm');
	assert.equal(realmClassGrowth({ top: [{ k: 'hidden:system / AccessorPair', dCount: 9722, dSelf: 117000 }] }), null, 'AccessorPair (any getter/setter) is NOT dismissed as realm');
	assert.equal(realmClassGrowth({ top: [{ k: 'object shape:system / PrototypeInfo', dCount: 1592, dSelf: 45000 }] }), null, 'PrototypeInfo (any prototype) is NOT dismissed as realm');
	assert.equal(realmClassGrowth({ top: [{ k: 'object:Object', dCount: 5000, dSelf: 900000 }, { k: 'closure:next', dCount: 299, dSelf: 8000 }] }), null, 'a real object/closure leak is NOT dismissed as realm');
	// A realm anchor below the count threshold (noise) → not flagged.
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

// --listeners: diffListeners splits per-cycle net-live growth into PERSISTENT (document/window → a real
// leak) vs transient churn, and rates the persistent growth per cycle. The pure diff is what the report
// verdict keys on, so its split + rate must be exact (2026-07-21-studio-compose-listener-leak-is-a-perf-
// overlay-artifact.md — the instrument that told a real leak from the ?perf/web-vitals artifact).
test('perf-torture: diffListeners splits persistent vs transient net-live growth and rates it', async () => {
	const { diffListeners } = await import('../../../tools/perf-torture/engine.mjs');
	assert.equal(diffListeners(null, [], 10), null, 'no baseline → null');
	const base = [
		{ key: 'click @ button.x (detached)', live: 2, persistent: false, stack: 's1' },
		{ key: 'visibilitychange @ document', live: 1, persistent: true, stack: 's2' },
	];
	const final = [
		{ key: 'click @ button.x (detached)', live: 16, persistent: false, stack: 's1' }, // +14 churn
		{ key: 'visibilitychange @ document', live: 21, persistent: true, stack: 's2' },   // +20 persistent
		{ key: 'resize @ window', live: 4, persistent: true, stack: 's3' },                // +4 persistent (new key)
	];
	const r = diffListeners(base, final, 20);
	assert.equal(r.totalPersistentDelta, 24, 'persistent Δ = 20 (visibilitychange) + 4 (resize)');
	assert.equal(r.persistentPerCyc, 1.2, '24 / 20 cycles = 1.2/cyc');
	assert.equal(r.persistentGrowth.length, 2, 'two persistent growers');
	// The leak verdict is computed in diffListeners (pure) so it is testable — not inline at the call site.
	assert.equal(r.leak, true, '1.2/cyc ≥ 0.4 default floor → leak');
	assert.equal(r.floor, 0.4, 'default floor is exposed on the result');
	assert.equal(diffListeners(base, final, 100).leak, false, 'same growth over 100 cycles = 0.24/cyc < 0.4 → not a leak');
	assert.equal(diffListeners(base, final, 20, 2.0).leak, false, 'a higher explicit floor (2.0) is respected — 1.2/cyc is below it');
	assert.equal(diffListeners(base, final, 20, 1.2).leak, true, 'the floor is inclusive (≥): 1.2/cyc at floor 1.2 is a leak');
	// Persistent sorts before transient; the biggest persistent grower leads.
	assert.equal(r.grown[0].key, 'visibilitychange @ document', 'largest persistent grower leads');
	assert.ok(r.grown[0].persistent, 'lead grower is persistent');
	// A bucket that did not grow is excluded; the transient grower carries its add-site for context.
	const transient = r.grown.filter((g) => !g.persistent);
	assert.equal(transient.length, 1, 'one transient grower');
	assert.equal(transient[0].delta, 14, 'transient delta preserved');
	// A flat run (final === baseline) → zero persistent growth, no leak.
	assert.equal(diffListeners(base, base, 20).totalPersistentDelta, 0, 'flat run → no persistent growth');
	assert.equal(diffListeners(base, base, 20).leak, false, 'flat run is not a leak');
});

// Inspector-contamination guard: a retainer chain rooted at (or threaded through) the attached DevTools
// heap client is an ARTIFACT, not an app holder. isInspectorChain flags it so the report says
// "re-measure without a heap client" instead of misattributing the hold (#1139 meta-follow-up).
test('perf-torture: isInspectorChain flags DevTools-rooted chains, not real app holders', async () => {
	const { isInspectorChain } = await import('../../../tools/perf-torture/engine.mjs');
	assert.equal(isInspectorChain(null), false, 'no chain → false');
	assert.equal(isInspectorChain({ root: '(GC roots)', path: [{ node: 'object:Foo', via: 'bar' }] }), false, 'a real GC-root chain is not inspector');
	assert.ok(isInspectorChain({ root: '<DevTools console>', path: [] }), 'a DevTools-console root is flagged');
	assert.ok(isInspectorChain({ root: '(GC roots)', path: [{ node: 'blink::ScriptStateProtectingContext', via: 'context' }] }), 'a ScriptStateProtectingContext link is flagged');
	assert.equal(isInspectorChain({ root: '(Global handles)', path: [{ node: 'object:Window', via: 'native' }] }), false, 'a real global-handles hold is not inspector');
});

// --confirm-realm: classifyConfirm turns three no-heap-client memory readings (before → after-drive →
// after-idle) into a verdict. RECLAIMED-on-idle ⇒ a HeapProfiler over-count (not a leak); PINNED ⇒ real.
// The pure classifier is what the report verdict keys on, so its thresholds must hold
// (2026-07-20-playground-theme-toggle-not-a-leak.md; #32 no-CDP confirmation).
test('perf-torture: classifyConfirm distinguishes a reclaimable over-count from a pinned leak', async () => {
	const { classifyConfirm } = await import('../../../tools/perf-torture/engine.mjs');
	const MB = 1e6;
	// Grew 20MB driving, idle gave ~18MB back → reclaimable (the Playground-toggle over-count shape).
	assert.equal(classifyConfirm(30 * MB, 50 * MB, 32 * MB).verdict, 'reclaimable', '90% reclaimed on idle → over-count, not a leak');
	// Grew 20MB, idle freed only ~2MB → the growth is pinned → a real leak.
	assert.equal(classifyConfirm(30 * MB, 50 * MB, 48 * MB).verdict, 'pinned', '10% reclaimed → survived idle → real leak');
	// Barely moved (below the 4MB noise floor) → nothing to confirm.
	assert.equal(classifyConfirm(30 * MB, 30.5 * MB, 30.4 * MB).verdict, 'no-growth', 'sub-floor growth carries no signal');
	// A failed measurement (NaN) → unavailable, never a false verdict.
	assert.equal(classifyConfirm(30 * MB, NaN, 30 * MB).verdict, 'unavailable', 'a NaN reading is unavailable, not a leak');
	// The 60% boundary is the reclaimable/pinned split: exactly 60% reclaimed reads reclaimable.
	assert.equal(classifyConfirm(0, 10 * MB, 4 * MB).verdict, 'reclaimable', '6MB of 10MB reclaimed (60%) → reclaimable');
	assert.equal(classifyConfirm(0, 10 * MB, 4.1 * MB).verdict, 'pinned', '5.9MB of 10MB reclaimed (59%) → pinned');
	// The arithmetic is exposed for the report.
	const r = classifyConfirm(30 * MB, 50 * MB, 33 * MB);
	assert.equal(r.retained, 20 * MB, 'retained = afterDrive - before');
	assert.equal(r.reclaimed, 17 * MB, 'reclaimed = afterDrive - afterIdle');
	assert.equal(r.net, 3 * MB, 'net = afterIdle - before');
});
