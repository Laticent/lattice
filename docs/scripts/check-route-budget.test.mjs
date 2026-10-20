// Unit tests for the pure budget comparison behind scripts/check-route-budget.mjs.
// No build, no dist — plain numbers. (The docs test tier runs BEFORE `npm run build`,
// so a dist-dependent test here would silently skip in CI and gate nothing.)
//
// The property that matters is not "it reports a number". It is that the gate fails in
// BOTH directions: past the hard limit (growth that must be reviewed where it happened)
// and far under the soft target (a stale-loose budget, so a hard-won reduction cannot be
// silently re-spent). A gate that only catches one direction rots into a number nobody
// has to respect. Between soft and hard it only WARNS, which is what keeps routine PRs
// off the one ledger line every Studio PR used to edit.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
	CEILING_PCT,
	ceilingFor,
	evaluateAllowance,
	evaluateRoute,
	freeBytes,
	grewFiles,
	LAZY_BUDGET_ROUTE,
	METRICS,
	measure,
	newestHistory,
	PR_ALLOWANCE_BYTES,
	parseDeclarations,
	rebaseline,
	withFixedHashes,
} from './check-route-budget.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const SLACK_PCT = 0.05;
const budget = { eagerJsGz: { soft: 660_000, hard: 700_000 }, htmlRaw: { soft: 192_000, hard: 200_000 } };
const ev = (actual) => evaluateRoute('studio', actual, budget, SLACK_PCT);

describe('evaluateRoute', () => {
	it('passes silently at or under the soft target', () => {
		expect(ev({ eagerJsGz: 660_000, htmlRaw: 191_000 })).toEqual({ problems: [], warnings: [] });
	});

	it('PASSES with a warning between soft and the ceiling', () => {
		const r = ev({ eagerJsGz: 680_000, htmlRaw: 191_000 });
		expect(r.problems).toEqual([]);
		expect(r.warnings[0]).toMatch(/over its soft target/);
	});

	it('passes exactly AT the ceiling and fails one byte past it, naming the owner', () => {
		expect(ev({ eagerJsGz: 700_000, htmlRaw: 191_000 }).problems).toEqual([]);
		const [p] = ev({ eagerJsGz: 700_001, htmlRaw: 191_000 }).problems;
		expect(p).toMatch(/EXCEEDS its ceiling/);
		expect(p).toMatch(/owner/);
	});

	it('FAILS a stale soft target and names the exact byte value to ratchet to', () => {
		const [p] = ev({ eagerJsGz: 400_000, htmlRaw: 191_000 }).problems;
		expect(p).toMatch(/STALE/);
		expect(p).toMatch(/Ratchet it down to 400000 /);
	});

	it('tolerates churn just inside the stale slack', () => {
		const got = 660_000 - Math.round(660_000 * SLACK_PCT) + 1;
		expect(ev({ eagerJsGz: got, htmlRaw: 192_000 })).toEqual({ problems: [], warnings: [] });
	});

	it('reports BOTH metrics when both are past their ceilings', () => {
		expect(ev({ eagerJsGz: 800_000, htmlRaw: 250_000 }).problems).toHaveLength(2);
	});
});

describe('the numbers the owner set', () => {
	it('starts a ceiling 10% above soft and gives a PR 2KB of free growth', () => {
		expect(CEILING_PCT).toBe(0.1);
		expect(ceilingFor(631_314)).toBe(631_314 + 63_131);
		expect(PR_ALLOWANCE_BYTES).toBe(2048);
	});
});

describe('per-PR allowance', () => {
	it('is free only while the route stays at or under soft', () => {
		expect(freeBytes(600_000, 700_000)).toBe(2048); // far under soft
		expect(freeBytes(699_000, 700_000)).toBe(1000); // only the part up to soft
		expect(freeBytes(710_000, 700_000)).toBe(0); // already over soft: nothing is free
	});

	it('passes growth inside the free bytes without a declaration', () => {
		expect(evaluateAllowance('studio', { eagerJsGz: 602_048 }, { eagerJsGz: 600_000 }, 700_000).problems).toEqual([]);
	});

	it('FAILS one byte past the free bytes, and names the exact line to declare', () => {
		const [p] = evaluateAllowance('studio', { eagerJsGz: 602_049 }, { eagerJsGz: 600_000 }, 700_000).problems;
		expect(p).toMatch(/`studio: \+1`/);
	});

	it('charges EVERY byte once the route is over soft (the red team\'s 2KB-at-a-time fill)', () => {
		const [p] = evaluateAllowance('studio', { eagerJsGz: 710_500 }, { eagerJsGz: 710_000 }, 700_000).problems;
		expect(p).toMatch(/`studio: \+500`/);
	});

	it('passes when the declaration covers what is owed, and not when it falls short', () => {
		const args = ['studio', { eagerJsGz: 610_000 }, { eagerJsGz: 600_000 }, 700_000];
		expect(evaluateAllowance(...args, 7_952).problems).toEqual([]);
		expect(evaluateAllowance(...args, 7_951).problems).toHaveLength(1);
	});

	it('never fails a PR that shrinks the route', () => {
		expect(evaluateAllowance('studio', { eagerJsGz: 590_000 }, { eagerJsGz: 600_000 }, 700_000).problems).toEqual([]);
	});

	test('an overage names the files that grew, so a byte nobody wrote has an address (followup 2749-p3)', () => {
		const base = { eagerJsGz: 600_000, eagerFiles: { '_astro/studio.00000000.js': 500_000, '_astro/shared.00000000.js': 100_000 } };
		const actual = { eagerJsGz: 602_100, eagerFiles: { '_astro/studio.00000000.js': 500_000, '_astro/shared.00000000.js': 102_069, '_astro/new.00000000.js': 31 } };
		const r = evaluateAllowance('studio', actual, base, 700_000);
		expect(r.problems[0]).toContain('Grew most (gzip bytes, hashes fixed): _astro/shared.00000000.js +2069, _astro/new.00000000.js +31.');
		expect(r.line).toContain('(_astro/shared.00000000.js +2069, _astro/new.00000000.js +31)');
		// A base measured before the field existed names nothing, and still gates.
		expect(evaluateAllowance('studio', { eagerJsGz: 602_100 }, { eagerJsGz: 600_000 }, 700_000).problems[0]).not.toContain('Grew most');
	});

	test('grewFiles ranks by size of change, counts a file one side lacks in full, and skips unchanged files', () => {
		expect(grewFiles({ a: 10, b: 5, c: 7 }, { a: 10, b: 9, d: 3 })).toEqual(['c +7', 'b -4', 'd -3']);
		expect(grewFiles(undefined, { a: 1 })).toEqual([]);
	});
});

describe('parseDeclarations', () => {
	it('reads per-route byte lines and needs a reason besides them', () => {
		expect(parseDeclarations('studio: +5123\nhome: +40\nThe card-tag rows ship eager.')).toEqual({ studio: 5123, home: 40 });
		expect(parseDeclarations('- `studio: +10`\n- `studio: +5`\nTwo features.')).toEqual({ studio: 15 });
	});

	it('gives a bare rubber stamp nothing: no reason, or no numbers', () => {
		expect(parseDeclarations('studio: +99999')).toEqual({});
		expect(parseDeclarations('x')).toEqual({});
	});
});

describe('rebaseline', () => {
	const routes = {
		studio: { html: 's', eagerJsGz: { soft: 660_000, hard: 700_000 }, htmlRaw: { soft: 192_000, hard: 200_000 } },
		home: { html: 'h', eagerJsGz: { soft: 80_000, hard: 88_000 }, htmlRaw: { soft: 100_000, hard: 110_000 } },
	};

	it('lowers a stale target on its own and refuses a raise without --raise', () => {
		const measured = { studio: { eagerJsGz: 670_000, htmlRaw: 190_000 }, home: { eagerJsGz: 70_000, htmlRaw: 100_000 } };
		const { changes, refused } = rebaseline(routes, measured, { slackPct: SLACK_PCT });
		// The banked win pulls the ceiling down to 10% above the new soft target.
		expect(changes).toEqual([{ route: 'home', metric: 'eagerJsGz', from: 80_000, to: 70_000, hardFrom: 88_000, hardTo: ceilingFor(70_000) }]);
		expect(refused.map((c) => `${c.route}.${c.metric}`)).toEqual(['studio.eagerJsGz']);
	});

	it('raises soft with --raise but never past the ceiling without --ceiling', () => {
		const measured = { studio: { eagerJsGz: 710_000, htmlRaw: 192_000 }, home: { eagerJsGz: 80_000, htmlRaw: 100_000 } };
		expect(rebaseline(routes, measured, { slackPct: SLACK_PCT, raise: true }).changes).toEqual([]);
		const { changes } = rebaseline(routes, measured, { slackPct: SLACK_PCT, raise: true, ceiling: true });
		expect(changes).toEqual([{ route: 'studio', metric: 'eagerJsGz', from: 660_000, to: 710_000, hardFrom: 700_000, hardTo: ceilingFor(710_000) }]);
	});

	it('adopts a metric the route has no budget for as a raise from 0, and skips one it does not ship', () => {
		const measured = { studio: { eagerJsGz: 660_000, engineJsGz: 900_000, htmlRaw: 192_000 }, home: { eagerJsGz: 80_000, engineJsGz: 0, htmlRaw: 100_000 } };
		expect(rebaseline(routes, measured, { slackPct: SLACK_PCT }).refused.map((c) => `${c.route}.${c.metric}`)).toEqual(['studio.engineJsGz']);
		const { changes } = rebaseline(routes, measured, { slackPct: SLACK_PCT, raise: true, ceiling: true });
		expect(changes).toEqual([{ route: 'studio', metric: 'engineJsGz', from: 0, to: 900_000, hardFrom: 0, hardTo: ceilingFor(900_000) }]);
		expect(routes.studio.engineJsGz, 'rebaseline stays pure').toBeUndefined();
	});
});

// The lazy metrics on a fixture dist: small, built here, no real build needed.
describe('the lazy metrics', () => {
	const gz = (s) => zlib.gzipSync(Buffer.from(s), { level: 6 }).length;
	function fixture({ lint = true, kernels = true } = {}) {
		const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'route-budget-'));
		const put = (rel, text) => {
			fs.mkdirSync(path.dirname(path.join(dist, rel)), { recursive: true });
			fs.writeFileSync(path.join(dist, rel), text);
		};
		const esm = 'playground/v/abc123/esm';
		put('studio/index.html', `<script type="module" src="/_astro/app.x.js"></script><script src="/${esm}/engine.js"></script>`);
		put('_astro/app.x.js', 'import"./shared.x.js";');
		put('_astro/shared.x.js', 'export const s="shared";');

		put(`${esm}/engine.js`, 'import"./chunk-core.js";');
		put(`${esm}/chunk-core.js`, 'export const core="engine";');
		if (lint) put(`${esm}/lint.js`, 'import"./chunk-core.js";import"./chunk-md.js";export const lint=1;');
		put(`${esm}/chunk-md.js`, 'export const md="only the lint core loads me";');
		if (kernels) {
			put(`${esm}/chart-small.js`, 'import"./chunk-core.js";export const k=1;');
			put(`${esm}/chart-big.js`, 'import"./chunk-core.js";import"./chunk-big.js";export const k=2;');
			// Random, so gzip cannot shrink it: chart-big stays the largest when chart-small grows.
			put(`${esm}/chunk-big.js`, `export const big=${JSON.stringify(Array.from({ length: 40 }, () => Math.random().toString(36).slice(2)).join(''))};`);
		}
		return dist;
	}

	it('counts the largest kernel and the lint core beyond what the route already loaded', () => {
		const dist = fixture();
		const m = measure(LAZY_BUDGET_ROUTE, 'studio/index.html', dist);
		const read = (rel) => fs.readFileSync(path.join(dist, rel), 'utf8');
		const esm = 'playground/v/abc123/esm';
		expect(m.chartKernel).toBe('chart-big.js');
		expect(m.chartKernelGz).toBe(gz(read(`${esm}/chart-big.js`)) + gz(read(`${esm}/chunk-big.js`)));
		expect(m.lintCoreGz).toBe(gz(read(`${esm}/lint.js`)) + gz(read(`${esm}/chunk-md.js`)));
		// The union counts every kernel and every chunk beyond the engine once; chunk-core is the engine's.
		expect(m.chartKernelsGz).toBe(gz(read(`${esm}/chart-big.js`)) + gz(read(`${esm}/chunk-big.js`)) + gz(read(`${esm}/chart-small.js`)));
	});

	it('fails the union when a kernel that is NOT the largest grows, which the largest alone cannot see', () => {
		// The mutation note §11 names: grow chart-small by a chunk of its own, still well under
		// chart-big. chartKernelGz does not move; chartKernelsGz does, and past a 10% ceiling.
		const dist = fixture();
		const esm = 'playground/v/abc123/esm';
		const before = measure(LAZY_BUDGET_ROUTE, 'studio/index.html', dist);
		const ledger = { chartKernelGz: { soft: before.chartKernelGz, hard: ceilingFor(before.chartKernelGz) }, chartKernelsGz: { soft: before.chartKernelsGz, hard: ceilingFor(before.chartKernelsGz) } };
		fs.writeFileSync(path.join(dist, `${esm}/chart-small.js`), 'import"./chunk-core.js";import"./chunk-grow.js";export const k=1;');
		// Incompressible and well past 10% of the union, so a zlib change cannot move the verdict.
		fs.writeFileSync(path.join(dist, `${esm}/chunk-grow.js`), `export const g=${JSON.stringify(Array.from({ length: 20 }, () => Math.random().toString(36).slice(2)).join(''))};`);
		const after = measure(LAZY_BUDGET_ROUTE, 'studio/index.html', dist);
		expect(after.chartKernel).toBe('chart-big.js');
		expect(after.chartKernelGz).toBe(before.chartKernelGz);
		const { problems } = evaluateRoute(LAZY_BUDGET_ROUTE, after, ledger);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/chartKernelsGz.*EXCEEDS its ceiling/);
	});

	it('measures them on the lazy budget route only', () => {
		const m = measure('home', 'studio/index.html', fixture());
		for (const metric of ['chartKernelGz', 'chartKernelsGz', 'lintCoreGz']) expect(m).not.toHaveProperty(metric);
	});

	it('throws, rather than reporting zero, when the lint core or the kernels are gone', () => {
		expect(() => measure(LAZY_BUDGET_ROUTE, 'studio/index.html', fixture({ lint: false }))).toThrow(/lint\.js is missing/);
		expect(() => measure(LAZY_BUDGET_ROUTE, 'studio/index.html', fixture({ kernels: false }))).toThrow(/no chart-\*\.js kernels/);
	});

	it('throws when the engine imports a chart kernel statically, rather than banking a fake win', () => {
		const dist = fixture();
		fs.writeFileSync(path.join(dist, 'playground/v/abc123/esm/engine.js'), 'import"./chunk-core.js";import"./chart-small.js";');
		expect(() => measure(LAZY_BUDGET_ROUTE, 'studio/index.html', dist)).toThrow(/chart-small\.js statically.*back on startup/);
	});

	it('throws when the engine imports the lint core statically, rather than banking a fake win', () => {
		const dist = fixture();
		fs.writeFileSync(path.join(dist, 'playground/v/abc123/esm/engine.js'), 'import"./chunk-core.js";import"./lint.js";');
		expect(() => measure(LAZY_BUDGET_ROUTE, 'studio/index.html', dist)).toThrow(/back on startup/);
	});
});

describe('route-budget.json', () => {
	const ledger = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'route-budget.json'), 'utf8'));
	const history = fs.readFileSync(path.join(HERE, '..', 'route-budget.history.md'), 'utf8');

	it('holds a soft target and a ceiling per metric, and nothing else', () => {
		for (const [name, r] of Object.entries(ledger.routes)) {
			// The lazy metrics live on LAZY_BUDGET_ROUTE alone (check-route-budget.mjs says why).
			const lazy = name === LAZY_BUDGET_ROUTE ? ['chartKernelGz', 'chartKernelsGz', 'lintCoreGz'] : [];
			expect(Object.keys(r).sort(), name).toEqual(['eagerJsGz', 'engineJsGz', 'html', 'htmlRaw', ...lazy].sort());
			for (const metric of METRICS.filter((m) => m in r)) {
				expect(Object.keys(r[metric]).sort(), `${name}.${metric}`).toEqual(['hard', 'soft']);
				expect(r[metric].hard, `${name}.${metric} ceiling`).toBeGreaterThanOrEqual(r[metric].soft);
			}
		}
	});

	it('matches the newest history row for every route and metric, so a ledger-only hand edit fails', () => {
		// The red team raised a soft target by hand and the gate passed: hard followed soft,
		// and nothing tied the number to a recorded reset. Now every number must be the
		// newest row that `route-budget:rebaseline` wrote.
		const newest = newestHistory(history);
		for (const [name, r] of Object.entries(ledger.routes)) {
			for (const metric of METRICS.filter((m) => m in r)) {
				expect(r[metric], `${name}.${metric} vs route-budget.history.md`).toEqual(newest[`${name}.${metric}`]);
			}
		}
	});
});

// ── The ledger must cover every route the nightly measures ────────────────────
//
// WHY THIS ARM EXISTS. `script-size` was deleted from perf-nightly.yml on 2026-09-05
// because it summed Lighthouse network records — it measured what happened to LOAD
// during a visit, not what the build produced, and 35% of 140 repeat readings of an
// IDENTICAL commit moved past its own 3% tolerance. The three routes generating that
// noise (`/`, `/components/`, `/getting-started/`) joined this ledger in the same
// change, so the deterministic per-PR gate covers what the nightly stopped watching.
//
// That coverage is only true on the day it is written. A route added to the Lighthouse
// url list and not to the ledger is watched by nothing deterministic; a route in the
// ledger and not in the url list is a budget on a page nobody profiles. So the SET
// equality is pinned, in BOTH directions, against the real config files — not a copy.
// This is the same shape as the nightly-liveness watch list: an inventory that rots
// silently is worse than no inventory.
//
// Joined on the built HTML path rather than the route KEY, so renaming a ledger key is
// free and only a real coverage change fails.
describe('ledger coverage of the perf-nightly url list', () => {
	const ledger = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'route-budget.json'), 'utf8'));

	// '/components/' -> 'components/index.html'; '/' -> 'index.html'.
	// A path that already names a FILE ('/404.html') maps to itself, not to
	// '404.html/index.html' — which would be a ledger entry the test accepts and
	// measure() then dies on with a bare ENOENT instead of its own "the build is
	// broken, not smaller" message.
	const htmlForUrl = (u) => {
		const p = new URL(u).pathname.replace(/^\/|\/$/g, '');
		if (/\.html?$/.test(p)) return p;
		return p ? `${p}/index.html` : 'index.html';
	};

	const budgeted = new Set(Object.values(ledger.routes).map((r) => r.html));

	// Loop over BASENAMES and build the require path, rather than carrying '../' and
	// stripping it back off for the test name. `String.replace` with a string pattern
	// removes only the FIRST occurrence, which CodeQL flags as incomplete escaping —
	// harmless on a hardcoded literal, but the wrong shape, and not carrying the prefix
	// in the first place is simpler than removing it.
	for (const config of ['lighthouserc.cjs', 'lighthouserc.mobile.cjs']) {
		it(`matches ${config} exactly, in both directions`, () => {
			const urls = require(`../${config}`).ci.collect.url;
			const measured = new Set(urls.map(htmlForUrl));
			expect([...measured].sort()).toEqual([...budgeted].sort());
		});
	}

	it('maps every URL shape the config could carry', () => {
		expect(htmlForUrl('http://h/')).toBe('index.html');
		expect(htmlForUrl('http://h/components/')).toBe('components/index.html');
		expect(htmlForUrl('http://h/components')).toBe('components/index.html');
		expect(htmlForUrl('http://h/a/b/')).toBe('a/b/index.html');
		expect(htmlForUrl('http://h/x/?q=1')).toBe('x/index.html');
		expect(htmlForUrl('http://h/x#frag')).toBe('x/index.html');
		// The shapes the first cut got wrong: a path that already names a file.
		expect(htmlForUrl('http://h/404.html')).toBe('404.html');
		expect(htmlForUrl('http://h/components/index.html')).toBe('components/index.html');
	});

	it('gives every budgeted route at least one metric to enforce', () => {
		// A route entry carrying neither metric passes vacuously — evaluateRoute skips a
		// metric with no numeric budget — so it would read as covered while gating nothing.
		for (const [name, r] of Object.entries(ledger.routes)) {
			expect(typeof r.eagerJsGz?.soft === 'number' || typeof r.htmlRaw?.soft === 'number', `${name} has no budget`).toBe(true);
		}
	});
});

// The hashes that move with any engine change (followups.d/2718-p5). A real build puts the asset
// version in two chunks only, and renames those chunks; the rename cascades through every chunk
// that imports them. These routes model that: same code, different hashes.
describe('the hashes an engine change moves', () => {
	const ver = (hex) => `/playground/v/${hex}/`;
	// `hashes` = [app, door, shared] chunk hashes; the door carries the asset version.
	function route({ hex, hashes, extra = '' }) {
		const [app, door, shared] = hashes;
		const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'route-budget-v-'));
		fs.mkdirSync(path.join(dist, '_astro'), { recursive: true });
		fs.mkdirSync(path.join(dist, 'studio'), { recursive: true });
		fs.writeFileSync(path.join(dist, 'studio/index.html'), `<script type="module" src="/_astro/app.${app}.js"></script>`);
		fs.writeFileSync(path.join(dist, `_astro/app.${app}.js`), `import"./shared.${shared}.js";const door=()=>import("./door.${door}.js");export{door}${extra}`);
		fs.writeFileSync(path.join(dist, `_astro/shared.${shared}.js`), `import"./leaf.js";export const s=1;`);
		fs.writeFileSync(path.join(dist, '_astro/leaf.js'), 'export const l=1;');
		fs.writeFileSync(path.join(dist, `_astro/door.${door}.js`), `export const base="${ver(hex)}";`);
		return dist;
	}
	const A = { hex: 'aaaaaaaaaaaa', hashes: ['aaaaaaaa', 'aaaaaaaa', 'aaaaaaaa'] };
	const B = { hex: '9f3e1c7a2b64', hashes: ['_HQlLF-y', 'AbCdEfGh', 'Cb-C8llU'] };

	it('measures two builds that differ only in those hashes at the same size', () => {
		const a = measure('home', 'studio/index.html', route(A));
		const b = measure('home', 'studio/index.html', route(B));
		expect(b.eagerJsGz).toBe(a.eagerJsGz);
		expect(a.eagerJsGz).toBeGreaterThan(0);
	});

	it('still sees a real change beside them', () => {
		const a = measure('home', 'studio/index.html', route(A));
		const noise = Array.from({ length: 30 }, () => Math.random().toString(36).slice(2)).join('');
		const b = measure('home', 'studio/index.html', route({ ...B, extra: `;const n="${noise}"` }));
		expect(b.eagerJsGz - a.eagerJsGz).toBeGreaterThan(100);
	});

	it('fixes esbuild engine chunk names, which have a hyphen and no leading dot', () => {
		const src = Buffer.from('import"./chunk-3MJJUJ6G.js";import"./chunk-3MJJUJ6GX.js";import"./chunk-short.js";import"./chunk-abcdefgh.js";import"./chunk-3MJJUJ6G.json";import"./chunk-3MJJUJ6G.js-x"', 'utf8');
		expect(withFixedHashes(src).toString()).toBe('import"./chunk-00000000.js";import"./chunk-3MJJUJ6GX.js";import"./chunk-short.js";import"./chunk-abcdefgh.js";import"./chunk-3MJJUJ6G.json";import"./chunk-3MJJUJ6G.js-x"');
	});

	it('measures an engine whose chunk names changed at the same size', () => {
		const build = (a, b) => {
			const dist = fs.mkdtempSync(path.join(os.tmpdir(), 'route-budget-e-'));
			const esm = path.join(dist, 'playground/v/aaaaaaaaaaaa/esm');
			fs.mkdirSync(esm, { recursive: true });
			fs.mkdirSync(path.join(dist, 'studio'), { recursive: true });
			fs.writeFileSync(path.join(dist, 'studio/index.html'), '<script src="/playground/v/aaaaaaaaaaaa/esm/engine.js"></script>');
			fs.writeFileSync(path.join(esm, 'engine.js'), `import"./chunk-${a}.js";import"./chunk-${b}.js";`);
			fs.writeFileSync(path.join(esm, `chunk-${a}.js`), 'export const a=1;');
			fs.writeFileSync(path.join(esm, `chunk-${b}.js`), 'export const b=2;');
			return dist;
		};
		const x = measure('home', 'studio/index.html', build('AAAAAAAA', 'AAAAAAAA'.replace(/A/g, 'B')));
		const y = measure('home', 'studio/index.html', build('3MJJUJ6G', '47LLA435'));
		expect(y.engineJsGz).toBe(x.engineJsGz);
		expect(x.engineJsGz).toBeGreaterThan(0);
	});

	it('rewrites only the 12-hex version and the 8-character chunk hash, and keeps the length', () => {
		const src = Buffer.from(`import"./a.Cp3wbWjU.js";x="${ver('abcdef012345')}";y="${ver('abc')}z";w="./a.Cp3wbWjUx.js";v="a.b.js"`, 'utf8');
		const out = withFixedHashes(src).toString();
		expect(out.length).toBe(src.length);
		expect(out).toBe(`import"./a.00000000.js";x="${ver('000000000000')}";y="${ver('abc')}z";w="./a.Cp3wbWjUx.js";v="a.b.js"`);
	});
});
