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
 *
 * Exit codes: 0 printed · 1 sign could not sign · 3 GitHub could not be read · 64 bad arguments.
 */
const relay = require('./relay-core');

const cell = (text) => String(text ?? '').replace(/[\\|]/g, '\\$&').replace(/\r?\n/g, ' ');

/**
 * Build the board rows. Every outside dependency is injected (HARD RULE #32).
 * @returns {string[]} markdown lines; a single "none" line when no PR has a living comment
 */
function board({ api = relay.ghApi, now = Date.now() } = {}) {
  const pulls = api('GET', `repos/${relay.REPO}/pulls?state=open&per_page=100`, { paginate: true });
  const rows = [];
  for (const pr of pulls) {
    if (pr.user && /\[bot\]$/.test(pr.user.login)) continue;
    const comment = relay.livingComment(api, pr.number);
    if (!comment) continue;
    const living = relay.parseLiving(comment.body);
    const commit = api('GET', `repos/${relay.REPO}/commits/${pr.head.sha}`);
    const trailers = relay.parseTrailers(commit.commit?.message || '');
    const head = { ...trailers, time: Date.parse(commit.commit?.committer?.date) };
    const v = relay.batonVerdict({
      head,
      living: { released: living.released, updatedAt: comment.updatedAt },
      me: null,
      now,
    });
    const next = (/^next:[ \t]*(.*)$/m.exec(comment.body) || [])[1] || '';
    const holder = [trailers.actor, trailers.session].filter(Boolean).join(' · ') || 'unattributed';
    const state = v.state === 'free' ? `free (${v.reason.startsWith('the living') ? 'released' : 'lease expired'})` : 'held';
    rows.push(`| [#${pr.number}](${comment.url}) | \`${cell(pr.head.ref)}\` | ${cell(holder)} | ${state} | ${v.state === 'free' ? '—' : relay.minutes(v.leaseLeftMs)} | ${cell(next)} |`);
  }
  if (!rows.length) return ['No open PR has a living handoff comment (`<!-- relay-handoff -->`).'];
  return ['| PR | branch | holder | baton | lease left | next |', '|---|---|---|---|---|---|', ...rows];
}

function run(argv, { env = process.env, api = relay.ghApi, now = Date.now(), out = console.log, err = console.error } = {}) {
  try {
    if (argv.length === 1 && argv[0] === 'sign') {
      const actor = relay.resolveActor(env, relay.loadRoster());
      if (actor.status !== 'ok') {
        err(`relay: ${actor.message}`);
        return 1;
      }
      out(relay.signature(actor.name, relay.sessionId(env)));
      return 0;
    }
    if (argv.length) {
      err('usage: npm run relay [-- sign]');
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
