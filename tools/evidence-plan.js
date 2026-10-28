#!/usr/bin/env node
/**
 * tools/evidence-plan.js — which REAL surfaces does this diff owe evidence on, and the command for each.
 *
 * The pre-merge card's `ran` row and its confidence level rest on artifacts from the surfaces a change
 * reaches (HARD RULE #23). Before this, which surfaces to drive was the agent's memory: per-PR CI runs
 * Chromium and one WebKit player job, while the Gecko and WebKit e2e projects run nightly and the
 * macOS / Windows / iOS-Simulator suites only on a path match, so a session got that evidence only if
 * it remembered to go and get it. This prints the plan from the diff, so the raise loop starts from a
 * list rather than a recollection (engineering/workflow.md §The raise loop).
 *
 * It REUSES the selectors that already exist rather than restating them (HARD RULE #15):
 *   - platform suites: tools/platform-suites-plan.js `plan()` over .github/platform-suites.json, the same
 *     rule the platform-suites workflow applies to a pull request;
 *   - unit tests: tools/affected-tests.js, named as a command (it runs the tests itself).
 * The browser-engine and owner-stop rows are the only rules defined here.
 *
 * Usage:
 *   node tools/evidence-plan.js                 # diff against origin/main...HEAD
 *   node tools/evidence-plan.js --base main     # another base
 *   node tools/evidence-plan.js --json          # machine-readable
 *   node tools/evidence-plan.js -- a.js b.css   # explicit file list (tests, dry runs)
 *
 * Exit 0 always on a plan; 2 on a usage error. It plans, it never runs: the e2e engines take minutes,
 * and the dispatch is a GitHub call the agent makes with its own tools.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { plan: platformPlan } = require('./platform-suites-plan');

const ROOT = path.resolve(__dirname, '..');

// One row per surface. `match` takes a repo-relative path. A row fires when any changed file matches.
// `kind` says who acts: `local` runs here, `dispatch` is a workflow_dispatch, `owner` is the one
// legitimate stop (export bytes need the owner's sign-off; the Quality Bar's single exception).
const SURFACES = [
	{
		surface: 'docs site: Chromium at desktop, tablet and mobile',
		kind: 'local',
		match: (f) => f.startsWith('docs/'),
		command: 'cd docs && npm run test:e2e -- --project=desktop --project=tablet --project=mobile',
		why: 'every website change is first-class at three widths (Quality Bar)',
	},
	{
		surface: 'docs site: real WebKit (iPhone 15 Pro, iPad landscape) and Gecko',
		kind: 'local',
		match: (f) => f.startsWith('docs/') || f.startsWith('lib/runtime/') || f.startsWith('lib/playground/'),
		command: 'cd docs && npm run test:e2e -- --project=webkit-phone --project=webkit-tablet --project=gecko',
		why: 'per-PR CI runs neither; they install themselves when the suite needs them (#23)',
	},
	{
		surface: 'docs site: screenshots at 1440, 820 and 390',
		kind: 'local',
		match: (f) => /^docs\/src\/(components|layouts|pages|styles|playground)\//.test(f),
		command: 'node tools/screenshot.js <url> <out>.png --width 1440|820|390   # then SendUserFile',
		why: 'no website change is done without evidence at all three widths',
	},
	{
		surface: 'exported player: touch, keyboard and host parity',
		kind: 'local',
		match: (f) => f.startsWith('lib/runtime/') || f.startsWith('lib/export/'),
		command: 'cd docs && npm run test:e2e -- --project=player-parity && node tools/verify-player-input.mjs',
		why: 'the player is a surface a human holds; a unit test cannot tap it',
	},
	{
		surface: 'rendered slides: integration tier and golden regress',
		kind: 'local',
		match: (f) => f === 'lattice.js' || (/^(lib|themes)\//.test(f) && !f.endsWith('.docs.md') && !f.startsWith('lib/runtime/')),
		command: 'npm run test:integration && npm run regress',
		why: 'cross-renderer parity and page counts; regress pixel-diffs every committed deck',
	},
	{
		surface: 'visual taste: demo deck, light and dark',
		kind: 'local',
		match: (f) => /^(lib\/components|lib\/base|themes)\/.*\.css$/.test(f),
		command: 'npm run preview   # then SendUserFile the PNGs; the owner spot-checks taste only',
		why: 'the one visual check that may go to the owner, with the artifact attached',
	},
	{
		surface: 'export bytes: owner sign-off',
		kind: 'owner',
		// lattice.js drives page.pdf() for the CLI; print-sheet.mjs is the @page CSS that export uses.
		match: (f) => f === 'lattice.js' || /^lib\/(export|fonts)\//.test(f) || /^lib\/core\/(pdf-|export-|office-export|font-|print-sheet|corner-export)/.test(f),
		command: 'render a representative demo deck in dark and light; SendUserFile both for sign-off',
		why: 'a change to exported bytes is the Quality Bar\'s one stop-and-show',
	},
];

// Every plan carries these: what a contributor runs before any push (CLAUDE.md DEFAULT OP MODE #5).
const ALWAYS = [
	{ surface: 'gates', kind: 'local', command: 'npm run lint && npm run build:check', why: 'the floor, not evidence of behavior' },
	{ surface: 'unit tests for the changed files', kind: 'local', command: 'node tools/affected-tests.js <files>   # or npm test', why: 'the inner loop' },
];

function changedFiles(base) {
	const r = spawnSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: ROOT, encoding: 'utf8' });
	if (r.status !== 0) throw new Error(`git diff ${base}...HEAD failed: ${(r.stderr || '').trim()}`);
	// Plus what is not committed yet: changed tracked files, and new files git does not track.
	const dirty = spawnSync('git', ['diff', '--name-only', 'HEAD'], { cwd: ROOT, encoding: 'utf8' });
	const untracked = spawnSync('git', ['ls-files', '--others', '--exclude-standard'], { cwd: ROOT, encoding: 'utf8' });
	return [...new Set([r.stdout, dirty.stdout || '', untracked.stdout || ''].join('\n').split('\n').filter(Boolean))].sort();
}

/** The plan for a list of repo-relative paths. Pure apart from reading the platform-suites registry. */
function evidencePlan(changed, registry = JSON.parse(fs.readFileSync(path.join(ROOT, '.github', 'platform-suites.json'), 'utf8'))) {
	const steps = [...ALWAYS];
	for (const s of SURFACES) {
		const hits = changed.filter(s.match);
		if (hits.length) steps.push({ surface: s.surface, kind: s.kind, command: s.command, why: s.why, files: hits });
	}
	const suites = [...new Set(platformPlan(registry, { event: 'pull_request', changed }).include.map((i) => i.suite))];
	if (suites.length) {
		steps.push({
			surface: `real macOS / Windows / iOS Simulator: ${suites.join(', ')}`,
			kind: 'dispatch',
			command: `workflow_dispatch platform-suites.yml on this branch with suites=${suites.join(',')}`,
			why: 'Linux CI cannot reach these OSes; the PR run is report-only, so read its result before the card',
		});
	}
	return { changed, steps, ownerStop: steps.some((s) => s.kind === 'owner') };
}

function format({ changed, steps, ownerStop }) {
	const out = [`Evidence plan for ${changed.length} changed file(s):`, ''];
	for (const s of steps) {
		out.push(`[${s.kind}] ${s.surface}`, `    ${s.command}`, `    why: ${s.why}`);
		if (s.files) out.push(`    from: ${s.files.slice(0, 4).join(', ')}${s.files.length > 4 ? `, +${s.files.length - 4} more` : ''}`);
		out.push('');
	}
	out.push(ownerStop
		? 'One row needs the owner: send the artifacts and stop there. Everything else is yours to run before the card.'
		: 'Nothing here needs the owner. Run every row, then put the artifacts on the card.');
	return out.join('\n');
}

if (require.main === module) {
	const argv = process.argv.slice(2);
	const dashdash = argv.indexOf('--');
	const explicit = dashdash === -1 ? null : argv.slice(dashdash + 1);
	const flags = dashdash === -1 ? argv : argv.slice(0, dashdash);
	const bi = flags.indexOf('--base');
	if (bi !== -1 && !flags[bi + 1]) {
		console.error('evidence-plan: --base needs a ref');
		process.exit(2);
	}
	let changed;
	try {
		changed = explicit || changedFiles(bi === -1 ? 'origin/main' : flags[bi + 1]);
	} catch (err) {
		console.error(`evidence-plan: ${err.message}`);
		process.exit(2);
	}
	const result = evidencePlan(changed);
	console.log(flags.includes('--json') ? JSON.stringify(result, null, 2) : format(result));
}

module.exports = { evidencePlan, SURFACES };
