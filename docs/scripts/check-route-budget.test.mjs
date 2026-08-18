// Unit tests for the pure budget comparison behind scripts/check-route-budget.mjs.
// No build, no dist — plain numbers. (The docs test tier runs BEFORE `npm run build`,
// so a dist-dependent test here would silently skip in CI and gate nothing.)
//
// The property that matters is not "it reports a number". It is that the gate fails in
// BOTH directions: over budget (growth that must be reviewed where it happened) and far
// under it (a budget that has gone stale-loose, so a hard-won reduction cannot be
// silently re-spent). A gate that only catches one direction rots into a number nobody
// has to respect — which is exactly how the drift this gate exists to stop happened.

import { describe, expect, it } from 'vitest';
import { evaluateRoute } from './check-route-budget.mjs';

const SLACK = { eagerJsGz: 12 * 1024, htmlRaw: 20 * 1024 };
const budget = { eagerJsGz: 660_000, htmlRaw: 192_000 };

describe('evaluateRoute', () => {
	it('passes a route sitting just inside its budget', () => {
		expect(evaluateRoute('studio', { eagerJsGz: 659_000, htmlRaw: 191_000 }, budget, SLACK)).toEqual([]);
	});

	it('FAILS when eager JS exceeds the budget, and names the file to edit', () => {
		const problems = evaluateRoute('studio', { eagerJsGz: 700_000, htmlRaw: 191_000 }, budget, SLACK);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/EXCEEDS its budget/);
		expect(problems[0]).toMatch(/route-budget\.json/);
	});

	it('FAILS when the HTML document exceeds the budget', () => {
		const problems = evaluateRoute('studio', { eagerJsGz: 659_000, htmlRaw: 250_000 }, budget, SLACK);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/htmlRaw/);
		expect(problems[0]).toMatch(/EXCEEDS/);
	});

	it('FAILS when a budget has gone stale-loose, and says to ratchet it down', () => {
		const problems = evaluateRoute('studio', { eagerJsGz: 400_000, htmlRaw: 191_000 }, budget, SLACK);
		expect(problems).toHaveLength(1);
		expect(problems[0]).toMatch(/STALE/);
		expect(problems[0]).toMatch(/Ratchet it down/);
	});

	it('tolerates ordinary churn just inside the slack, so routine PRs need no ledger edit', () => {
		const actual = { eagerJsGz: budget.eagerJsGz - SLACK.eagerJsGz + 1, htmlRaw: budget.htmlRaw - SLACK.htmlRaw + 1 };
		expect(evaluateRoute('studio', actual, budget, SLACK)).toEqual([]);
	});

	it('reports BOTH metrics when both drift', () => {
		expect(evaluateRoute('studio', { eagerJsGz: 700_000, htmlRaw: 250_000 }, budget, SLACK)).toHaveLength(2);
	});
});
