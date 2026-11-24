#!/usr/bin/env node
/**
 * The relay board: every open PR's living handoff comment in one table, across both people's
 * accounts (session tags are invisible between accounts; a PR comment is not). Decision:
 * engineering/decisions/2026-11-22-two-person-relay.md, Tension 6.
 *
 * Usage:
 *   npm run relay            one markdown row per open PR that has a living comment:
 *                            PR, branch, holder, baton, last update, next step, claims, rescues
 *   npm run relay -- sign    print this session's signature line (`— <name> · session_<id>`) for
 *                            a PR body or comment; exit 1 with how to set LATTICE_ACTOR if it cannot
 *   npm run relay -- trailer print the `Relay-Actor: <name>` commit trailer, or exit 1 the same way
 *
 * Exit codes: 0 printed · 1 sign could not sign · 3 GitHub could not be read · 64 bad arguments.
 */
const relay = require('./relay-core');

const cell = (text) => String(text ?? '').replace(/[\\|`]/g, '\\$&').replace(/\r?\n/g, ' ');

/**
 * Build the board rows. Every outside dependency is injected (HARD RULE #32).
 * @returns {string[]} markdown lines; a single "none" line when no PR has a living comment
 */
/**
 * The first-parent line from `tip` through `commits` (newest-first REST records with `sha`, `parents`,
 * `commit.message`, `commit.committer.date`): the line's own history, so a merged-in side branch (a
 * rescue ref) never names the holder. Same reading as `readHead`'s `git log --first-parent`.
 */
function firstParentLine(commits, tip, stop = null) {
  const bySha = new Map(commits.map((c) => [c.sha, c]));
  const line = [];
  let reached = false;
  for (let c = bySha.get(tip); c; c = bySha.get(c.parents?.[0]?.sha)) {
    if (c.sha === stop) {
      reached = true;
      break;
    }
    line.push(c);
  }
  return Object.assign(line, { reached });
}

function board({ api = relay.ghApi, now = Date.now() } = {}) {
  const pulls = api('GET', `repos/${relay.REPO}/pulls?state=open&per_page=100`, { paginate: true });
  const login = relay.authLogin(api);
  const rows = [];
  for (const pr of pulls) {
    if (pr.user && /\[bot\]$/.test(pr.user.login)) continue;
    const comment = relay.livingComment(api, pr.number, login);
    if (!comment) continue;
    const parsed = relay.parseLiving(comment.body);
    // Same reading as `npm run baton`. The newest 100 commits from the tip (not the PR's commit list,
    // which stops at 250 oldest-first and so loses the newest on a long branch), walked first-parent.
    // The walk stops at the merge base, like readHead's `origin/main..`: past it lie main's squash
    // commits, whose trailers name unrelated sessions.
    let base = null;
    try {
      base = api('GET', `repos/${relay.REPO}/compare/${pr.base?.ref || 'main'}...${pr.head.sha}`)?.merge_base_commit?.sha || null;
    } catch {
      base = null;
    }
    const recent = api('GET', `repos/${relay.REPO}/commits?sha=${pr.head.sha}&per_page=100`);
    const line = firstParentLine(Array.isArray(recent) ? recent : [], pr.head.sha, base);
    const trailers = relay.holderOf(line.map((c) => ({ message: c.commit?.message || '' })));
    // Without the merge base no trailer can be told from main's, and a branch line longer than the
    // window with no trailer in it proves nothing: say we cannot tell rather than guess.
    const unknown = !base || (!trailers.session && !line.reached);
    const head = { sha: pr.head.sha, ...trailers };
    const living = relay.trustedLiving(parsed, comment, head);
    const v = relay.applyGate(relay.batonVerdict({ head, living, me: null }), { gate: living.gate, head, me: null });
    const next = (/^next: (.*)$/m.exec(comment.body) || [])[1] || '';
    const claims = (/\*\*CLAIMS\*\*\n((?:- .*\n?)+)/.exec(comment.body) || [])[1] || '';
    // GitHub refuses a trailing slash in this path (HTTP 400), so match the bare prefix and filter it.
    let rescues;
    try {
      const prefix = `refs/heads/${relay.rescueRef(pr.head.ref, '')}`;
      const refs = api('GET', `repos/${relay.REPO}/git/matching-refs/heads/relay-rescue/${pr.head.ref}`);
      rescues = Array.isArray(refs) ? refs.filter((r) => String(r.ref).startsWith(prefix)) : [];
    } catch {
      rescues = null;
    }
    const holder = unknown ? '? (run npm run baton -- status)' : [trailers.actor, trailers.session].filter(Boolean).join(' · ') || 'unattributed';
    let state = v.reason.startsWith('parked at the merge gate')
      ? 'parked at merge gate'
      : v.state === 'free'
        ? 'free (released)'
        : 'held';
    if (parsed.pause && living.released) state += `, paused (${parsed.pause})`;
    const updated = relay.ago(now - comment.updatedAt);
    const claimText = claims.trim().split('\n').filter(Boolean).map((l) => l.slice(2)).join('; ');
    const rescueText = rescues === null ? '?' : rescues.length ? `${rescues.length} waiting` : '';
    rows.push(
      `| [#${pr.number}](${comment.url}) | ${cell(pr.head.ref)} | ${cell(holder)} | ${state} | ${updated} ago | ${cell(next)} | ${cell(claimText)} | ${rescueText} |`,
    );
  }
  if (!rows.length) return ['No open PR has a living handoff comment (`<!-- relay-handoff -->`).'];
  return ['| PR | branch | holder | baton | last update | next | claims | rescues |', '|---|---|---|---|---|---|---|---|', ...rows];
}

function run(argv, { env = process.env, api = relay.ghApi, now = Date.now(), out = console.log, err = console.error } = {}) {
  try {
    if (argv.length === 1 && (argv[0] === 'sign' || argv[0] === 'trailer')) {
      const actor = relay.resolveActor(env, relay.loadRoster());
      if (actor.status !== 'ok') {
        err(`relay: ${actor.message}`);
        return 1;
      }
      out(argv[0] === 'sign' ? relay.signature(actor.name, relay.sessionId(env)) : `Relay-Actor: ${actor.name}`);
      return 0;
    }
    if (argv.length) {
      err('usage: npm run relay [-- sign | trailer]');
      return 64;
    }
    for (const line of board({ api, now })) out(line);
    return 0;
  } catch (e) {
    err(`relay: ${e.message}`);
    return e instanceof relay.RelayError ? e.code : 3;
  }
}

module.exports = { run, board, firstParentLine };

if (require.main === module) process.exit(run(process.argv.slice(2)));
