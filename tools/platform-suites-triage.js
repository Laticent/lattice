#!/usr/bin/env node
/**
 * tools/platform-suites-triage.js — sort a platform-suites run's failed jobs into the infrastructure and the findings.
 *
 * Shared by the run's own `alert` job and by the supervisor (.github/workflows/platform-suites-supervisor.yml), so the two
 * agree on what counts as "no test ran" (engineering/decisions/2026-11-04-ci-flake-audit.md §2 and §5; D1 and D2 on #3034):
 *
 *   no-runner   GitHub never gave the job a runner: it has no steps or no runner name. 19 of 20 red macOS jobs on pull
 *               requests from 2026-10-21 to 11-04 were this, and none ran a test.
 *   no-session  an iOS Simulator job whose run.sh wrote `platform-suite-artifacts/no-session`: every device that failed did
 *               so before any probe code ran (safaridriver never reached the simulator). 4 of 15 red nightlies.
 *   out-of-time an iOS Simulator job whose run.sh wrote `platform-suite-artifacts/out-of-time`: a device it had no time left
 *               to start (docs/scripts/ios-safari/suite-budget.mjs), so it was not tested. A FINDING, named: the job does
 *               not fit its time, and a re-run would only hide that. It wins over `no-session` (run.sh never writes both).
 *   finding     anything else that failed: a test, a probe, a build, the plan. Never re-run, always alerted.
 *
 * Verdict: `none` (nothing failed), `infra` (every failure is no-runner or no-session: re-run once, alert only if the
 * re-run fails too), or `finding` (alert now; an `out-of-time` job is one).
 *
 * Usage:
 *   node tools/platform-suites-triage.js --jobs jobs.json --artifacts <dir> [--github-output]
 * `jobs.json` is the `jobs` array (or the API's `{ jobs: [...] }`) from GET /repos/{o}/{r}/actions/runs/{id}/jobs?filter=latest;
 * `<dir>` holds the run's artifacts, one folder per artifact (actions/download-artifact, `gh run download`). Prints JSON.
 */
const fs = require('node:fs');
const path = require('node:path');

/** The jobs this triage judges: the suites and the plan, not the reporting jobs themselves. */
const REPORTING = new Set(['alert', 'supervise']);
const FAILED = new Set(['failure', 'cancelled', 'timed_out']);

/** "ios-safari-photo (macos-26)" → "platform-suite-ios-safari-photo-macos-26", the artifact the job uploads. */
function artifactFor(jobName) {
	const m = /^(.+) \(([^)]+)\)$/.exec(jobName);
	return m ? `platform-suite-${m[1]}-${m[2]}` : null;
}

/** The kinds that ran no test and may be held for the supervisor's one re-run. Every other kind is a finding. */
const INFRA = new Set(['no-runner', 'no-session']);

/**
 * @param {{ name: string, status?: string, conclusion: string | null, steps?: unknown[], runner_name?: string | null, html_url?: string }[]} jobs
 * @param {Set<string>} noSessionArtifacts artifact names that carry the no-session mark
 * @param {Map<string, string>} [outOfTime] artifact name → the `not run: out of time` lines its out-of-time mark holds
 */
function triage(jobs, noSessionArtifacts, outOfTime = new Map()) {
	const failed = [];
	for (const j of jobs) {
		if (REPORTING.has(j.name) || j.status === 'in_progress' || j.status === 'queued') continue;
		if (!FAILED.has(j.conclusion)) continue;
		const noRunner = !j.steps || j.steps.length === 0 || !j.runner_name;
		const art = artifactFor(j.name);
		const kind = noRunner ? 'no-runner' : art && outOfTime.has(art) ? 'out-of-time' : art && noSessionArtifacts.has(art) ? 'no-session' : 'finding';
		const entry = { name: j.name, conclusion: j.conclusion, kind, url: j.html_url || '' };
		if (kind === 'out-of-time') entry.detail = outOfTime.get(art);
		failed.push(entry);
	}
	const verdict = failed.length === 0 ? 'none' : failed.every((f) => INFRA.has(f.kind)) ? 'infra' : 'finding';
	return { verdict, failed };
}

/** The artifact folders under `dir` that hold a `no-session` file. */
function noSessionMarks(dir) {
	const out = new Set();
	if (!dir || !fs.existsSync(dir)) return out;
	for (const name of fs.readdirSync(dir)) {
		if (fs.existsSync(path.join(dir, name, 'no-session'))) out.add(name);
	}
	return out;
}

/** The artifact folders under `dir` that hold an `out-of-time` file, each with the lines it holds (one per device not run). */
function outOfTimeMarks(dir) {
	const out = new Map();
	if (!dir || !fs.existsSync(dir)) return out;
	for (const name of fs.readdirSync(dir)) {
		const file = path.join(dir, name, 'out-of-time');
		if (fs.existsSync(file)) out.set(name, fs.readFileSync(file, 'utf8').trim().split('\n').filter(Boolean).join('; ') || 'not run: out of time');
	}
	return out;
}

/** One Markdown line per failed job, for the issue and the step summary. */
function lines(failed) {
	const why = {
		'no-runner': 'no runner: GitHub gave this job none, no test ran',
		'no-session': 'no probe ran: the simulator never connected',
		'out-of-time': 'a device was not run: the job had no time left to start it',
		finding: 'failed',
	};
	return failed.map((f) => `- ${f.name} (${f.conclusion}; ${why[f.kind]}${f.detail ? `: ${f.detail}` : ''}): ${f.url}`).join('\n');
}

if (require.main === module) {
	const argv = process.argv.slice(2);
	const arg = (name) => {
		const i = argv.indexOf(`--${name}`);
		return i === -1 ? '' : argv[i + 1] || '';
	};
	const jobsFile = arg('jobs');
	if (!jobsFile) {
		console.error('platform-suites-triage: --jobs <file> is required');
		process.exit(2);
	}
	const raw = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
	const jobs = Array.isArray(raw) ? raw : raw.jobs || [];
	const result = triage(jobs, noSessionMarks(arg('artifacts')), outOfTimeMarks(arg('artifacts')));
	if (argv.includes('--github-output') && process.env.GITHUB_OUTPUT) {
		const body = lines(result.failed);
		fs.appendFileSync(process.env.GITHUB_OUTPUT, `verdict=${result.verdict}\nfailed<<TRIAGE_EOF\n${body}\nTRIAGE_EOF\n`);
	}
	console.log(JSON.stringify(result, null, 2));
}

module.exports = { triage, artifactFor, noSessionMarks, outOfTimeMarks, lines };
