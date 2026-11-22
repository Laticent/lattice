#!/usr/bin/env node
/**
 * The relay baton: may this session push to a relay branch now? (HARD RULE #31, decision D1.)
 *
 * A relay branch belongs to its line of work, not to a session. Whoever holds the baton pushes:
 * the holder is the session in the newest commit (merges included) that carries a `Claude-Session:`
 * trailer. The baton is free when the PR's living handoff comment says `baton: released` and the
 * branch tip is still the `head:` it names, when neither a push (timed by GitHub, not the commit
 * date) nor an edit of that comment has happened for 60 minutes, or when a person typed "take over
 * <branch>" in this session (`--override`, which only a person's words license). Taking it is pushing: a push without --force lands only if it
 * fast-forwards, so of two sessions racing for a free baton exactly one wins, and the loser's push
 * is rejected. Design: engineering/decisions/2026-11-22-two-person-relay.md.
 *
 * Usage:
 *   npm run baton -- status  [branch] [--pr N]          who holds it, and the lease left
 *   npm run baton -- take    [branch] [--pr N] [--override]   check it is free, then push to take it
 *   npm run baton -- release [branch] [--pr N]          write `baton: released` in the living comment
 *   npm run baton -- rescue  [branch]                   after a lost race: push your rejected commits to
 *                                                       `relay-rescue/<branch>/<session>` so they outlive the sandbox
 * Options: --no-fetch (trust local origin/<branch>), --now <ISO time> (for a dry run of the lease).
 * branch defaults to the current branch. Your session id comes from LATTICE_SESSION or the cloud
 * harness's CLAUDE_CODE_REMOTE_SESSION_ID.
 *
 * Exit codes (the dangerous direction is a false "free", so anything unclear is not 0):
 *   0  free, or yours (release: released)
 *   1  held by another session (release: not released, because you do not hold it or the PR has
 *      no living comment to write it in)
 *   3  could not check (remote, fetch, git log or GitHub failed)
 *  64  bad arguments, or no session id for take/release/rescue
 * rescue: 0 pushed (or nothing to rescue), 3 the push or a git read failed.
 */
const { spawnSync } = require('node:child_process');
const relay = require('./relay-core');

const VERBS = new Set(['status', 'take', 'release', 'rescue']);

function parseArgs(argv) {
  const o = { verb: null, branch: null, pr: null, fetch: true, now: null, override: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pr') {
      o.pr = Number(argv[++i]);
      if (!Number.isInteger(o.pr) || o.pr <= 0) throw new relay.RelayError('--pr needs a pull request number', 64);
    } else if (a === '--now') {
      const raw = argv[++i] || '';
      // An ISO time without a zone parses as local time; demand one so a dry run means the same everywhere.
      o.now = /(?:Z|[+-]\d\d:?\d\d)$/.test(raw) ? Date.parse(raw) : Number.NaN;
      if (!Number.isFinite(o.now)) throw new relay.RelayError('--now needs an ISO time with a zone, e.g. 2026-11-22T18:00:00Z', 64);
    } else if (a === '--no-fetch') o.fetch = false;
    else if (a === '--override') o.override = true;
    else if (a.startsWith('-')) throw new relay.RelayError(`unknown option ${a}`, 64);
    else if (!o.verb) o.verb = a;
    else if (!o.branch) o.branch = a;
    else throw new relay.RelayError(`unexpected argument ${a}`, 64);
  }
  if (!VERBS.has(o.verb)) throw new relay.RelayError('give a verb: status, take, release or rescue', 64);
  if (o.override && o.verb !== 'take') throw new relay.RelayError('--override goes with take only', 64);
  return o;
}

/**
 * The real git runner for rescue: `{status, stdout, stderr}`. No kill timer: the push runs the
 * pre-push hook (about a minute warm, several on a cold sandbox), and killing it mid-hook would turn
 * a slow save into a lost one.
 */
function realGit(args) {
  return spawnSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

/**
 * After a lost race (decision D1 of the owner's ❓ round, 2026-11-22): the commits git rejected
 * exist only in this sandbox, which can be wiped. Push them, without force, to
 * `relay-rescue/<branch>/<session>`. That ref is a backup, not a line of work: no PR opens from it,
 * the baton holder merges it into the line, and it is deleted after.
 * @returns {number} exit code
 */
function rescue(branch, me, { gitRun, fetch, out }) {
  const ref = relay.rescueRef(branch, me);
  if (gitRun(['check-ref-format', `refs/heads/${ref}`]).status !== 0) throw new relay.RelayError(`'${ref}' is not a valid ref name`, 64);
  if (fetch) {
    const f = gitRun(['fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`]);
    if (f.status !== 0) throw new relay.RelayError(`git fetch origin ${branch} failed`);
  }
  const ahead = gitRun(['rev-list', '--count', `origin/${branch}..HEAD`]);
  if (ahead.status !== 0) throw new relay.RelayError(`git rev-list origin/${branch}..HEAD failed`);
  const n = Number(ahead.stdout.trim());
  if (!n) {
    out(`rescue: nothing to rescue: HEAD has no commits beyond origin/${branch}.`);
    return 0;
  }
  out(`rescue: pushing HEAD to ${ref} (the pre-push hook runs first, about a minute)…`);
  const push = gitRun(['push', 'origin', `HEAD:refs/heads/${ref}`]);
  if (push.status !== 0) {
    const tail = (push.stderr || '').trim().split('\n').slice(-12).join('\n');
    if (/\[rejected\]|non-fast-forward|fetch first/.test(push.stderr || '')) {
      throw new relay.RelayError(
        `${ref} already holds other commits (an earlier rescue). Keep both: git fetch origin ${ref} && git merge FETCH_HEAD, then rescue again. Never force it.\n${tail}`,
      );
    }
    throw new relay.RelayError(`git push to ${ref} failed (${push.status === null ? 'killed' : `exit ${push.status}`}); your commits are still only in this sandbox:\n${tail}`);
  }
  out(`rescue: pushed HEAD (${n} commit${n === 1 ? '' : 's'} beyond origin/${branch}) to ${ref}.`);
  out('  Name it in the living comment (or tell the owner if you cannot edit it), then stop. The baton holder');
  out('  merges it into the line of work; delete the ref once it is merged. Never force-push the line.');
  return 0;
}

function currentBranch() {
  const r = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' });
  return r.stdout.trim();
}

/**
 * The whole command, with every outside dependency injected so tests need no network or clock.
 * @returns {number} exit code
 */
function run(argv, { env = process.env, git = relay.readHead, gitRun = realGit, api = relay.ghApi, now = Date.now(), branchNow = currentBranch, out = console.log, err = console.error } = {}) {
  try {
    const o = parseArgs(argv);
    const branch = (o.branch || branchNow() || '').replace(/^(refs\/heads\/|refs\/remotes\/|remotes\/)?(origin\/)?/, '');
    if (!branch) throw new relay.RelayError('no branch given and HEAD is detached', 64);
    const me = relay.sessionId(env);
    if (!me && o.verb !== 'status') throw new relay.RelayError(`${o.verb} needs your session id: set LATTICE_SESSION=session_<id>`, 64);
    const at = o.now ?? now;
    if (o.verb === 'rescue') return rescue(branch, me, { gitRun, fetch: o.fetch, out });

    const { head, pr, comment, verdict: v } = relay.readBaton({ branch, pr: o.pr, me, now: at, override: o.override, fetch: o.fetch, api, git });
    const where = `${branch}${pr ? ` (PR #${pr})` : ''}`;
    if (o.verb === 'status' || o.verb === 'take') {
      out(`baton for ${where}: ${v.state.toUpperCase()} — ${v.reason}`);
      if (v.holder && v.state !== 'free') out(`  lease left: ${relay.minutes(v.leaseLeftMs)}`);
      if (!comment && pr) out(`  PR #${pr} has no living handoff comment yet: npm run card -- --living ${pr} <card.yml>`);
      if (o.verb === 'take') {
        if (v.state === 'held') {
          out('  Not yours to push. Read the living comment, then wait for the lease or a release.');
          return 1;
        }
        out(
          o.override && v.state !== 'yours'
            ? '  Override used: only valid because a person typed "take over" in this session. Your next push takes it; say so in the living comment.'
            : v.state === 'yours'
            ? '  You already hold it. Keep checkpointing.'
            : '  Free. Your next push takes it: commit with your Relay-Actor and Claude-Session trailers and push (fast-forward only).\n  If git rejects the push, someone else won the race: fetch, run status, do not force.',
        );
      }
      return v.state === 'held' ? 1 : 0;
    }

    // release
    if (comment && v.state === 'free' && v.holder === me && v.reason.startsWith('the living comment says baton: released')) {
      out(`baton for ${where}: already released at ${head.sha.slice(0, 7)}.`);
      return 0;
    }
    if (v.state !== 'yours') {
      out(`baton for ${where}: you do not hold it (${v.reason}); nothing released.`);
      return 1;
    }
    if (!comment) {
      out(`baton for ${where}: not released: there is no living handoff comment to write it in${pr ? '' : ' (no open PR)'}. The baton frees on its own ${relay.minutes(v.leaseLeftMs)} after your last push or checkpoint.`);
      return 1;
    }
    // The release names the tip it was written at: any later push re-takes the baton.
    let body = relay.setLivingLine(comment.body, 'baton', 'released');
    body = relay.setLivingLine(body, 'head', head.sha.slice(0, 7));
    body = relay.setLivingLine(body, 'checkpoint', new Date(at).toISOString());
    api('PATCH', `repos/${relay.REPO}/issues/comments/${comment.id}`, { body: { body } });
    out(`baton for ${where}: RELEASED at ${head.sha.slice(0, 7)} in ${comment.url}`);
    return 0;
  } catch (e) {
    err(`baton: ${e.message}`);
    return e instanceof relay.RelayError ? e.code : 3;
  }
}

module.exports = { run, parseArgs };

if (require.main === module) process.exit(run(process.argv.slice(2)));
