// How close is the docs suite running to its own timeouts?
//
// WHY: #1324. The docs suite's flakiness was never a race in the product — it
// was tests doing 1–2 s of real work against a 5 s budget, killed at random by
// whichever ones happened to be scheduled against peak contention. Raising the
// budgets (docs/test-budgets.js) fixes today's instance. This reports the
// CONDITION, so the class is visible while there is still margin rather than
// the morning a required check starts coin-flipping again: a test that has
// crept up to half its budget is one refactor away from being the next #1324.
//
// REPORT-ONLY, ON PURPOSE. This never fails a build. Per-test durations are
// measured while the suite competes with itself, so they swing run to run —
// ratcheting a gate on that number would reintroduce exactly the nondeterminism
// this whole issue is about. No FINDING here ever fails a build; the only
// non-zero exit is the usage error of being pointed at a report that isn't
// there, which is a broken invocation rather than a verdict on the suite. If a
// nightly streak ever shows the numbers are stable enough to gate, that is the
// moment to add one — never on hope (the same rule the @smoke e2e subset is
// held to, engineering/decisions/2026-06-28-experience-gating-playwright.md §3).
//
// Usage:
//   npm run test:report                       # runs the suite, writes the JSON
//   node scripts/check-test-margin.mjs        # reads it, prints the table
//   node scripts/check-test-margin.mjs --md report.md   # + markdown, for a nightly

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SLOW_TEST_MS, TEST_TIMEOUT_MS } from '../test-budgets.js';

const DOCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPORT = path.join(DOCS, '.vitest-report.json');

/**
 * Reduce a vitest JSON report to the margin picture.
 *
 * Pure — takes the parsed report and the budgets, returns data. The caller does
 * the I/O, so the test can exercise this against a fixture without a suite run.
 *
 * @param {{ testResults?: Array<{ name: string, assertionResults?: Array<{ title: string, duration?: number, status: string }> }> }} report
 * @param {{ timeout?: number, slow?: number }} [budgets]
 */
export function marginReport(report, budgets = {}) {
	const timeout = budgets.timeout ?? TEST_TIMEOUT_MS;
	const slow = budgets.slow ?? SLOW_TEST_MS;

	const tests = (report.testResults ?? []).flatMap((file) =>
		(file.assertionResults ?? [])
			// A skipped/todo test has no duration to speak of; counting it as 0 ms
			// would flatter the report.
			.filter((a) => a.status === 'passed' || a.status === 'failed')
			.map((a) => ({
				file: file.name.replace(/.*\/docs\//, ''),
				name: a.title,
				ms: Math.round(a.duration ?? 0),
				status: a.status,
			})),
	);
	tests.sort((a, b) => b.ms - a.ms);

	const slowest = tests.filter((t) => t.ms >= slow);
	// PASSED only. A test that ran past the budget and passed is one carrying its own
	// longer per-test timeout, which is what the report says about this set. A test that
	// ran past it and FAILED is just the suite failing, and lumping the two together made
	// the report state "ran past 20 s and still passed" about a test that had died —
	// wrong exactly on the run a human opens the report to read.
	const overBudget = tests.filter((t) => t.ms >= timeout && t.status === 'passed');
	// How many tests sit within Nx of the wall — the number that actually predicted
	// #1324. Measured on the pre-fix run: 26 of all tests, or 20 once the six carrying
	// their own longer timeouts are set aside, which is the figure test-budgets.js cites.
	const within = Object.fromEntries([2, 3, 4].map((f) => [f, tests.filter((t) => t.ms * f >= timeout).length]));

	return { tests, slowest, overBudget, within, timeout, slow };
}

/** Render the report as markdown — the body a nightly can post verbatim. */
export function formatReport(r) {
	const pct = (t) => ((t.ms / r.timeout) * 100).toFixed(0);
	const lines = [
		`## Docs suite timeout margin`,
		'',
		`${r.tests.length} tests measured against a ${(r.timeout / 1000).toFixed(0)} s per-test budget.`,
		'',
		`- within 2× of the budget: **${r.within[2]}**`,
		`- within 3× of the budget: **${r.within[3]}**`,
		`- within 4× of the budget: **${r.within[4]}**`,
		'',
	];
	if (r.slowest.length === 0) {
		lines.push(`No test reached ${(r.slow / 1000).toFixed(0)} s. Nothing is close to the wall.`, '');
		return lines.join('\n');
	}
	lines.push(
		`### Tests at or above ${(r.slow / 1000).toFixed(0)} s`,
		'',
		'A test here is not failing — it is spending enough of its budget that contention on a loaded runner could still reach it. That is the condition #1324 was, before it was a red gate.',
		'',
		'| Duration | % of budget | Test |',
		'|---:|---:|---|',
		...r.slowest.map((t) => `| ${(t.ms / 1000).toFixed(1)} s | ${pct(t)}% | \`${t.file}\` › ${t.name} |`),
		'',
	);
	if (r.overBudget.length > 0) {
		lines.push(
			`### Above the default budget`,
			'',
			`${r.overBudget.length} test(s) ran past ${(r.timeout / 1000).toFixed(0)} s and still passed, so each carries its own longer per-test timeout (the \`}, 60_000)\` third argument, or \`{ timeout: … }\`). That is legitimate for genuinely long tests — a fuzz property run is not a render assertion — but it does mean the shared budget is not protecting them.`,
			'',
		);
	}
	return lines.join('\n');
}

function main() {
	const argv = process.argv.slice(2);
	const mdIdx = argv.indexOf('--md');
	const mdOut = mdIdx === -1 ? null : argv[mdIdx + 1];
	// Everything that isn't a flag or a flag's value is the report path. Guard
	// the `-1` case: with no `--md`, `mdIdx + 1` is 0 and would eat argv[0].
	const mdValueIdx = mdIdx === -1 ? -1 : mdIdx + 1;
	const positional = argv.filter((a, i) => !a.startsWith('--') && i !== mdValueIdx);
	const reportPath = positional[0] ? path.resolve(positional[0]) : DEFAULT_REPORT;

	if (!fs.existsSync(reportPath)) {
		console.error(`No vitest JSON report at ${path.relative(DOCS, reportPath)} — run \`npm run test:report\` first.`);
		process.exitCode = 1;
		return;
	}

	const r = marginReport(JSON.parse(fs.readFileSync(reportPath, 'utf8')));
	const md = formatReport(r);
	console.log(md);
	if (mdOut) {
		fs.writeFileSync(mdOut, md);
	}
	// Report-only, with no exception. A test above the budget that still PASSED
	// is one carrying its own longer timeout, which is a legitimate choice — not
	// a failure to report. A test that actually blew its budget already failed
	// the suite, and vitest names it better than this could.
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main();
}
