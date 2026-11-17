// The Studio E2E nightly's time-balanced legs (docs/e2e/shard-plan.mjs) and the report parser that
// re-blesses their weights (docs/scripts/e2e-shard-bless.mjs). The property that matters is that every
// (project, spec) pair lands in exactly one leg: a pair in no leg is a test that silently never runs.
import assert from 'node:assert/strict';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const load = (rel) => import(pathToFileURL(path.join(root, rel)).href);

const projects = [{ name: 'desktop' }, { name: 'compose-default', testMatch: /(lessons|filo-[a-z-]+)\.spec\.ts$/ }, { name: 'webkit-tablet' }];
const specs = ['a.spec.ts', 'ba.spec.ts', 'filo-live.spec.ts', 'journeys/x.spec.ts', 'lessons.spec.ts', 'new.spec.ts'];
const weights = {
	'desktop|e2e/a.spec.ts': 120,
	'desktop|e2e/lessons.spec.ts': 370,
	'compose-default|e2e/lessons.spec.ts': 371,
	'webkit-tablet|e2e/filo-live.spec.ts': 200,
	'webkit-tablet|e2e/journeys/x.spec.ts': 90,
	'desktop|e2e/ba.spec.ts': 15,
};

test('every (project, spec) pair lands in exactly one leg, weighted or not', async () => {
	const { planLegs, pairKey } = await load('docs/e2e/shard-plan.mjs');
	for (const n of [1, 2, 3, 8]) {
		const legs = planLegs({ projects, specs, weights, n });
		assert.equal(legs.length, n);
		const all = legs.flatMap((l) => l.keys);
		assert.equal(new Set(all).size, all.length, `n=${n}: a pair is in two legs`);
		const expected = [];
		for (const p of projects) for (const s of specs) if (!p.testMatch || p.testMatch.test(s)) expected.push(pairKey(p.name, s));
		assert.deepEqual([...all].sort(), expected.sort(), `n=${n}: a pair is missing or invented`);
	}
});

test("a project's own testMatch narrows its pairs before dealing", async () => {
	const { planLegs } = await load('docs/e2e/shard-plan.mjs');
	const keys = planLegs({ projects, specs, weights, n: 2 }).flatMap((l) => l.keys);
	const compose = keys.filter((k) => k.startsWith('compose-default|')).sort();
	assert.deepEqual(compose, ['compose-default|e2e/filo-live.spec.ts', 'compose-default|e2e/lessons.spec.ts']);
});

test('weighted pairs balance by seconds; an unweighted pair keeps its leg when others are added', async () => {
	const { planLegs, hashLeg } = await load('docs/e2e/shard-plan.mjs');
	const legs = planLegs({ projects: [{ name: 'p' }], specs: ['a', 'b', 'c', 'd'].map((s) => `${s}.spec.ts`), weights: { 'p|e2e/a.spec.ts': 300, 'p|e2e/b.spec.ts': 200, 'p|e2e/c.spec.ts': 100, 'p|e2e/d.spec.ts': 100 }, n: 2 });
	// Longest first into the lighter leg: 300 | 200, then 100 joins the 200 (300 | 300), then the tie goes to leg 1.
	assert.deepEqual(legs.map((l) => l.load), [400, 300]);
	const k = 'p|e2e/new.spec.ts';
	const where = (extra) => planLegs({ projects: [{ name: 'p' }], specs: ['new.spec.ts', ...extra], weights: {}, n: 8 }).findIndex((l) => l.keys.includes(k));
	assert.equal(where([]), hashLeg(k, 8));
	assert.equal(where(['zz.spec.ts', 'aa.spec.ts']), hashLeg(k, 8));
});

test('specsRegExp matches exactly the listed spec paths, by whole file name', async () => {
	const { specsRegExp } = await load('docs/e2e/shard-plan.mjs');
	const re = specsRegExp(['a.spec.ts', 'journeys/x.spec.ts']);
	assert.ok(re.test('/w/docs/e2e/a.spec.ts'));
	assert.ok(re.test('C:\\w\\docs\\e2e\\journeys\\x.spec.ts'));
	assert.ok(!re.test('/w/docs/e2e/ba.spec.ts'), 'a suffix of another name must not match');
	assert.ok(!re.test('/w/docs/e2e/x.spec.ts'), 'the folder is part of the name');
	assert.ok(!specsRegExp([]).test('/w/docs/e2e/a.spec.ts'), 'an empty leg matches nothing');
});

test('the bless parser sums run tests per (project, spec) and skips what did not run', async () => {
	const { parseReport, medianWeights } = await load('docs/scripts/e2e-shard-bless.mjs');
	const text = [
		'  ✓    2 [webkit-phone] › e2e/strip-drag.spec.ts:188:1 › @webkit-phone a long press (11.9s)',
		'  ✓    3 [webkit-phone] › e2e/strip-drag.spec.ts:200:1 › Workspace › AI keeps it (1.1m)',
		'  ✘    4 [desktop] › e2e/journeys/x.spec.ts:5:3 › suite › fails (250ms)',
		'  -    5 [desktop] › e2e/journeys/x.spec.ts:9:3 › skipped one',
		'  396 passed (38.7m)',
	].join('\n');
	const got = parseReport(text);
	assert.deepEqual(Object.keys(got).sort(), ['desktop|e2e/journeys/x.spec.ts', 'webkit-phone|e2e/strip-drag.spec.ts']);
	assert.equal(Math.round(got['webkit-phone|e2e/strip-drag.spec.ts'] * 10) / 10, 77.9);
	assert.equal(got['desktop|e2e/journeys/x.spec.ts'], 0.25);
	assert.deepEqual(medianWeights([{ k: 10 }, { k: 30 }, { k: 20, j: 5 }]), { j: 5, k: 20 });
});

test('a testMatch the planner cannot read throws instead of widening the project', async () => {
	const { planLegs } = await load('docs/e2e/shard-plan.mjs');
	for (const testMatch of ['**/a.spec.ts', ['a.spec.ts'], /a\.spec\.ts$/g]) {
		assert.throws(() => planLegs({ projects: [{ name: 'p', testMatch }], specs, weights: {}, n: 2 }), /cannot read/);
	}
	// A project's own RegExp is tested on the absolute path, as Playwright tests it.
	const keys = planLegs({ projects: [{ name: 'p', testMatch: /[\\/]journeys[\\/]/ }], specs, weights: {}, n: 2, testDir: '/w/docs/e2e' }).flatMap((l) => l.keys);
	assert.deepEqual(keys, ['p|e2e/journeys/x.spec.ts']);
});

test('every test file Playwright would load is listed, not only *.spec.ts', async () => {
	const fs = await import('node:fs');
	const os = await import('node:os');
	const { listSpecs } = await load('docs/e2e/shard-plan.mjs');
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-shard-'));
	try {
		fs.mkdirSync(path.join(dir, 'journeys'));
		for (const f of ['a.spec.ts', 'b.spec.tsx', 'c.test.mjs', 'journeys/d.spec.js', 'helper.ts', 'fixture.json']) fs.writeFileSync(path.join(dir, f), '');
		assert.deepEqual(listSpecs(dir), ['a.spec.ts', 'b.spec.tsx', 'c.test.mjs', 'journeys/d.spec.js']);
	} finally {
		fs.rmSync(dir, { recursive: true, force: true });
	}
});

test('every leg carries an even share of every project, so one slow engine slows every leg alike', async () => {
	const { planLegs } = await load('docs/e2e/shard-plan.mjs');
	// One longest-first plan over ALL pairs gives desktop 100 + desktop 40 | webkit 70 + desktop 60 + webkit 30: both
	// webkit pairs in one leg. Per project, each leg gets one of them (desktop 100 + webkit 70 | desktop 60 + 40 + webkit 30).
	const projects = [{ name: 'desktop' }, { name: 'webkit-tablet' }];
	const specs = ['a.spec.ts', 'b.spec.ts', 'c.spec.ts'];
	const weights = { 'desktop|e2e/a.spec.ts': 100, 'desktop|e2e/b.spec.ts': 60, 'desktop|e2e/c.spec.ts': 40, 'webkit-tablet|e2e/a.spec.ts': 70, 'webkit-tablet|e2e/b.spec.ts': 30 };
	const legs = planLegs({ projects, specs, weights, n: 2 });
	for (const l of legs) assert.equal(l.keys.filter((k) => k.startsWith('webkit-tablet|') && weights[k]).length, 1, `webkit-tablet split evenly: ${l.keys.join(', ')}`);
	assert.deepEqual(legs.map((l) => l.load).sort((a, b) => a - b), [130, 170]);
});
