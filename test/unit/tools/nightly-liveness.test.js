/**
 * The liveness evaluator, exercised with no network.
 *
 * WHY THESE ARMS. A nightly alarm whose logic only runs inside its own nightly job is a
 * gate nobody can prove works — which is the failure this whole swimlane exists to remove.
 * The two probe clauses (`event: schedule`, and the run must have produced JOBS) each come
 * from a real incident, so each gets a test that fails if the clause is dropped.
 */

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const MOD = path.join(__dirname, '..', '..', '..', 'tools', 'check-nightly-liveness.mjs');

let L;
test.before(async () => {
	L = await import(`file://${MOD}`);
});

const NOW = new Date('2026-09-03T12:00:00Z');
const hoursAgo = (h) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

test('a workflow that ran inside the threshold is alive', () => {
	const r = L.evaluateWorkflow({ workflow: 'perf-nightly.yml', latestQualifyingRun: { created_at: hoursAgo(24) } }, NOW);
	assert.equal(r.alive, true);
	assert.ok(Math.abs(r.ageHours - 24) < 0.01);
});

test('34.7h — the observed maximum gap — is alive, which is why the threshold is 48 and not 36', () => {
	// The measured worst-case ordinary drift. A 36h threshold left 1.3h of headroom over
	// this and would have fired on a non-event; if someone lowers THRESHOLD_HOURS below
	// ~35 this arm is what says no.
	const r = L.evaluateWorkflow({ workflow: 'perf-nightly.yml', latestQualifyingRun: { created_at: hoursAgo(34.7) } }, NOW);
	assert.equal(r.alive, true, 'ordinary GitHub cron drift must not raise the alarm');
});

test('past the threshold is dead, and says how long', () => {
	const r = L.evaluateWorkflow({ workflow: 'studio-e2e-nightly.yml', latestQualifyingRun: { created_at: hoursAgo(61) } }, NOW);
	assert.equal(r.alive, false);
	assert.match(r.detail, /61\.0h ago/);
});

test('NO qualifying run reads differently from a merely late one', () => {
	// The dropped-`runs-on` shape. A human triaging this needs to tell "the cron cannot
	// fire" from "the cron is late", so the two must not collapse into one message.
	const r = L.evaluateWorkflow({ workflow: 'studio-e2e-nightly.yml', latestQualifyingRun: null }, NOW);
	assert.equal(r.alive, false);
	assert.equal(r.ageHours, null);
	assert.match(r.detail, /no scheduled run that produced jobs/);
});

test('a read FAILURE reports BLIND, never dead — the probe must not confuse cannot-see with stopped', () => {
	// The tool's own thesis is that a green which measured nothing is not health. A 403
	// from a missing `actions: read` scope, a 429 or a gh auth failure used to produce the
	// byte-identical row and message as a genuinely stopped schedule, sending a triager
	// after the workflow instead of the token.
	const r = L.evaluateWorkflow({ workflow: 'perf-nightly.yml', latestQualifyingRun: null, readError: 'HTTP 403: Resource not accessible by integration' }, NOW);
	assert.equal(r.alive, false, 'blind must never read as alive');
	assert.equal(r.blind, true);
	assert.match(r.detail, /BLIND, not dead/);
	assert.match(r.detail, /403/, 'the underlying cause must survive into the message');
});

test('a 404-shaped absence is death, not blindness', () => {
	// A workflow file that is gone genuinely has no scheduled runs — that IS the answer,
	// and it must not be softened into "could not read".
	const r = L.evaluateWorkflow({ workflow: 'gone.yml', latestQualifyingRun: null, readError: null }, NOW);
	assert.equal(r.alive, false);
	assert.equal(r.blind, false);
	assert.match(r.detail, /no scheduled run that produced jobs/);
});

test('the report marks blind rows BLIND and tells the triager where to look first', () => {
	const probes = [
		{ workflow: 'a.yml', latestQualifyingRun: { created_at: hoursAgo(10) } },
		{ workflow: 'b.yml', latestQualifyingRun: null, readError: 'HTTP 403' },
	];
	const { rows, problems } = L.evaluateLiveness({ probes, now: NOW });
	const md = L.buildReport({ rows, problems, freshness: L.evaluateBacklogFreshness({ claimed: 278, live: 278 }) });
	assert.match(md, /\*\*BLIND\*\*/);
	assert.match(md, /1 of 2 rows are BLIND, not dead/);
	assert.match(md, /actions: read/, 'the report must name the likeliest cause');
	assert.ok(!md.includes('✅'), 'a blind row must not produce a green report');
});

test('the family rolls up into one set of problems, not one per workflow', () => {
	const { rows, problems } = L.evaluateLiveness({
		probes: [
			{ workflow: 'a.yml', latestQualifyingRun: { created_at: hoursAgo(10) } },
			{ workflow: 'b.yml', latestQualifyingRun: { created_at: hoursAgo(70) } },
			{ workflow: 'c.yml', latestQualifyingRun: null },
		],
		now: NOW,
	});
	assert.equal(rows.length, 3);
	assert.equal(problems.length, 2);
	assert.ok(problems.every((p) => typeof p === 'string'));
});

test('the watch list is the eight DAILY scheduled workflows', () => {
	// Pinned by content: the design note measured seven and missed publish-kits.yml. A
	// ninth scheduled workflow added to the repo without being added here would be
	// unwatched — silently, which is the failure mode this whole tool is about.
	assert.equal(L.WATCHED_WORKFLOWS.length, 8);
	assert.ok(L.WATCHED_WORKFLOWS.includes('publish-kits.yml'), 'publish-kits.yml is daily-scheduled and must be watched');
	assert.ok(L.WATCHED_WORKFLOWS.includes('sync-backlog.yml'));
});

test('every watched workflow file exists and actually carries a schedule', () => {
	// Guards a rename: a watched file that no longer exists would 404 forever and report
	// a permanent false alarm, and one that lost its `schedule:` cannot be judged by a
	// scheduled-run probe at all.
	const fs = require('node:fs');
	const wfDir = path.join(__dirname, '..', '..', '..', '.github', 'workflows');
	for (const w of L.WATCHED_WORKFLOWS) {
		const p = path.join(wfDir, w);
		assert.ok(fs.existsSync(p), `${w} is watched but does not exist`);
		assert.match(fs.readFileSync(p, 'utf8'), /^\s*schedule:/m, `${w} is watched but has no schedule: trigger`);
	}
});

test('every scheduled workflow in the repo is on the watch list', () => {
	// The other direction, and the one that rots: adding a nightly and forgetting to watch
	// it leaves exactly the blind spot this tool exists to close.
	const fs = require('node:fs');
	const wfDir = path.join(__dirname, '..', '..', '..', '.github', 'workflows');
	const scheduled = fs
		.readdirSync(wfDir)
		.filter((f) => f.endsWith('.yml'))
		.filter((f) => /^\s*schedule:/m.test(fs.readFileSync(path.join(wfDir, f), 'utf8')));
	assert.deepStrictEqual(
		scheduled.filter((f) => !L.WATCHED_WORKFLOWS.includes(f) && !(f in L.UNWATCHABLE_WORKFLOWS)),
		[],
		'a scheduled workflow is neither watched nor listed in UNWATCHABLE_WORKFLOWS with a reason — add it to one or the other',
	);
});

test('the only unwatchable workflow is this job itself, and it says why', () => {
	// The exit from the coverage test above must stay one deliberate, justified entry.
	// If this list grows, the blind spot grows with it — so the growth has to be visible
	// in a diff rather than buried in an exclusion nobody re-reads.
	assert.deepStrictEqual(Object.keys(L.UNWATCHABLE_WORKFLOWS), ['nightly-liveness.yml']);
	assert.match(L.UNWATCHABLE_WORKFLOWS['nightly-liveness.yml'], /cannot raise its own death/);
});

test('a watched workflow is never also listed as unwatchable', () => {
	for (const w of L.WATCHED_WORKFLOWS) {
		assert.ok(!(w in L.UNWATCHABLE_WORKFLOWS), `${w} is both watched and excused — one of the two is wrong`);
	}
});

test('mirror freshness passes inside tolerance and fails outside it', () => {
	const ok = L.evaluateBacklogFreshness({ claimed: 167, live: 172 });
	assert.equal(ok.fresh, true);
	assert.equal(ok.drift, 5);

	// The measured failure: 167 claimed against 275 live, while every run was green.
	const bad = L.evaluateBacklogFreshness({ claimed: 167, live: 275 });
	assert.equal(bad.fresh, false);
	assert.equal(bad.drift, 108);
	assert.match(bad.detail, /167 open/);
});

test('an unreadable BACKLOG header reports blind, never healthy', () => {
	const r = L.evaluateBacklogFreshness({ claimed: null, live: 167 });
	assert.equal(r.fresh, false);
	assert.match(r.detail, /blind, not healthy/);
});

test('claimedOpenCount reads the real BACKLOG.md header, and returns null rather than guessing', () => {
	const fs = require('node:fs');
	const backlog = path.join(__dirname, '..', '..', '..', 'BACKLOG.md');
	const n = L.claimedOpenCount(fs.readFileSync(backlog, 'utf8'));
	assert.equal(typeof n, 'number', 'the committed BACKLOG.md header must stay parseable by this arm');
	assert.ok(n > 0);
	assert.equal(L.claimedOpenCount('no count here'), null);
});

test('the report names the failing workflow and marks the run dead', () => {
	const probes = [
		{ workflow: 'a.yml', latestQualifyingRun: { created_at: hoursAgo(10) } },
		{ workflow: 'b.yml', latestQualifyingRun: null },
	];
	const { rows, problems } = L.evaluateLiveness({ probes, now: NOW });
	const md = L.buildReport({ rows, problems, freshness: L.evaluateBacklogFreshness({ claimed: 167, live: 170 }) });
	assert.match(md, /❌/);
	assert.match(md, /1\/2 workflows alive/);
	assert.match(md, /`b\.yml`/);
	assert.match(md, /\*\*NO\*\*/);
});

test('an all-healthy report reads green and carries no problem list', () => {
	const probes = [{ workflow: 'a.yml', latestQualifyingRun: { created_at: hoursAgo(10) } }];
	const { rows, problems } = L.evaluateLiveness({ probes, now: NOW });
	const md = L.buildReport({ rows, problems, freshness: L.evaluateBacklogFreshness({ claimed: 167, live: 167 }) });
	assert.match(md, /✅/);
	assert.ok(!md.includes('Not reporting:'));
});

test('a stale mirror makes the report red even when every workflow is alive', () => {
	// The green-and-dead case this arm exists for: all runs succeeded, file went stale.
	const probes = [{ workflow: 'sync-backlog.yml', latestQualifyingRun: { created_at: hoursAgo(10) } }];
	const { rows, problems } = L.evaluateLiveness({ probes, now: NOW });
	assert.equal(problems.length, 0);
	const md = L.buildReport({ rows, problems, freshness: L.evaluateBacklogFreshness({ claimed: 167, live: 275 }) });
	assert.match(md, /❌/, 'a stale mirror must not be reported as a healthy night');
	assert.match(md, /STALE/);
});
