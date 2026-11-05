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
 *   finding     anything else that failed: a test, a probe, a build, the plan. Never re-run, always alerted.
 *
 * Verdict: `none` (nothing failed), `infra` (every failure is no-runner or no-session: re-run once, alert only if the
 * re-run fails too), or `finding` (alert now).
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

/**
 * @param {{ name: string, status?: string, conclusion: string | null, steps?: unknown[], runner_name?: string | null, html_url?: string }[]} jobs
 * @param {Set<string>} noSessionArtifacts artifact names that carry the no-session mark
 */
function triage(jobs, noSessionArtifacts) {
	const failed = [];
	for (const j of jobs) {
		if (REPORTING.has(j.name) || j.status === 'in_progress' || j.status === 'queued') continue;
		if (!FAILED.has(j.conclusion)) continue;
		const noRunner = !j.steps || j.steps.length === 0 || !j.runner_name;
		const art = artifactFor(j.name);
		const kind = noRunner ? 'no-runner' : art && noSessionArtifacts.has(art) ? 'no-session' : 'finding';
		failed.push({ name: j.name, conclusion: j.conclusion, kind, url: j.html_url || '' });
	}
	const verdict = failed.length === 0 ? 'none' : failed.every((f) => f.kind !== 'finding') ? 'infra' : 'finding';
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

/** One Markdown line per failed job, for the issue and the step summary. */
function lines(failed) {
	const why = { 'no-runner': 'no runner: GitHub gave this job none, no test ran', 'no-session': 'no probe ran: the simulator never connected', finding: 'failed' };
	return failed.map((f) => `- ${f.name} (${f.conclusion}; ${why[f.kind]}): ${f.url}`).join('\n');
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
	const result = triage(jobs, noSessionMarks(arg('artifacts')));
	if (argv.includes('--github-output') && process.env.GITHUB_OUTPUT) {
		const body = lines(result.failed);
		fs.appendFileSync(process.env.GITHUB_OUTPUT, `verdict=${result.verdict}\nfailed<<TRIAGE_EOF\n${body}\nTRIAGE_EOF\n`);
	}
	console.log(JSON.stringify(result, null, 2));
}

module.exports = { triage, artifactFor, noSessionMarks, lines };
