#!/usr/bin/env node
/**
 * The relay baton: may this session push to a relay branch now? (HARD RULE #31, decision D1.)
 *
 * A relay branch belongs to its line of work, not to a session. Whoever holds the baton pushes:
 * the holder is the session in the newest first-parent commit (merges included) that carries a
 * `Claude-Session:` trailer. The baton is free only when the PR's living handoff comment says
 * `baton: released` (under the holder's own name, and while the tip is still the `head:` it names), or
 * when a person typed "take over <branch>" in this session (`--override`, which only a person's words
 * license). No clock frees it: silence alone never does (the owner, 2026-11-23). Taking it is pushing:
 * `take` pushes an empty claim commit on top of the tip, without --force. A push lands only if it
 * fast-forwards, so of two sessions racing for a free baton exactly one claim lands, and the loser is
 * refused before it has done any work (a later lost race: `rescue` saves its commits). A relay line always
 * has an open PR, because that is where its living comment and the board live.
 * Design: engineering/decisions/2026-11-22-two-person-relay.md.
 *
 * Usage:
 *   npm run baton -- status  [branch] [--pr N]          who holds it, and rescues waiting
 *   npm run baton -- take    [branch] [--pr N] [--override]   check it is free, then push a claim commit
 *   npm run baton -- release [branch] [--pr N] [--gate] write `baton: released` in the living comment;
 *                                                       --gate also marks it parked at the merge gate;
 *                                                       --pause marks a stop for usage (90%)
 *   npm run baton -- rescue  [branch]                   after a lost race: push your rejected commits to
 *                                                       `relay-rescue/<branch>/<session>` so they outlive the sandbox
 * Options: --no-fetch (trust local origin/<branch>).
 * branch defaults to the current branch. Your session id comes from LATTICE_SESSION or the cloud
 * harness's CLAUDE_CODE_REMOTE_SESSION_ID.
 *
 * Exit codes (the dangerous direction is a false "free", so anything unclear is not 0):
 *   0  free, or yours (release: released)
 *   1  held by another session, or not takeable (no open PR, a ready PR, parked at the merge gate),
 *      or (take) another session's claim landed first
 *      (release: not released, because you do not hold it or the PR has no living comment)
 *   3  could not check (remote, fetch, git log or GitHub failed)
 *  64  bad arguments, or no session id for take/release/rescue
 * take: 0 also means the claim commit landed; 3 the claim push failed for another reason.
 * rescue: 0 pushed (or nothing to rescue), 3 the push or a git read failed.
 */
const { spawnSync } = require('node:child_process');
const relay = require('./relay-core');

const VERBS = new Set(['status', 'take', 'release', 'rescue']);

function parseArgs(argv) {
  const o = { verb: null, branch: null, pr: null, fetch: true, override: false, gate: false, pause: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pr') {
      o.pr = Number(argv[++i]);
      if (!Number.isInteger(o.pr) || o.pr <= 0) throw new relay.RelayError('--pr needs a pull request number', 64);
    } else if (a === '--no-fetch') o.fetch = false;
    else if (a === '--override') o.override = true;
    else if (a === '--gate') o.gate = true;
    else if (a === '--pause') o.pause = true;
    else if (a.startsWith('-')) throw new relay.RelayError(`unknown option ${a}`, 64);
    else if (!o.verb) o.verb = a;
    else if (!o.branch) o.branch = a;
    else throw new relay.RelayError(`unexpected argument ${a}`, 64);
  }
  if (!VERBS.has(o.verb)) throw new relay.RelayError('give a verb: status, take, release or rescue', 64);
  if (o.override && o.verb !== 'take') throw new relay.RelayError('--override goes with take only', 64);
  if (o.gate && o.verb !== 'release') throw new relay.RelayError('--gate goes with release only', 64);
  if (o.pause && o.verb !== 'release') throw new relay.RelayError('--pause goes with release only', 64);
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
function rescue(branch, me, { gitRun, fetch, out, api, now }) {
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
    // The pre-push hook's reason can land on stdout or stderr; show the end of both.
    const tail = `${push.stdout || ''}\n${push.stderr || ''}`.trim().split('\n').slice(-20).join('\n');
    if (/\[rejected\]|non-fast-forward|fetch first/.test(push.stderr || '')) {
      throw new relay.RelayError(
        `${ref} already holds other commits (an earlier rescue). Keep both: git fetch origin ${ref} && git merge FETCH_HEAD, then rescue again. Never force it.\n${tail}`,
      );
    }
    throw new relay.RelayError(
      `git push to ${ref} failed (${push.status === null ? 'killed' : `exit ${push.status}`}); your commits are still only in this sandbox. If the pre-push hook refused it, fix what it names and rescue again (never --no-verify, #14):\n${tail}`,
    );
  }
  out(`rescue: pushed HEAD (${n} commit${n === 1 ? '' : 's'} beyond origin/${branch}) to ${ref}.`);
  // The loser cannot edit the living comment (holder only), so it leaves its own marked note on the PR,
  // which any session can post. A failure here is reported, never fatal: the commits are already safe.
  try {
    const pull = relay.prForBranch(api, branch);
    if (pull) {
      const body = `<!-- relay-rescue -->\n**Rescue waiting:** \`${ref}\` holds ${n} commit${n === 1 ? '' : 's'} from ${me} that lost the race to push \`${branch}\` (${new Date(now).toISOString()}). The baton holder merges it into the line (a merge commit with its own trailer) and deletes the ref.\n\n---\n_Generated by [Claude Code](https://claude.ai/code)_`;
      const made = api('POST', `repos/${relay.REPO}/issues/${pull.number}/comments`, { body: { body } });
      out(`  Noted on PR #${pull.number}: ${made.html_url || 'comment posted'}`);
    }
  } catch (e) {
    out(`  Could not note it on the PR (${e.message}); tell the owner the ref name.`);
  }
  out('  Name it in the living comment (or tell the owner if you cannot edit it), then stop. The baton holder');
  out('  merges it into the line of work; delete the ref once it is merged. Never force-push the line.');
  return 0;
}

/**
 * Claim a free baton atomically (the simulated handover, 2026-11-23): `take` used to record nothing,
 * so two takers could both read FREE and both start work, and the loser found out only at its first
 * push. Now `take` pushes an empty commit carrying this session's trailers on top of the tip, without
 * --force. The ref is the only compare-and-swap GitHub offers us (the living comment is editable by
 * either person under one login, so it cannot lock), and git lands only the claim that fast-forwards.
 * The commit has the tip's own tree, so it changes no file, and `git commit-tree` builds it without
 * touching the working tree.
 * @returns {number} exit code
 */
function claim(branch, me, head, { gitRun, env, out }) {
  const actor = relay.resolveActor(env, relay.loadRoster());
  const msg = [
    'chore(relay): take the baton',
    '',
    `Claims ${branch} at ${head.sha.slice(0, 7)} for this session (npm run baton -- take).`,
    'It changes no file; the push is the claim (engineering/workflow.md §Relay rule 4).',
    '',
    ...(actor.status === 'ok' ? [`Relay-Actor: ${actor.name}`] : []),
    `Claude-Session: https://claude.ai/code/${me}`,
  ].join('\n');
  const tree = gitRun(['rev-parse', `${head.sha}^{tree}`]);
  if (tree.status !== 0) throw new relay.RelayError(`could not read the tree of ${head.sha.slice(0, 7)}`);
  const made = gitRun(['commit-tree', tree.stdout.trim(), '-p', head.sha, '-m', msg]);
  if (made.status !== 0) throw new relay.RelayError(`could not build the claim commit (${(made.stderr || '').trim().split('\n').pop()})`);
  const sha = made.stdout.trim();
  out(`  Claiming: pushing an empty commit ${sha.slice(0, 7)} with your trailers (the pre-push hook runs first, about a minute)...`);
  const push = gitRun(['push', 'origin', `${sha}:refs/heads/${branch}`]);
  if (push.status !== 0) {
    const text = `${push.stdout || ''}${push.stderr || ''}`;
    // A loser that pushed after the winner gets git's `[rejected] (fetch first)`; one that pushed at the
    // same moment gets GitHub's `[remote rejected] (cannot lock ref ... but expected <old tip>)`, as the
    // live race on #3482 showed (2026-11-23). Both mean another claim landed.
    if (/non-fast-forward|fetch first|\[rejected\]|stale info|cannot lock ref .* but expected/.test(text)) {
      out(`  Not taken: another session's push landed on ${branch} first. Do no work here: fetch, run status, read the living comment.`);
      return 1;
    }
    out(`  The claim push failed, so the baton is NOT yours:\n${text.trim().split('\n').slice(-8).map((l) => `    ${l}`).join('\n')}`);
    return 3;
  }
  out(`  TAKEN: ${sha.slice(0, 7)} is the tip of ${branch}, carrying your trailers. Say so in the living comment (npm run card -- --living).`);
  // Bring a checked-out branch up to the claim, but only by fast-forward from the old tip.
  const here = gitRun(['branch', '--show-current']);
  if (here.status === 0 && here.stdout.trim() === branch) {
    const at = gitRun(['rev-parse', 'HEAD']);
    if (at.status === 0 && at.stdout.trim() === head.sha && gitRun(['merge', '--ff-only', '--quiet', sha]).status === 0) {
      out(`  Your local ${branch} is fast-forwarded to it.`);
      return 0;
    }
  }
  out(`  Before you work: git fetch origin ${branch} and merge origin/${branch} into your local branch (never rebase).`);
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
    const at = now;
    if (o.verb === 'rescue') return rescue(branch, me, { gitRun, fetch: o.fetch, out, api, now: at });

    const { exists, head, pr, open, ready, comment, parsed, verdict: v } = relay.readBaton({ branch, pr: o.pr, me, override: o.override, fetch: o.fetch, api, git });
    const where = `${branch}${pr ? ` (PR #${pr})` : ''}`;
    if (o.verb === 'status' || o.verb === 'take') {
      out(`baton for ${where}: ${v.state.toUpperCase()} — ${v.reason}`);
      if (comment) out(`  living comment last edited ${relay.ago(at - comment.updatedAt)} ago`);
      if (exists && !open) out(`  no open PR for ${branch}${pr ? ` (#${pr} is closed)` : ''}: a relay line always has one (rule 6), so it is not on the board`);
      if (!comment && pr) out(`  PR #${pr} has no living handoff comment yet: npm run card -- --living ${pr} <card.yml>`);
      if (parsed?.pause && v.reason.startsWith('the living comment says baton: released')) out(`  paused: ${parsed.pause} (the next session takes it with take; nothing here is finished)`);
      const ls = o.fetch ? gitRun(['ls-remote', 'origin', `refs/heads/${relay.rescueRef(branch, '')}*`]) : null;
      for (const r of ls && ls.status === 0 ? relay.parseRescueRefs(ls.stdout, branch) : []) {
        out(`  rescue waiting: ${r.ref} (${r.sha.slice(0, 7)}); the holder merges it in and deletes it`);
      }
      if (o.verb === 'take') {
        if (v.state === 'held') {
          out('  Not yours to push. Read the living comment; it frees only by its holder\'s release or the owner\'s "take over".');
          return 1;
        }
        if (exists && !open) {
          out(`  Open a draft PR for ${branch} first (§Relay rule 6): its living comment and the board need one.`);
          return 1;
        }
        if (v.state === 'free' && ready) {
          out(`  PR #${pr} is ready, not a draft: §Relay rule 7 says park it first (npm run pr:park -- ${pr}), then take`);
          out('  (with --override as well if the owner reopened a branch parked at the merge gate).');
          out('  A checkpoint push to a ready PR runs full CI, and one in the merge queue ejects it.');
          return 1;
        }
        if (v.state === 'yours') {
          out('  You already hold it. Keep checkpointing.');
          return 0;
        }
        if (!head) {
          out('  A new line of work: your first push creates the branch and takes it. Open a draft PR right after (rule 6).');
          return 0;
        }
        if (o.override) out('  Override used: only valid because a person typed "take over" in this session. Say so in the living comment.');
        return claim(branch, me, head, { gitRun, env, out });
      }
      return v.state === 'held' ? 1 : 0;
    }

    // release
    if (comment && v.state === 'free' && v.holder === me && v.reason.startsWith('the living comment says baton: released')) {
      if (o.gate || o.pause) {
        let body = comment.body;
        if (o.gate) body = relay.setLivingLine(body, 'gate', `parked at ${head.sha.slice(0, 7)}`);
        if (o.pause) body = relay.setLivingLine(body, 'pause', `usage stop at ${new Date(at).toISOString()}`);
        api('PATCH', `repos/${relay.REPO}/issues/comments/${comment.id}`, { body: { body } });
        out(`baton for ${where}: already released at ${head.sha.slice(0, 7)}; now${o.gate ? ' parked at the merge gate' : ''}${o.gate && o.pause ? ' and' : ''}${o.pause ? ' stopped for usage' : ''}.`);
        return 0;
      }
      out(`baton for ${where}: already released at ${head.sha.slice(0, 7)}.`);
      return 0;
    }
    if (v.state !== 'yours') {
      out(`baton for ${where}: you do not hold it (${v.reason}); nothing released.`);
      return 1;
    }
    if (!comment) {
      out(`baton for ${where}: not released: there is no living handoff comment to write it in${pr ? '' : ' (no open PR)'}. Write one with npm run card -- --living <PR>, then release.`);
      return 1;
    }
    // The release names the tip it was written at: any later push re-takes the baton.
    let body = comment.body;
    // A release counts only under the tip holder's own holder: line (trustedLiving). If the comment
    // still names an earlier holder (this session pushed but never ran card --living), name this
    // session, or the release would read RELEASED here and HELD to everyone else.
    const restamped = parsed?.session !== me;
    if (restamped) {
      const actor = relay.resolveActor(env, relay.loadRoster());
      body = relay.setLivingLine(body, 'holder', `${actor.status === 'ok' ? actor.name : 'unsigned (LATTICE_ACTOR not set)'} · ${me}`);
      body = relay.setLivingLine(body, 'since', new Date(at).toISOString());
    }
    body = relay.setLivingLine(body, 'baton', 'released');
    body = relay.setLivingLine(body, 'head', head.sha.slice(0, 7));
    body = relay.setLivingLine(body, 'checkpoint', new Date(at).toISOString());
    body = relay.setLivingLine(body, 'gate', o.gate ? `parked at ${head.sha.slice(0, 7)}` : 'open');
    body = relay.setLivingLine(body, 'pause', o.pause ? `usage stop at ${new Date(at).toISOString()}` : 'none');
    api('PATCH', `repos/${relay.REPO}/issues/comments/${comment.id}`, { body: { body } });
    out(`baton for ${where}: RELEASED at ${head.sha.slice(0, 7)}${o.gate ? ', parked at the merge gate' : ''}${o.pause ? ', stopped for usage' : ''} in ${comment.url}`);
    if (restamped) out(`  The living comment named an earlier holder; it now names you. Its next: line is still theirs: write your handoff with npm run card -- --living ${pr}.`);
    return 0;
  } catch (e) {
    err(`baton: ${e.message}`);
    return e instanceof relay.RelayError ? e.code : 3;
  }
}

module.exports = { run, parseArgs };

if (require.main === module) process.exit(run(process.argv.slice(2)));
