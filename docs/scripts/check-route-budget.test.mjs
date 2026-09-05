// Unit tests for the pure budget comparison behind scripts/check-route-budget.mjs.
// No build, no dist — plain numbers. (The docs test tier runs BEFORE `npm run build`,
// so a dist-dependent test here would silently skip in CI and gate nothing.)
//
// The property that matters is not "it reports a number". It is that the gate fails in
// BOTH directions: over budget (growth that must be reviewed where it happened) and far
// under it (a budget that has gone stale-loose, so a hard-won reduction cannot be
// silently re-spent). A gate that only catches one direction rots into a number nobody
// has to respect — which is exactly how the drift this gate exists to stop happened.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { evaluateRoute } from './check-route-budget.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const SLACK_PCT = 0.05;
const budget = { eagerJsGz: 660_000, htmlRaw: 192_000 };

describe('evaluateRoute', () => {
	it('passes a route sitting just inside its budget', () => {
		expect(evaluateRoute('studio', { eagerJsGz: 659_000, htmlRaw: 191_000 }, budget, SLACK_PCT)).toEqual([]);
	});

	it('FAILS when eager JS exceeds the budget, and names the file to edit', () => {
		const problems = evaluateRoute('studio', { eagerJsGz: 700_000, htmlRaw: 191_000 }, budget, SLACK_PCT);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/EXCEEDS its budget/);
		expect(problems[0]).toMatch(/route-budget\.json/);
	});

	it('FAILS when the HTML document exceeds the budget', () => {
		const problems = evaluateRoute('studio', { eagerJsGz: 659_000, htmlRaw: 250_000 }, budget, SLACK_PCT);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/htmlRaw/);
		expect(problems[0]).toMatch(/EXCEEDS/);
	});

	it('FAILS when a budget has gone stale-loose, and says to ratchet it down', () => {
		const problems = evaluateRoute('studio', { eagerJsGz: 400_000, htmlRaw: 191_000 }, budget, SLACK_PCT);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/STALE/);
		expect(problems[0]).toMatch(/Ratchet it down/);
	});

	it('tolerates ordinary churn just inside the slack, so routine PRs need no ledger edit', () => {
		const actual = {
			eagerJsGz: budget.eagerJsGz - Math.round(budget.eagerJsGz * SLACK_PCT) + 1,
			htmlRaw: budget.htmlRaw - Math.round(budget.htmlRaw * SLACK_PCT) + 1,
		};
		expect(evaluateRoute('studio', actual, budget, SLACK_PCT)).toEqual([]);
	});

	it('scales the stale band with the budget, so a big route is not held to a small one\'s tolerance', () => {
		// 4% under is inside the band at any size; 6% under is outside it at any size.
		for (const cap of [100_000, 660_000, 5_000_000]) {
			const b = { eagerJsGz: cap, htmlRaw: cap };
			expect(evaluateRoute('r', { eagerJsGz: Math.round(cap * 0.96), htmlRaw: cap }, b, SLACK_PCT)).toEqual([]);
			expect(evaluateRoute('r', { eagerJsGz: Math.round(cap * 0.94), htmlRaw: cap }, b, SLACK_PCT)[0]).toMatch(/STALE/);
		}
	});

	it('the ratchet instruction names an EXACT byte value, not a rounded one', () => {
		// `600.0KB` written back into the ledger would fail on the very next run.
		const problems = evaluateRoute('studio', { eagerJsGz: 400_000, htmlRaw: 191_000 }, budget, SLACK_PCT);
		expect(problems[0]).toMatch(/Ratchet it down to 400000 /);
	});

	it('reports BOTH metrics when both drift', () => {
		expect(evaluateRoute('studio', { eagerJsGz: 700_000, htmlRaw: 250_000 }, budget, SLACK_PCT)).toHaveLength(2);
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

	for (const config of ['../lighthouserc.cjs', '../lighthouserc.mobile.cjs']) {
		it(`matches ${config.replace('../', '')} exactly, in both directions`, () => {
			const urls = require(config).ci.collect.url;
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
			expect(typeof r.eagerJsGz === 'number' || typeof r.htmlRaw === 'number', `${name} has no budget`).toBe(true);
		}
	});
});
