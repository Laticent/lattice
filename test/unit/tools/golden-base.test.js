// prBaseRef (tools/lib/golden-base.mjs): golden-diff counts a PR's own goldens, not main's.
// Builds a throwaway repo shaped like a pull_request checkout: a stale base, main moved past it,
// and HEAD the merge of the PR into the moved main.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

let prBaseRef;
test.before(async () => {
	({ prBaseRef } = await import('../../../tools/lib/golden-base.mjs'));
});

function repo() {
	const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'golden-base-'));
	const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t', GIT_DIR: undefined, GIT_INDEX_FILE: undefined, GIT_WORK_TREE: undefined };
	delete env.GIT_DIR; delete env.GIT_INDEX_FILE; delete env.GIT_WORK_TREE;
	const git = (...a) => execFileSync('git', a, { cwd: dir, env, encoding: 'utf8' }).trim();
	const commit = (file, msg) => { fs.writeFileSync(path.join(dir, file), msg); git('add', file); git('commit', '-qm', msg); return git('rev-parse', 'HEAD'); };
	git('init', '-q', '-b', 'main');
	const stale = commit('a.pdf', 'stale base');
	git('checkout', '-qb', 'pr');
	commit('pr.pdf', 'the PR');
	git('checkout', '-q', 'main');
	const moved = commit('b.pdf', 'main re-blessed');
	git('merge', '-q', '--no-ff', '-m', 'merge', 'pr');
	return { dir, git, stale, moved };
}

test('a merge checkout with a stale base diffs against the merge\'s first parent', () => {
	const { dir, git, stale, moved } = repo();
	try {
		const r = prBaseRef(stale, dir, { pr: true });
		assert.equal(r.base, moved);
		assert.deepEqual(git('diff', '--name-only', r.base).split('\n'), ['pr.pdf'], 'only the PR\'s own file');
		assert.deepEqual(git('diff', '--name-only', stale).split('\n').sort(), ['b.pdf', 'pr.pdf'], 'the stale base also counts main\'s');
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a base that is already current, or HEAD that is no merge, is left alone', () => {
	const { dir, git, moved } = repo();
	try {
		assert.equal(prBaseRef(moved, dir, { pr: true }).base, moved);
		assert.equal(prBaseRef('no-such-ref', dir, { pr: true }).base, 'no-such-ref');
		git('checkout', '-q', 'pr');
		assert.equal(prBaseRef('main', dir, { pr: true }).base, 'main', 'HEAD that is no merge keeps its base');
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('outside a pull_request run a merge HEAD keeps its base: a local merge is not the PR shape', () => {
	const { dir, stale } = repo();
	try {
		assert.equal(prBaseRef(stale, dir).base, stale);
	} finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
