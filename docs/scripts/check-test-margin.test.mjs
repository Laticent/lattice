import { describe, expect, it } from 'vitest';
import { formatReport, marginReport } from './check-test-margin.mjs';

// The margin report is the only durable artifact #1324 leaves behind, so it has
// to be right about the one number that matters: how much of its budget a test
// is spending. These pin the reduction, not the prose.

const BUDGETS = { timeout: 20_000, slow: 5_000 };

function report(tests) {
	return {
		testResults: [
			{
				name: '/home/runner/work/lattice/lattice/docs/src/components/studio/StudioShell.test.tsx',
				assertionResults: tests,
			},
		],
	};
}

describe('marginReport', () => {
	it('ranks tests by duration and keeps the path relative to docs/', () => {
		const r = marginReport(
			report([
				{ title: 'quick', duration: 120, status: 'passed' },
				{ title: 'slow', duration: 6000, status: 'passed' },
			]),
			BUDGETS,
		);
		expect(r.tests.map((t) => t.name)).toEqual(['slow', 'quick']);
		expect(r.tests[0].file).toBe('src/components/studio/StudioShell.test.tsx');
	});

	it('counts what is within 2×/3×/4× of the budget — the number that predicted the flake', () => {
		const r = marginReport(
			report([
				{ title: 'at 11s — inside 2x', duration: 11_000, status: 'passed' },
				{ title: 'at 7s — inside 3x', duration: 7_000, status: 'passed' },
				{ title: 'at 5.1s — inside 4x', duration: 5_100, status: 'passed' },
				{ title: 'at 200ms — nowhere near', duration: 200, status: 'passed' },
			]),
			BUDGETS,
		);
		expect(r.within[2]).toBe(1);
		expect(r.within[3]).toBe(2);
		expect(r.within[4]).toBe(3);
	});

	it('flags a test that met the budget outright, so the caller can exit non-zero', () => {
		const r = marginReport(report([{ title: 'blown', duration: 20_000, status: 'failed' }]), BUDGETS);
		expect(r.overBudget).toHaveLength(1);
	});

	it('ignores skipped tests rather than counting them as 0 ms', () => {
		const r = marginReport(
			report([
				{ title: 'skipped', duration: 0, status: 'skipped' },
				{ title: 'ran', duration: 40, status: 'passed' },
			]),
			BUDGETS,
		);
		expect(r.tests).toHaveLength(1);
		expect(r.tests[0].name).toBe('ran');
	});

	it('survives a report with no test results at all', () => {
		const r = marginReport({}, BUDGETS);
		expect(r.tests).toEqual([]);
		expect(r.slowest).toEqual([]);
	});
});

describe('formatReport', () => {
	it('says so plainly when nothing is near the wall', () => {
		const md = formatReport(marginReport(report([{ title: 'quick', duration: 90, status: 'passed' }]), BUDGETS));
		expect(md).toContain('Nothing is close to the wall');
		expect(md).not.toContain('| Duration |');
	});

	it('tables the slow tests with their share of the budget', () => {
		const md = formatReport(marginReport(report([{ title: 'heavy render', duration: 10_000, status: 'passed' }]), BUDGETS));
		expect(md).toContain('heavy render');
		expect(md).toContain('10.0 s');
		expect(md).toContain('50%'); // 10s of a 20s budget
	});
});
