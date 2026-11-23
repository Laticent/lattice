#!/usr/bin/env node
/**
 * The relay board: every open PR's living handoff comment in one table, across both people's
 * accounts (session tags are invisible between accounts; a PR comment is not). Decision:
 * engineering/decisions/2026-11-22-two-person-relay.md, Tension 6.
 *
 * Usage:
 *   npm run relay            one markdown row per open PR that has a living comment:
 *                            PR, branch, holder, baton, lease left, next step
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
function board({ api = relay.ghApi, now = Date.now() } = {}) {
  const pulls = api('GET', `repos/${relay.REPO}/pulls?state=open&per_page=100`, { paginate: true });
  const login = relay.authLogin(api);
  const rows = [];
  for (const pr of pulls) {
    if (pr.user && /\[bot\]$/.test(pr.user.login)) continue;
    const comment = relay.livingComment(api, pr.number, login);
    if (!comment) continue;
    const living = relay.parseLiving(comment.body);
    // Same reading as `npm run baton`: holder from the newest trailer-carrying commit (merges
    // included), lease from GitHub's push time for the tip.
    const commits = api('GET', `repos/${relay.REPO}/pulls/${pr.number}/commits?per_page=100`, { paginate: true });
    const trailers = relay.holderOf(commits.map((c) => ({ message: c.commit?.message || '' })).reverse());
    const head = { sha: pr.head.sha, ...trailers, pushedAt: relay.pushTime(api, pr.head.ref, pr.head.sha) };
    const v = relay.applyGate(
      relay.batonVerdict({
        head,
        living: { released: living.released, head: living.head, updatedAt: comment.updatedAt },
        me: null,
        now,
      }),
      { gate: living.gate, head, me: null },
    );
    const next = (/^next: (.*)$/m.exec(comment.body) || [])[1] || '';
    const claims = (/\*\*CLAIMS\*\*\n((?:- .*\n?)+)/.exec(comment.body) || [])[1] || '';
    const holder = [trailers.actor, trailers.session].filter(Boolean).join(' · ') || 'unattributed';
    const state = v.reason.startsWith('parked at the merge gate')
      ? 'parked at merge gate'
      : v.state === 'free'
        ? `free (${v.reason.startsWith('the living') ? 'released' : 'lease expired'})`
        : 'held';
    const lease = v.state === 'free' ? '—' : relay.minutes(v.leaseLeftMs);
    const claimText = claims.trim().split('\n').filter(Boolean).map((l) => l.slice(2)).join('; ');
    rows.push(`| [#${pr.number}](${comment.url}) | ${cell(pr.head.ref)} | ${cell(holder)} | ${state} | ${lease} | ${cell(next)} | ${cell(claimText)} |`);
  }
  if (!rows.length) return ['No open PR has a living handoff comment (`<!-- relay-handoff -->`).'];
  return ['| PR | branch | holder | baton | lease left | next | claims |', '|---|---|---|---|---|---|---|', ...rows];
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

module.exports = { run, board };

if (require.main === module) process.exit(run(process.argv.slice(2)));
