// The commit golden-diff compares a PR against: the PR's OWN changes, not main's.
//
// CI hands golden-diff `github.event.pull_request.base.sha`, which is main as it was when the
// event's PR snapshot was taken. The job checks out GitHub's merge of the PR into CURRENT main,
// so diffing against that older sha also counts every golden main moved since. On #2503 that
// was 469 PDFs against the PR's 0 (#2492's re-bless), and rasterizing them ran the job into its
// 25-minute timeout (followups.d/2503-p3-golden-diff-stale-base.md).
//
// On a merge checkout HEAD^1 IS current main, so when the given base is an older ancestor of it
// this returns HEAD^1 instead — on a pull_request run only (`pr`). A local merge commit is not
// that shape: after `git pull` merges a branch that had merged main, HEAD^1 is the branch's own
// tip, and diffing against it would hide the branch's goldens (the checker, 2026-10-05). Anything
// else (no merge commit, a base that is not an ancestor, a git that cannot answer) returns the
// base unchanged.
import { execFileSync } from 'node:child_process';

/**
 * @param {string} base the ref the caller asked for
 * @param {string} cwd the repository
 * @param {{ pr?: boolean }} [opts] `pr`: HEAD is GitHub's pull_request merge ref
 * @returns {{ base: string, reason: string }} the ref to diff against, and why
 */
export function prBaseRef(base, cwd, { pr = false } = {}) {
  if (!pr) return { base, reason: 'not a pull_request run' };
  // An inherited GIT_DIR (a hook run from a worktree) would point every call at another repo.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const git = (...args) => execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  let parents;
  try {
    parents = git('rev-list', '--parents', '-n', '1', 'HEAD').split(/\s+/);
  } catch {
    return { base, reason: 'git could not read HEAD' };
  }
  if (parents.length !== 3) return { base, reason: 'HEAD is not a merge commit' };
  const main = parents[1];
  let wanted;
  try {
    wanted = git('rev-parse', '--verify', `${base}^{commit}`);
  } catch {
    return { base, reason: `"${base}" is not a commit here` };
  }
  if (wanted === main) return { base, reason: 'the base is already the merge\'s first parent' };
  try {
    git('merge-base', '--is-ancestor', wanted, main);
  } catch {
    return { base, reason: 'the base is not an ancestor of the merge\'s first parent' };
  }
  return { base: main, reason: `"${base}" is behind the merge's first parent; diffing against HEAD^1 (${main.slice(0, 7)}) so only this PR's goldens count` };
}
