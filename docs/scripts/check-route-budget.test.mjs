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
import { evaluateAllowance, evaluateRoute, HARD_HEADROOM_PCT, hardLimit, PR_ALLOWANCE_BYTES, rebaseline } from './check-route-budget.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const SLACK_PCT = 0.05;
const HARD_PCT = 0.03;
const budget = { eagerJsGz: 660_000, htmlRaw: 192_000 };
const hardJs = hardLimit(budget.eagerJsGz, HARD_PCT); // 679,800
const ev = (actual) => evaluateRoute('studio', actual, budget, SLACK_PCT, HARD_PCT);

describe('evaluateRoute', () => {
	it('passes silently at or under the soft target', () => {
		expect(ev({ eagerJsGz: 659_000, htmlRaw: 191_000 })).toEqual({ problems: [], warnings: [] });
		expect(ev({ eagerJsGz: 660_000, htmlRaw: 192_000 })).toEqual({ problems: [], warnings: [] });
	});

	it('PASSES with a warning between soft and hard, so a routine PR needs no ledger edit', () => {
		// This is the contention fix: before 2026-09-29 this measurement failed the build and
		// forced an edit to the one line every Studio PR shared.
		const r = ev({ eagerJsGz: 670_000, htmlRaw: 191_000 });
		expect(r.problems).toEqual([]);
		expect(r.warnings).toHaveLength(1);
		expect(r.warnings[0]).toMatch(/over its soft target/);
		expect(r.warnings[0]).toMatch(/left before the hard limit/);
	});

	it('passes exactly AT the hard limit and fails one byte past it', () => {
		expect(ev({ eagerJsGz: hardJs, htmlRaw: 191_000 }).problems).toEqual([]);
		const problems = ev({ eagerJsGz: hardJs + 1, htmlRaw: 191_000 }).problems;
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/EXCEEDS its hard limit/);
	});

	it('names the owner gate and the reset command when the hard limit is crossed', () => {
		const [p] = ev({ eagerJsGz: 700_000, htmlRaw: 191_000 }).problems;
		expect(p).toMatch(/owner/);
		expect(p).toMatch(/route-budget:rebaseline/);
		expect(p).toMatch(/route-budget\.json/);
	});

	it('FAILS when the HTML document exceeds its hard limit', () => {
		const { problems } = ev({ eagerJsGz: 659_000, htmlRaw: 250_000 });
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/htmlRaw/);
		expect(problems[0]).toMatch(/EXCEEDS/);
	});

	it('derives the hard limit from the soft target, 3% by default', () => {
		expect(HARD_HEADROOM_PCT).toBe(0.03);
		expect(hardLimit(637_490)).toBe(637_490 + 19_125);
		for (const soft of [80_000, 660_000, 5_000_000]) {
			expect(hardLimit(soft) - soft).toBe(Math.round(soft * 0.03));
		}
	});

	it('FAILS when a soft target has gone stale-loose, and says to ratchet it down', () => {
		const { problems } = ev({ eagerJsGz: 400_000, htmlRaw: 191_000 });
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/STALE/);
		expect(problems[0]).toMatch(/Ratchet it down/);
	});

	it('tolerates ordinary churn just inside the slack below soft', () => {
		const actual = {
			eagerJsGz: budget.eagerJsGz - Math.round(budget.eagerJsGz * SLACK_PCT) + 1,
			htmlRaw: budget.htmlRaw - Math.round(budget.htmlRaw * SLACK_PCT) + 1,
		};
		expect(ev(actual)).toEqual({ problems: [], warnings: [] });
	});

	it("scales the stale band with the budget, so a big route is not held to a small one's tolerance", () => {
		// 4% under is inside the band at any size; 6% under is outside it at any size.
		for (const cap of [100_000, 660_000, 5_000_000]) {
			const b = { eagerJsGz: cap, htmlRaw: cap };
			expect(evaluateRoute('r', { eagerJsGz: Math.round(cap * 0.96), htmlRaw: cap }, b, SLACK_PCT).problems).toEqual([]);
			expect(evaluateRoute('r', { eagerJsGz: Math.round(cap * 0.94), htmlRaw: cap }, b, SLACK_PCT).problems[0]).toMatch(/STALE/);
		}
	});

	it('the ratchet instruction names an EXACT byte value, not a rounded one', () => {
		// `600.0KB` written back into the ledger would fail on the very next run.
		expect(ev({ eagerJsGz: 400_000, htmlRaw: 191_000 }).problems[0]).toMatch(/Ratchet it down to 400000 /);
	});

	it('reports BOTH metrics when both drift', () => {
		expect(ev({ eagerJsGz: 700_000, htmlRaw: 250_000 }).problems).toHaveLength(2);
	});
});

describe('rebaseline', () => {
	const routes = { studio: { html: 's', eagerJsGz: 660_000, htmlRaw: 192_000 }, home: { html: 'h', eagerJsGz: 80_000, htmlRaw: 100_000 } };

	const measured = {
		studio: { eagerJsGz: 670_000, htmlRaw: 190_000 }, // over soft; inside the stale band
		home: { eagerJsGz: 70_000, htmlRaw: 100_000 }, // stale; exactly soft
	};

	it('lowers a stale target without --raise, and REFUSES the raise it would otherwise make', () => {
		// A routine stale-lowering run must not also raise a metric that happens to sit in
		// its warning band: raising needs the owner's OK.
		expect(rebaseline(routes, measured, { slackPct: SLACK_PCT })).toEqual({
			changes: [{ route: 'home', metric: 'eagerJsGz', from: 80_000, to: 70_000 }],
			refused: [{ route: 'studio', metric: 'eagerJsGz', from: 660_000, to: 670_000 }],
		});
	});

	it('applies the raise with --raise, and still leaves quiet metrics alone', () => {
		expect(rebaseline(routes, measured, { slackPct: SLACK_PCT, raise: true })).toEqual({
			changes: [
				{ route: 'studio', metric: 'eagerJsGz', from: 660_000, to: 670_000 },
				{ route: 'home', metric: 'eagerJsGz', from: 80_000, to: 70_000 },
			],
			refused: [],
		});
	});

	it('changes nothing when every route is inside its range', () => {
		const quiet = { studio: { eagerJsGz: 650_000, htmlRaw: 192_000 }, home: { eagerJsGz: 80_000, htmlRaw: 99_000 } };
		expect(rebaseline(routes, quiet, { slackPct: SLACK_PCT, raise: true })).toEqual({ changes: [], refused: [] });
	});
});

describe('evaluateAllowance (per-PR growth vs main)', () => {
	const base = { eagerJsGz: 600_000 };

	it('is 2KB, the number the owner set', () => {
		expect(PR_ALLOWANCE_BYTES).toBe(2048);
	});

	it('passes growth up to the allowance, inclusive, and reports the delta', () => {
		const r = evaluateAllowance('studio', { eagerJsGz: 602_048 }, base, false);
		expect(r.problems).toEqual([]);
		expect(r.lines[0]).toMatch(/\+2048 bytes vs main/);
	});

	it('FAILS one byte past the allowance when the PR adds no explanation file', () => {
		const [p] = evaluateAllowance('studio', { eagerJsGz: 602_049 }, base, false).problems;
		expect(p).toMatch(/over the per-PR allowance of 2048/);
		expect(p).toMatch(/route-budget\.d\/<slug>\.md/);
	});

	it('passes the same growth when the PR adds an explanation file', () => {
		expect(evaluateAllowance('studio', { eagerJsGz: 610_000 }, base, true).problems).toEqual([]);
	});

	it('never fails a PR that shrinks the route', () => {
		const r = evaluateAllowance('studio', { eagerJsGz: 590_000 }, base, false);
		expect(r.problems).toEqual([]);
		expect(r.lines[0]).toMatch(/-10000 bytes/);
	});

	it('checks nothing when main has no number for the route (a route this PR adds)', () => {
		expect(evaluateAllowance('new-route', { eagerJsGz: 50_000 }, undefined, false)).toEqual({ problems: [], lines: [] });
	});
});

describe('route-budget.json', () => {
	const ledger = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'route-budget.json'), 'utf8'));

	it('stores soft targets only — no hard limit a PR could raise by hand, and no per-route notes', () => {
		// Notes lived here as strings every raise prepended to; two PRs in flight always
		// conflicted on them. History lives in route-budget.history.md now.
		for (const [name, r] of Object.entries(ledger.routes)) {
			expect(Object.keys(r).sort(), name).toEqual(['eagerJsGz', 'html', 'htmlRaw']);
		}
	});

	it('keeps the reset anchor in the history file', () => {
		const history = fs.readFileSync(path.join(HERE, '..', 'route-budget.history.md'), 'utf8');
		expect(history).toContain('<!-- resets: newest first, below this line -->');
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
			expect(typeof r.eagerJsGz === 'number' || typeof r.htmlRaw === 'number', `${name} has no budget`).toBe(true);
		}
	});
});
