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
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
	CEILING_PCT,
	ceilingFor,
	evaluateAllowance,
	evaluateRoute,
	freeBytes,
	newestHistory,
	PR_ALLOWANCE_BYTES,
	parseDeclarations,
	rebaseline,
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
		expect(changes).toEqual([{ route: 'home', metric: 'eagerJsGz', from: 80_000, to: 70_000, hardFrom: 88_000, hardTo: 88_000 }]);
		expect(refused.map((c) => `${c.route}.${c.metric}`)).toEqual(['studio.eagerJsGz']);
	});

	it('raises soft with --raise but never past the ceiling without --ceiling', () => {
		const measured = { studio: { eagerJsGz: 710_000, htmlRaw: 192_000 }, home: { eagerJsGz: 80_000, htmlRaw: 100_000 } };
		expect(rebaseline(routes, measured, { slackPct: SLACK_PCT, raise: true }).changes).toEqual([]);
		const { changes } = rebaseline(routes, measured, { slackPct: SLACK_PCT, raise: true, ceiling: true });
		expect(changes).toEqual([{ route: 'studio', metric: 'eagerJsGz', from: 660_000, to: 710_000, hardFrom: 700_000, hardTo: ceilingFor(710_000) }]);
	});
});

describe('route-budget.json', () => {
	const ledger = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'route-budget.json'), 'utf8'));
	const history = fs.readFileSync(path.join(HERE, '..', 'route-budget.history.md'), 'utf8');

	it('holds a soft target and a ceiling per metric, and nothing else', () => {
		for (const [name, r] of Object.entries(ledger.routes)) {
			expect(Object.keys(r).sort(), name).toEqual(['eagerJsGz', 'html', 'htmlRaw']);
			for (const metric of ['eagerJsGz', 'htmlRaw']) {
				expect(Object.keys(r[metric]).sort(), `${name}.${metric}`).toEqual(['hard', 'soft']);
				expect(r[metric].hard, `${name}.${metric} ceiling`).toBeGreaterThanOrEqual(r[metric].soft);
			}
		}
	});

	it('matches the newest history row for every route and metric, so a hand edit fails', () => {
		// The red team raised a soft target by hand and the gate passed: hard followed soft,
		// and nothing tied the number to a recorded reset. Now every number must be the
		// newest row that `route-budget:rebaseline` wrote.
		const newest = newestHistory(history);
		for (const [name, r] of Object.entries(ledger.routes)) {
			for (const metric of ['eagerJsGz', 'htmlRaw']) {
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
