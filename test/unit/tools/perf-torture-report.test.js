// Guards the perf-torture REPORT artifacts' consumer contract (report.mjs is pure: data in → strings
// out). Focus: the --listeners projection (JSON `listeners` field + Markdown section + top-level verdict)
// and the retainer inspector-contamination flag, both added with the net-live listener mode
// (2026-07-21-studio-compose-listener-leak-is-a-perf-overlay-artifact.md, #32). A silent drop of any
// would strand a consumer reading report.json / a human reading report.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');

// Minimal cycle stub the report builder consumes (matches engine.mjs's cycleResults shape).
function cycle(name, over) {
	return { name, isControl: name === 'idle', rows: [{ metric: 'listeners', first: 685, last: 685, delta: 0, sen: 0, floor: 0.4, z: 0, trend: 'flat' }], series: [{ listeners: 685 }, { listeners: 685 }], snapDiff: null, retReport: null, heapSnapshotFile: null, realmUnconfirmed: false, ...over };
}
const run = (cycles, opts = {}) => ({ scenario: { name: 'studio' }, opts: { mode: 'within', k: 20, cpu: 4, listeners: true, ...opts }, cycles, calibrated: true, floorBasis: 'test', durationMs: 1000, generatedAt: '2026-07-21T00:00:00Z' });

test('perf-torture report: --listeners persistent leak surfaces in JSON, Markdown, and the verdict', async () => {
	const { buildReport, renderMarkdown } = await import('../../../tools/perf-torture/report.mjs');
	const leaky = cycle('compose', {
		listenerReport: {
			totalPersistentDelta: 91, persistentPerCyc: 4.55, leak: true, floor: 0.4,
			persistentGrowth: [{ key: 'visibilitychange @ document', delta: 91, stack: 'at web-vitals.js:1:1309' }],
			grown: [{ key: 'visibilitychange @ document', delta: 91, persistent: true, stack: 'at web-vitals.js:1:1309' }, { key: 'click @ button.x (detached)', delta: 14, persistent: false, stack: 's' }],
		},
	});
	const obj = buildReport(run([cycle('idle', { listenerReport: { totalPersistentDelta: 0, persistentPerCyc: 0, leak: false, floor: 0.4, persistentGrowth: [], grown: [] } }), leaky]));
	// JSON: the listener projection is present, names the leak + its add-site, and the verdict lists it.
	const c = obj.cycles.find((x) => x.name === 'compose');
	assert.equal(c.listeners.leak, true, 'leak flag propagates to JSON');
	assert.equal(c.listeners.persistentGrowth[0].addSite, 'at web-vitals.js:1:1309', 'add-site named in JSON');
	assert.deepEqual(obj.verdict.listenerLeakCycles, ['compose'], 'verdict lists the leaking cycle');
	assert.equal(obj.options.listeners, true, 'options record the mode');
	// Markdown: a red verdict, the persistent-leak line, and the add-site table row.
	const md = renderMarkdown(obj);
	assert.match(md, /🔴/, 'red verdict icon for a persistent listener leak');
	assert.match(md, /persistent listener leak in `compose`/, 'verdict text names the cycle');
	assert.match(md, /visibilitychange @ document/, 'the leaking listener is shown');
	assert.match(md, /web-vitals\.js/, 'the add-site is shown so the growth is NAMED');
});

test('perf-torture report: a flat listener run reads green, no false leak', async () => {
	const { buildReport, renderMarkdown } = await import('../../../tools/perf-torture/report.mjs');
	const flat = cycle('compose', { listenerReport: { totalPersistentDelta: 0, persistentPerCyc: 0, leak: false, floor: 0.4, persistentGrowth: [], grown: [{ key: 'click @ button.x (detached)', delta: 14, persistent: false, stack: 's' }] } });
	const obj = buildReport(run([flat]));
	assert.deepEqual(obj.verdict.listenerLeakCycles, [], 'no leak cycles');
	const md = renderMarkdown(obj);
	assert.match(md, /🟢/, 'green verdict when persistent listeners are flat');
	assert.match(md, /🟢 flat/, 'the listeners section reads flat');
});

test('perf-torture report: retainer inspector-contamination is flagged in JSON and Markdown', async () => {
	const { buildReport, renderMarkdown } = await import('../../../tools/perf-torture/report.mjs');
	const c = cycle('compose', { retReport: { targetsFound: 3, sampleWalked: 3, inspectorContaminated: 2, chains: [['a ◂ b', 3]], example: { root: '<DevTools console>', path: [] } } });
	const obj = buildReport(run([c], { retainers: true }));
	assert.equal(obj.cycles[0].retainers.inspectorContaminated, 2, 'inspector count in JSON');
	const md = renderMarkdown(obj);
	assert.match(md, /root at the DevTools inspector/, 'markdown warns about inspector contamination');
});

// --confirm-realm: the no-heap-client confirmation projects into report.json + report.md. The verdict
// keys on NET-survived-idle; the report must carry it and render honestly (coarse single-shot → the
// PINNED label is hedged, RECLAIMABLE names the over-count). Guards the confirm branch (#32; trio checker).
test('perf-torture report: --confirm-realm verdict projects to JSON and renders honestly', async () => {
	const { buildReport, renderMarkdown } = await import('../../../tools/perf-torture/report.mjs');
	const MB = 1e6;
	const withConfirm = (name, confirm) => ({ name, isControl: name === 'idle', rows: [{ metric: 'listeners', first: 685, last: 685, delta: 0, sen: 0, floor: 0.4, z: 0, trend: 'flat' }], series: [{ listeners: 685 }, { listeners: 685 }], snapDiff: null, retReport: null, heapSnapshotFile: null, realmUnconfirmed: false, listenerReport: null, confirm });
	const run = (cycles) => ({ scenario: { name: 'studio' }, opts: { mode: 'within', k: 20, cpu: 4, confirmRealm: true }, cycles, calibrated: true, floorBasis: 'test', durationMs: 1000, generatedAt: '2026-07-21T00:00:00Z' });
	// A pinned verdict (net survived idle) + a reclaimable + an unavailable, all in one report.
	const obj = buildReport(run([
		withConfirm('compose', { verdict: 'pinned', before: 100 * MB, afterDrive: 200 * MB, afterIdle: 140 * MB, retained: 100 * MB, reclaimed: 60 * MB, net: 40 * MB, floorBytes: 4 * MB }),
		withConfirm('palette', { verdict: 'reclaimable', before: 30 * MB, afterDrive: 50 * MB, afterIdle: 32 * MB, retained: 20 * MB, reclaimed: 18 * MB, net: 2 * MB, floorBytes: 4 * MB }),
		withConfirm('insert', { unavailable: 'not crossOriginIsolated' }),
	]));
	assert.equal(obj.options.confirmRealm, true, 'options record the mode');
	const compose = obj.cycles.find((c) => c.name === 'compose');
	assert.equal(compose.confirm.verdict, 'pinned', 'pinned verdict in JSON');
	assert.equal(compose.confirm.netBytes, 40 * MB, 'net (the verdict driver) is in JSON');
	assert.equal(obj.cycles.find((c) => c.name === 'insert').confirm.unavailable, 'not crossOriginIsolated', 'unavailable passes through');
	const md = renderMarkdown(obj);
	assert.match(md, /confirm-realm/, 'markdown has the confirm section');
	assert.match(md, /PINNED\?/, 'the PINNED label is HEDGED (coarse single-shot), not asserted as fact');
	assert.match(md, /net keys the verdict|keys on \*\*net\*\*/i, 'the section explains it keys on net');
	assert.match(md, /RECLAIMABLE/, 'the reclaimable over-count is named');
	assert.match(md, /UNAVAILABLE/, 'the unavailable cycle is flagged, not silently dropped');
});
