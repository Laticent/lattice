#!/usr/bin/env node
/**
 * The relay baton: may this session push to a relay branch now? (HARD RULE #31, decision D1.)
 *
 * A relay branch belongs to its line of work, not to a session. Whoever holds the baton pushes:
 * the holder is the session in the newest non-merge commit's `Claude-Session:` trailer. The baton
 * is free when the PR's living handoff comment says `baton: released`, when neither a push nor an
 * edit of that comment has happened for 60 minutes, or when a person typed "take over <branch>" in
 * this session (`--override`). Taking it is pushing: a push without --force lands only if it
 * fast-forwards, so of two sessions racing for a free baton exactly one wins, and the loser's push
 * is rejected. Design: engineering/decisions/2026-11-22-two-person-relay.md.
 *
 * Usage:
 *   npm run baton -- status  [branch] [--pr N]          who holds it, and the lease left
 *   npm run baton -- take    [branch] [--pr N] [--override]   check it is free, then push to take it
 *   npm run baton -- release [branch] [--pr N]          write `baton: released` in the living comment
 * Options: --no-fetch (trust local origin/<branch>), --now <ISO time> (for a dry run of the lease).
 * branch defaults to the current branch. Your session id comes from LATTICE_SESSION or the cloud
 * harness's CLAUDE_CODE_REMOTE_SESSION_ID.
 *
 * Exit codes (the dangerous direction is a false "free", so anything unclear is not 0):
 *   0  free, or yours (release: released)
 *   1  held by another session (release: you do not hold it)
 *   3  could not check (remote, fetch, git log or GitHub failed)
 *  64  bad arguments, or no session id for take/release
 */
const { spawnSync } = require('node:child_process');
const relay = require('./relay-core');

const VERBS = new Set(['status', 'take', 'release']);

function parseArgs(argv) {
  const o = { verb: null, branch: null, pr: null, fetch: true, now: null, override: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pr') {
      o.pr = Number(argv[++i]);
      if (!Number.isInteger(o.pr) || o.pr <= 0) throw new relay.RelayError('--pr needs a pull request number', 64);
    } else if (a === '--now') {
      o.now = Date.parse(argv[++i]);
      if (!Number.isFinite(o.now)) throw new relay.RelayError('--now needs an ISO time, e.g. 2026-11-22T18:00:00Z', 64);
    } else if (a === '--no-fetch') o.fetch = false;
    else if (a === '--override') o.override = true;
    else if (a.startsWith('-')) throw new relay.RelayError(`unknown option ${a}`, 64);
    else if (!o.verb) o.verb = a;
    else if (!o.branch) o.branch = a;
    else throw new relay.RelayError(`unexpected argument ${a}`, 64);
  }
  if (!VERBS.has(o.verb)) throw new relay.RelayError('give a verb: status, take or release', 64);
  if (o.override && o.verb !== 'take') throw new relay.RelayError('--override goes with take only', 64);
  return o;
}

function currentBranch() {
  const r = spawnSync('git', ['branch', '--show-current'], { encoding: 'utf8' });
  return r.stdout.trim();
}

/**
 * The whole command, with every outside dependency injected so tests need no network or clock.
 * @returns {number} exit code
 */
function run(argv, { env = process.env, git = relay.readHead, api = relay.ghApi, now = Date.now(), branchNow = currentBranch, out = console.log, err = console.error } = {}) {
  try {
    const o = parseArgs(argv);
    const branch = (o.branch || branchNow() || '').replace(/^(refs\/heads\/|refs\/remotes\/|remotes\/)?(origin\/)?/, '');
    if (!branch) throw new relay.RelayError('no branch given and HEAD is detached', 64);
    const me = relay.sessionId(env);
    if (!me && o.verb !== 'status') throw new relay.RelayError(`${o.verb} needs your session id: set LATTICE_SESSION=session_<id>`, 64);
    const at = o.now ?? now;

    const { exists, head } = git(branch, { fetch: o.fetch });
    let pr = o.pr;
    if (!pr && exists) pr = relay.prForBranch(api, branch)?.number ?? null;
    const comment = pr ? relay.livingComment(api, pr) : null;
    const parsed = comment ? relay.parseLiving(comment.body) : null;
    const living = comment ? { released: parsed.released, updatedAt: comment.updatedAt } : null;
    const v = relay.batonVerdict({ head, living, me, now: at, override: o.override });

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
          v.state === 'yours'
            ? '  You already hold it. Keep checkpointing.'
            : '  Free. Your next push takes it: commit with your Relay-Actor and Claude-Session trailers and push (fast-forward only).\n  If git rejects the push, someone else won the race: fetch, run status, do not force.',
        );
      }
      return v.state === 'held' ? 1 : 0;
    }

    // release
    if (v.holder === me && living && living.released && living.updatedAt >= head.time) {
      out(`baton for ${where}: already released.`);
      return 0;
    }
    if (v.state !== 'yours') {
      out(`baton for ${where}: you do not hold it (${v.reason}); nothing released.`);
      return 1;
    }
    if (!comment) {
      out(`baton for ${where}: no living handoff comment to write the release in${pr ? '' : ' (no open PR)'}. The baton frees on its own ${relay.minutes(v.leaseLeftMs)} after your last push.`);
      return 1;
    }
    const body = relay.setLivingLine(relay.setLivingLine(comment.body, 'baton', 'released'), 'checkpoint', new Date(at).toISOString());
    api('PATCH', `repos/${relay.REPO}/issues/comments/${comment.id}`, { body: { body } });
    out(`baton for ${where}: RELEASED in ${comment.url}`);
    return 0;
  } catch (e) {
    err(`baton: ${e.message}`);
    return e instanceof relay.RelayError ? e.code : 3;
  }
}

module.exports = { run, parseArgs };

if (require.main === module) process.exit(run(process.argv.slice(2)));
