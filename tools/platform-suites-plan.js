#!/usr/bin/env node
/**
 * tools/platform-suites-plan.js — pick which platform suites (macOS / Windows CI) a workflow run executes.
 *
 * Reads .github/platform-suites.json and prints the matrix `.github/workflows/platform-suites.yml` runs. One selection rule per
 * trigger: the nightly (`schedule`) runs every suite; a manual dispatch runs the suites it names, or every suite when it names
 * none; a pull request runs the suites whose `paths` globs match a changed file, and every suite when the registry, this planner
 * or the workflow itself changed (so editing the plumbing proves the plumbing). A suite with several `os` entries becomes one
 * matrix row per OS.
 *
 * Usage: node tools/platform-suites-plan.js --event pull_request --changed changed-files.txt
 *        node tools/platform-suites-plan.js --event workflow_dispatch --suites export-confine
 *        add --github-output to append `matrix=` and `count=` to $GITHUB_OUTPUT.
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const REGISTRY = path.join(ROOT, '.github', 'platform-suites.json');
// Edits to these re-run every suite on a pull request: the plumbing has no `paths` of its own.
// The command that builds dist/ and the docs bundles before a suite runs; a suite may name a narrower one in `build`.
const DEFAULT_BUILD = 'npm run build';
const PLUMBING = ['.github/platform-suites.json', '.github/workflows/platform-suites.yml', 'tools/platform-suites-plan.js'];

/** A glob (`*` within a segment, `**` across segments) as an anchored regex. */
function globToRegExp(glob) {
	let re = '';
	for (let i = 0; i < glob.length; i++) {
		const c = glob[i];
		if (c === '*' && glob[i + 1] === '*') {
			// `**/` is zero or more whole directories (`a/**/b` matches `a/b` and `a/x/y/b`, not `a/xb`); a bare `**` is anything.
			if (glob[i + 2] === '/') {
				re += '(?:.*/)?';
				i += 2;
			} else {
				re += '.*';
				i++;
			}
		} else if (c === '*') re += '[^/]*';
		else if (c === '?') re += '[^/]';
		else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
	}
	return new RegExp(`^${re}$`);
}

/**
 * @param {{ suites: { name: string, os: string[], paths: string[], run: string, build?: string, why: string }[] }} registry
 * @param {{ event: string, changed?: string[], suites?: string[] }} input
 * @returns {{ include: { suite: string, os: string, run: string, build: string, why: string }[], count: number }}
 */
function plan(registry, { event, changed = [], suites = [] }) {
	let selected = registry.suites;
	if (event === 'workflow_dispatch') {
		if (suites.length) selected = selected.filter((s) => suites.includes(s.name));
	} else if (event === 'pull_request') {
		const everything = changed.some((f) => PLUMBING.includes(f));
		selected = everything ? selected : selected.filter((s) => s.paths.some((g) => changed.some((f) => globToRegExp(g).test(f))));
	} // schedule, and anything else: every suite
	const include = selected.flatMap((s) => s.os.map((os) => ({ suite: s.name, os, run: s.run, build: s.build || DEFAULT_BUILD, why: s.why })));
	return { include, count: include.length };
}

if (require.main === module) {
	const argv = process.argv.slice(2);
	const arg = (name) => {
		const i = argv.indexOf(`--${name}`);
		return i === -1 ? '' : argv[i + 1] || '';
	};
	const registry = JSON.parse(fs.readFileSync(REGISTRY, 'utf8'));
	const changedFile = arg('changed');
	const changed = changedFile ? fs.readFileSync(changedFile, 'utf8').split(/\r?\n/).filter(Boolean) : [];
	const names = arg('suites').split(/[\s,]+/).filter(Boolean);
	const unknown = names.filter((n) => !registry.suites.some((s) => s.name === n));
	if (unknown.length) {
		console.error(`platform-suites-plan: unknown suite(s): ${unknown.join(', ')}. Known: ${registry.suites.map((s) => s.name).join(', ')}.`);
		process.exit(1);
	}
	const result = plan(registry, { event: arg('event'), changed, suites: names });
	const matrix = JSON.stringify({ include: result.include });
	if (argv.includes('--github-output') && process.env.GITHUB_OUTPUT) {
		fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${matrix}\ncount=${result.count}\n`);
	}
	console.log(JSON.stringify(result, null, 2));
}

module.exports = { plan, globToRegExp, PLUMBING };
