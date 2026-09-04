#!/usr/bin/env node
/**
 * Does the nightly family still RUN? — the one alarm nothing else can raise.
 *
 * WHY THIS EXISTS. Every other alarm in this repo reports what it measured. None can
 * report that it never measured. `studio-e2e` was silenced for weeks by a dropped
 * `runs-on` (2026-08-10-nightly-invalid-and-silent.md), and GitHub disables scheduled
 * workflows after 60 days of repository inactivity. Neither the stand-downs shipped in
 * #1988 nor the orphaned-check census covers a schedule that simply stops.
 * Design + measurements: engineering/decisions/2026-09-02-nightly-liveness.md.
 *
 * THREE THINGS THE MEASUREMENT DECIDED, none of them guesses:
 *
 *   · 48h, not 36h. Across 161 scheduled runs the median gap between consecutive runs
 *     is 24.0h but the observed MAXIMUM is 34.7h, so 36h leaves 1.3h of headroom and
 *     would fire on ordinary GitHub cron drift. Measured a second way — lateness against
 *     the workflow's own cron — the tail reaches 12.5h. 48h clears both. The cost is
 *     stated rather than hidden: detection moves from ~1.5 nights to ~2.
 *
 *   · ONE job and ONE rolling issue, not one alarm per workflow. All seven workflows
 *     measured hit their maximum gap on the SAME night (08-26 → 08-27). The failure this
 *     alarm sees most often is a correlated GitHub-side slip, and a per-workflow design
 *     turns one non-event into seven issues.
 *
 *   · A run must be `event: schedule` AND have actually produced JOBS. Both clauses come
 *     from real incidents. During the studio-e2e blackout the workflow was invalid, so
 *     runs still appeared from pushes while "the cron cannot fire" — an unfiltered probe
 *     counts those and reports health. And run 33400075078 is a `pull_request` run of
 *     ci.yml with conclusion `action_required` whose `created_at`, `updated_at` and
 *     `run_started_at` are all equal: created, then parked awaiting approval, having
 *     executed nothing. A run RECORD is not evidence that anything ran.
 *
 * WHAT THIS CANNOT COVER, stated because the honest limit belongs next to the tool: this
 * job is itself one more scheduled workflow, subject to the same dropped `runs-on`, the
 * same 60-day disable, the same parking. Only an external heartbeat closes that loop.
 * This shrinks the blind spot; it does not remove it.
 *
 * SHAPE. The evaluation is PURE and exported, so the thresholds and the two probe clauses
 * are unit-testable with no network — the same split `check-route-budget.mjs` uses, and
 * for the same reason: a gate whose logic can only be exercised by its own nightly run is
 * a gate nobody can prove works. `main()` does the `gh api` reads and nothing else.
 *
 * Usage:
 *   node tools/check-nightly-liveness.mjs [--md <path>] [--json <path>]
 * Exits 0 when everything is alive and the mirror is fresh, 1 otherwise. The workflow
 * keys its filing step off the report, not off this exit code.
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, '..');

/** Hours a workflow may go without a qualifying scheduled run before it is called dead. */
export const THRESHOLD_HOURS = 48;

/**
 * Every workflow carrying a `schedule:` trigger, watched as one set.
 *
 * EIGHT, not the seven the design note measured — it missed `publish-kits.yml`
 * (daily 06:29 UTC). All eight are DAILY, which is what makes a single 48h threshold
 * legitimate for the whole list; a weekly workflow added here would fire every night and
 * must get its own threshold rather than being dropped into this array.
 */
export const WATCHED_WORKFLOWS = [
	'integration-nightly.yml',
	'modulepreload-coverage-nightly.yml',
	'overflow-nightly.yml',
	'perf-nightly.yml',
	'preview-e2e-nightly.yml',
	'publish-kits.yml',
	'studio-e2e-nightly.yml',
	'sync-backlog.yml',
];

/**
 * Scheduled workflows deliberately NOT watched, each with the reason it cannot be.
 *
 * Only one entry, and it is the honest limit of this whole tool: the liveness job cannot
 * watch itself. If it stops running there is nothing left to notice — a self-probe would
 * report health right up until the moment it went silent, and then report nothing, which
 * is indistinguishable from a healthy night. Listing it here rather than omitting it keeps
 * the "every scheduled workflow is watched" test honest: a NEW nightly cannot slip through
 * unwatched by accident, because the only way out of that test is an entry in this object
 * carrying a justification.
 */
export const UNWATCHABLE_WORKFLOWS = {
	'nightly-liveness.yml':
		'this job. A watcher cannot raise its own death — only an external heartbeat closes that loop, which is a bigger change than this problem justifies today.',
};

/**
 * How far BACKLOG.md's claimed open count may sit from the live queue before the mirror
 * counts as stale.
 *
 * PROVISIONAL, and deliberately labelled so. The measured FAILURE this arm exists to catch
 * was a 108-issue gap — `BACKLOG.md` claiming 167 while the live queue held 275, 39% of it
 * invisible — sustained while `sync-backlog` reported success on all 24 of its scheduled
 * runs. #1613 then synced the file 167 → 278.
 *
 * So the two quantities this tolerance sits between are measured, not guessed: ordinary
 * churn is ~3 (275 on 09-02 → 278 on 09-03), and the failure was 108. 25 clears the first
 * comfortably and is nowhere near the second.
 *
 * (An earlier draft of this comment said the live queue read 167 after the sync. It read
 * 278. The 167 was the PRE-sync file, examined from a working tree that had not yet moved —
 * a stale mirror is internally consistent, which is exactly why this arm compares against
 * the live queue rather than checking the file against itself.)
 *
 * The design note is explicit that this number should be re-derived from observed drift
 * rather than inherited; one week of this job's own rows is the data that would settle it.
 */
export const BACKLOG_DRIFT_TOLERANCE = 25;

/**
 * Is one workflow alive? PURE.
 *
 * THREE OUTCOMES, NOT TWO, and the third is the one an earlier cut got wrong: a read that
 * FAILED must not report as a workflow that is DEAD. A 403 (the `actions: read` scope), a
 * 429, a DNS blip or a `gh` auth failure all produced the byte-identical row and the
 * byte-identical human message as a genuinely stopped schedule — so a triager at 08:00
 * reading "0/8 alive" would go hunting for a GitHub outage instead of a token scope.
 *
 * This tool's own thesis is that a green which measured nothing is not health. The BACKLOG
 * arm honors it ("the arm is blind, not healthy"); the workflow arm did not, and it is the
 * primary one. Both directions still fail toward the alarm — `blind` is never `alive` — but
 * the REPORT now says which of the two a human is looking at.
 *
 * @param {{workflow: string, latestQualifyingRun: {created_at: string, html_url?: string}|null, readError?: string|null}} probe
 * @param {Date} now
 * @param {number} thresholdHours
 * @returns {{workflow: string, ageHours: number|null, alive: boolean, blind: boolean, detail: string}}
 */
export function evaluateWorkflow(probe, now, thresholdHours = THRESHOLD_HOURS) {
	const run = probe.latestQualifyingRun;
	if (probe.readError) {
		return {
			workflow: probe.workflow,
			ageHours: null,
			alive: false,
			blind: true,
			detail: `could not read the Actions API — this is BLIND, not dead: ${probe.readError}`,
		};
	}
	if (!run) {
		return {
			workflow: probe.workflow,
			ageHours: null,
			alive: false,
			blind: false,
			// Distinguished from "ran, but too long ago": no qualifying run AT ALL in the
			// window read is the dropped-`runs-on` / disabled-schedule shape, and it reads
			// differently to a human than a workflow that is merely late.
			detail: 'no scheduled run that produced jobs, in the runs read',
		};
	}
	const ageHours = (now.getTime() - new Date(run.created_at).getTime()) / 3_600_000;
	return {
		workflow: probe.workflow,
		ageHours,
		// An unparseable created_at yields NaN, and `NaN <= threshold` is false — so a
		// malformed timestamp fails toward the alarm rather than certifying health.
		alive: ageHours <= thresholdHours,
		blind: false,
		detail: `last scheduled run ${ageHours.toFixed(1)}h ago`,
	};
}

/**
 * The whole family at once. PURE.
 *
 * @returns {{rows: Array, problems: string[]}}
 */
export function evaluateLiveness({ probes, now, thresholdHours = THRESHOLD_HOURS }) {
	const rows = probes.map((p) => evaluateWorkflow(p, now, thresholdHours));
	const problems = rows
		.filter((r) => !r.alive)
		.map((r) => `\`${r.workflow}\` — ${r.detail} (threshold ${thresholdHours}h)`);
	return { rows, problems };
}

/**
 * Is the committed mirror still tracking the live queue? PURE.
 *
 * Separate from "did sync-backlog run", and that separation IS the point: the run colour
 * was green on all 24 scheduled runs across the window in which the file went 39% stale.
 * A green run is not evidence the file it was supposed to write is current.
 *
 * @returns {{claimed: number|null, live: number, drift: number|null, fresh: boolean, detail: string}}
 */
export function evaluateBacklogFreshness({ claimed, live, tolerance = BACKLOG_DRIFT_TOLERANCE }) {
	if (claimed === null || claimed === undefined || Number.isNaN(claimed)) {
		return {
			claimed: null,
			live,
			drift: null,
			fresh: false,
			// Not silently "fine". If the header stops being parseable the arm has gone
			// blind, and a blind arm reporting health is the exact sin this family exists
			// to remove.
			detail: 'could not read the open-item count from BACKLOG.md — the arm is blind, not healthy',
		};
	}
	const drift = Math.abs(claimed - live);
	return {
		claimed,
		live,
		drift,
		fresh: drift <= tolerance,
		detail: `BACKLOG.md claims ${claimed} open, the live queue has ${live} (drift ${drift}, tolerance ${tolerance})`,
	};
}

/**
 * Pull the claimed open-item count out of BACKLOG.md's header. PURE.
 * Returns null when the header shape changes rather than guessing a number.
 */
export function claimedOpenCount(backlogText) {
	const m = backlogText.match(/\*\*(\d+)\s+open\*\*/);
	return m ? Number(m[1]) : null;
}

/** Render the report a human reads on the rolling issue. PURE. */
export function buildReport({ rows, problems, freshness, thresholdHours = THRESHOLD_HOURS }) {
	const healthy = rows.filter((r) => r.alive).length;
	const lines = [];
	lines.push(
		problems.length || !freshness.fresh
			? `### ❌ Nightly liveness — ${healthy}/${rows.length} workflows alive`
			: `### ✅ Nightly liveness — ${healthy}/${rows.length} workflows alive`,
	);
	lines.push('');
	lines.push(`A workflow is alive when its most recent \`event: schedule\` run that actually produced jobs is under ${thresholdHours}h old.`);
	lines.push('');
	lines.push('| workflow | last scheduled run | alive |');
	lines.push('|---|---|---|');
	for (const r of rows) {
		// A blind row says BLIND rather than NO. Both are failures and both file, but only
		// one of them is a reason to go looking at the workflow — the other sends you to
		// the token scope or to GitHub's status page.
		const verdict = r.blind ? '**BLIND**' : r.alive ? 'yes' : '**NO**';
		lines.push(`| \`${r.workflow}\` | ${r.ageHours === null ? '—' : `${r.ageHours.toFixed(1)}h ago`} | ${verdict} |`);
	}
	const blind = rows.filter((r) => r.blind).length;
	if (blind) {
		lines.push('');
		lines.push(
			`⚠️ **${blind} of ${rows.length} rows are BLIND, not dead** — the probe could not read the Actions API for them. ` +
				'Check the workflow\'s `actions: read` permission and GitHub availability BEFORE investigating the workflows themselves.',
		);
	}
	lines.push('');
	lines.push(`**Mirror freshness:** ${freshness.fresh ? 'ok' : '**STALE**'} — ${freshness.detail}`);
	if (problems.length) {
		lines.push('');
		lines.push('**Not reporting:**');
		for (const p of problems) lines.push(`- ${p}`);
	}
	return lines.join('\n');
}

// ── The impure half: gh api reads ────────────────────────────────────────────────

function gh(args) {
	return execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
}

/**
 * The newest `event: schedule` run for one workflow that ACTUALLY PRODUCED JOBS.
 *
 * Walks newest-first and asks the jobs endpoint per candidate, stopping at the first that
 * qualifies. The walk is bounded (`per_page`) because an endless scan of a long-dead
 * workflow's history would cost more API calls than the answer is worth — and "nothing in
 * the last N scheduled runs produced jobs" is already the failure this reports.
 */
function probeWorkflow(repo, workflow, perPage = 10) {
	let runs = [];
	try {
		const out = gh(['api', `repos/${repo}/actions/workflows/${workflow}/runs?event=schedule&per_page=${perPage}`]);
		runs = JSON.parse(out).workflow_runs || [];
	} catch (e) {
		const msg = String(e?.stderr || e?.message || e);
		// A 404 IS a liveness answer — the workflow file is gone or renamed, so there is
		// genuinely no scheduled run to find. Anything else (403 from a missing
		// `actions: read` scope, 429, a network blip, a gh auth failure) means the probe
		// COULD NOT SEE, which is a different fact and must not be reported as death.
		// Both still fail toward the alarm; only the message differs, and the message is
		// what sends a triager to the right place.
		if (/\b404\b|[Nn]ot [Ff]ound/.test(msg)) return { workflow, latestQualifyingRun: null, readError: null };
		return { workflow, latestQualifyingRun: null, readError: msg.split('\n')[0].slice(0, 200) };
	}
	let jobsReadError = null;
	for (const run of runs) {
		try {
			const jobs = JSON.parse(gh(['api', `repos/${repo}/actions/runs/${run.id}/jobs?per_page=1`]));
			if ((jobs.total_count ?? 0) > 0) return { workflow, latestQualifyingRun: run, readError: null };
		} catch (e) {
			// Keep walking — a jobs read that fails is not proof the run was empty. But
			// REMEMBER it: if no candidate ever qualifies and the only reason we cannot
			// tell is that the reads failed, that is blindness, not death. Without this the
			// walk silently degrades a total read failure into a confident "it is dead".
			jobsReadError ||= String(e?.stderr || e?.message || e).split('\n')[0].slice(0, 200);
		}
	}
	return { workflow, latestQualifyingRun: null, readError: runs.length > 0 ? jobsReadError : null };
}

function liveOpenIssueCount(repo) {
	// `search/issues` reports a total without paging the whole queue. `is:issue` excludes
	// PRs, which is the same filter tools/sync-backlog.js applies when it writes the file —
	// comparing against a different filter would manufacture drift.
	const out = gh(['api', `search/issues?q=${encodeURIComponent(`repo:${repo} is:issue is:open`)}&per_page=1`]);
	return JSON.parse(out).total_count;
}

function parseArgs(argv) {
	const out = {};
	for (let i = 0; i < argv.length; i++) {
		if (argv[i] === '--md') out.md = argv[++i];
		else if (argv[i] === '--json') out.json = argv[++i];
		else throw new Error(`unknown arg: ${argv[i]}`);
	}
	return out;
}

function main() {
	const args = parseArgs(process.argv.slice(2));
	const repo = process.env.GITHUB_REPOSITORY || 'Laticent/lattice';
	const now = new Date();

	const probes = WATCHED_WORKFLOWS.map((w) => probeWorkflow(repo, w));
	const { rows, problems } = evaluateLiveness({ probes, now });

	const backlogPath = path.join(REPO_ROOT, 'BACKLOG.md');
	const claimed = fs.existsSync(backlogPath) ? claimedOpenCount(fs.readFileSync(backlogPath, 'utf8')) : null;
	const freshness = evaluateBacklogFreshness({ claimed, live: liveOpenIssueCount(repo) });

	const report = buildReport({ rows, problems, freshness });
	if (args.md) fs.writeFileSync(args.md, `${report}\n`);
	if (args.json) fs.writeFileSync(args.json, `${JSON.stringify({ rows, problems, freshness }, null, 2)}\n`);
	process.stdout.write(`${report}\n`);

	// THE MEASUREMENT FLOOR, in the shape preview-e2e-nightly already uses (`cases=N`).
	// This job CLOSES its rolling issue on a healthy night, and the nightly-alarm contract
	// holds every closer to proving it examined something first: `problems: []` is what a
	// healthy family produces AND what an empty watch list produces, and those must not
	// report the same health. The workflow greps this line and refuses to close on 0.
	process.stdout.write(`workflows=${rows.length}\n`);

	const healthy = problems.length === 0 && freshness.fresh;
	process.exit(healthy ? 0 : 1);
}

// Only run when INVOKED, never when imported by the tests. realpath on both sides for the
// symlinked-checkout reason check-route-budget.mjs documents.
const invokedAs = process.argv[1] ? fs.realpathSync(process.argv[1]) : '';
const selfPath = fs.realpathSync(fileURLToPath(import.meta.url));
if (invokedAs === selfPath) main();
