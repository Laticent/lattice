/**
 * The two-person relay kernel: who is signing, and how a signature reads.
 * Pure apart from `loadRoster`, `ghApi` and `readHead` (the injectable defaults), so the card tool, the baton and their tests share one
 * definition. Design and the owner's decisions: engineering/decisions/2026-11-22-two-person-relay.md
 * (D3: the actor comes from the non-secret LATTICE_ACTOR variable, validated against the committed
 * roster `.github/actors.json`; unset means no signature, never a guessed name).
 */
const fs = require('node:fs');
const path = require('node:path');

const ROSTER_PATH = path.join(__dirname, '..', '.github', 'actors.json');

/** The committed roster: `{ key: "Display Name" }`, for example `{ picard: "John Luke Picard" }`. */
function loadRoster(file = ROSTER_PATH) {
  const roster = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!roster || typeof roster !== 'object' || Array.isArray(roster)) {
    throw new Error(`${file} must be a JSON object of { key: "Display Name" }`);
  }
  for (const [key, name] of Object.entries(roster)) {
    if (!/^[a-z][a-z0-9-]*$/.test(key) || typeof name !== 'string' || !name.trim()) {
      throw new Error(`${file}: "${key}" must be a lower-case key with a non-empty display name`);
    }
  }
  return roster;
}

const HOW_TO_SET = 'set it on your own cloud environment, then start a new session (a variable reaches a session only when it starts)';

/**
 * Who this session signs as.
 * @returns {{status: 'ok', key: string, name: string}
 *   | {status: 'unset', message: string}
 *   | {status: 'invalid', message: string}}
 */
function resolveActor(env, roster) {
  const raw = env.LATTICE_ACTOR;
  const keys = Object.keys(roster).join(' | ');
  if (raw === undefined || raw.trim() === '') {
    return { status: 'unset', message: `LATTICE_ACTOR is not set, so nothing is signed (valid: ${keys}); ${HOW_TO_SET}.` };
  }
  const key = raw.trim();
  if (!Object.hasOwn(roster, key)) {
    return {
      status: 'invalid',
      message: `LATTICE_ACTOR="${raw}" is not in .github/actors.json (valid: ${keys}); ${HOW_TO_SET}.`,
    };
  }
  return { status: 'ok', key, name: roster[key] };
}

/**
 * This session's id as it appears in the `Claude-Session:` trailer (`session_<id>`), or null.
 * LATTICE_SESSION wins; otherwise the cloud harness's CLAUDE_CODE_REMOTE_SESSION_ID (`cse_<id>`),
 * which names the same session with a different prefix.
 */
function sessionId(env) {
  for (const raw of [env.LATTICE_SESSION, env.CLAUDE_CODE_REMOTE_SESSION_ID]) {
    if (!raw) continue;
    const m = /^(?:session_|cse_)([A-Za-z0-9]+)$/.exec(raw.trim());
    if (m) return `session_${m[1]}`;
  }
  return null;
}

/** The signature line that goes ABOVE the usual footers: `— John Luke Picard · session_01…`. */
function signature(name, session) {
  return session ? `— ${name} · ${session}` : `— ${name}`;
}


// ── The baton (D1) ─────────────────────────────────────────────────────────────────────────────
// Who may push to a relay branch now. The lock itself is git: a push without --force lands only if
// it fast-forwards, so of two sessions racing for a free baton exactly one push wins. This code only
// answers "is it free?" from two records: the newest non-merge commit's trailers and time, and the
// PR's living handoff comment (`<!-- relay-handoff -->`), its `baton:` line and its updated_at.

const LEASE_MS = 60 * 60 * 1000; // D1: 60 minutes, two missed 30-minute checkpoints
const MARKER = '<!-- relay-handoff -->';

/** The LAST `Relay-Actor:` and `Claude-Session:` trailer lines of a commit message. */
function parseTrailers(message) {
  let actor = null;
  let session = null;
  for (const line of String(message).split(/\r?\n/)) {
    const a = /^Relay-Actor:\s*(\S.*?)\s*$/.exec(line);
    if (a) actor = a[1];
    const s = /^Claude-Session:.*?\b(session_[A-Za-z0-9]+)\b/.exec(line);
    if (s) session = s[1];
  }
  return { actor, session };
}

/**
 * Read the living comment's BATON block. Returns null when the body has no marker.
 * @returns {{released: boolean, holder: string|null, session: string|null, since: string|null}|null}
 */
function parseLiving(body) {
  if (typeof body !== 'string' || !body.includes(MARKER)) return null;
  const line = (key) => {
    const m = new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*$`, 'mi').exec(body);
    return m ? m[1] : null;
  };
  const baton = (line('baton') || '').toLowerCase();
  const holder = line('holder');
  const sm = holder && /\b(session_[A-Za-z0-9]+)\b/.exec(holder);
  return {
    released: baton.startsWith('released'),
    holder: holder ? holder.replace(/\s*·\s*session_[A-Za-z0-9]+.*$/, '') || null : null,
    session: sm ? sm[1] : null,
    since: line('since'),
  };
}

/**
 * Is the baton free?  Pure: every input is passed in, "now" included (HARD RULE #32).
 *
 * The holder is always the session in the newest non-merge commit's trailer: a push is what takes
 * the baton, so the record of who holds it is the one git already arbitrates. The living comment
 * adds two things only: `baton: released`, and its updated_at, which renews the lease like a push.
 *
 * @param {object} o
 * @param {{actor: string|null, session: string|null, time: number}|null} o.head newest non-merge
 *   commit beyond main (time in ms), or null when the branch has none
 * @param {{released: boolean, updatedAt: number}|null} o.living the living comment, or null when
 *   the PR has none (or there is no PR yet)
 * @param {string|null} o.me this session's `session_<id>`
 * @param {number} o.now ms
 * @param {boolean} [o.override] a person typed "take over <branch>" in this session
 * @returns {{state: 'yours'|'free'|'held', reason: string, holder: string|null, actor: string|null, leaseLeftMs: number}}
 */
function batonVerdict({ head, living, me, now, override = false, leaseMs = LEASE_MS }) {
  if (!Number.isFinite(now)) throw new TypeError('batonVerdict needs now (ms)');
  const holder = head ? head.session : null;
  const actor = head ? head.actor : null;
  const last = Math.max(head ? head.time : -Infinity, living ? living.updatedAt : -Infinity);
  const leaseLeftMs = Number.isFinite(last) ? Math.max(0, leaseMs - (now - last)) : 0;
  const v = (state, reason) => ({ state, reason, holder, actor, leaseLeftMs });

  if (!head) return v('free', 'no commits beyond main: a new line of work');
  // A release counts only if nothing was pushed after it: a later push re-took the baton.
  const released = Boolean(living?.released && living.updatedAt >= head.time);
  if (me && holder === me && !released) return v('yours', 'your session pushed the newest commit');
  if (released) return v('free', 'the living comment says baton: released');
  if (override) return v('free', 'a person typed "take over" in this session (the override)');
  if (leaseLeftMs === 0) {
    return v('free', `the lease expired: no push and no living-comment edit for ${Math.round(leaseMs / 60000)} minutes`);
  }
  if (!holder) return v('held', 'the newest commit has no Claude-Session trailer (a person, or GitHub): wait out the lease or ask');
  return v('held', `held by ${actor ? `${actor} · ` : ''}${holder}`);
}

/** Replace (or add) one `key: value` line inside the living comment's BATON block. */
function setLivingLine(body, key, value) {
  const re = new RegExp(`^${key}:.*$`, 'mi');
  if (re.test(body)) return body.replace(re, `${key}: ${value}`);
  return body.replace(MARKER, `${MARKER}\n${key}: ${value}`);
}

/** The BATON block that heads the living comment. Plain `key: value` lines so parseLiving reads it. */
function livingHeader({ baton, holder, since, checkpoint, head, next }) {
  return [
    MARKER,
    '**🔁 Relay handoff** · one comment, edited in place at every checkpoint (`npm run card -- --living`)',
    '',
    '```',
    `baton: ${baton}`,
    `holder: ${holder}`,
    `since: ${since}`,
    `checkpoint: ${checkpoint}`,
    `head: ${head}`,
    `next: ${next}`,
    '```',
  ].join('\n');
}

/** "42 min" / "0 min" for a lease. */
function minutes(ms) {
  return `${Math.ceil(ms / 60000)} min`;
}

// ── GitHub, through `gh api` (REST; cloud sessions cannot use GraphQL) ──────────────────────────

const REPO = 'Laticent/lattice';

class RelayError extends Error {
  constructor(message, code = 3) {
    super(message);
    this.code = code;
  }
}

/**
 * The real GitHub client. `body` goes as JSON on stdin; a GET with `paginate` returns every page
 * as one flat array. pr-draft.mjs's ghApi sends no body, which edits need, so this is its sibling.
 */
function ghApi(method, apiPath, { body, paginate = false } = {}) {
  const { spawnSync } = require('node:child_process');
  const args = ['api', '-X', method, apiPath];
  if (paginate) args.push('--paginate', '--slurp');
  if (body !== undefined) args.push('--input', '-');
  // The open-PR list runs to megabytes (each PR carries its full body and repo objects); spawnSync's
  // 1 MB default buffer failed it with ENOBUFS on the first real board run.
  const out = spawnSync('gh', args, {
    encoding: 'utf8',
    input: body === undefined ? undefined : JSON.stringify(body),
    maxBuffer: 256 * 1024 * 1024,
  });
  if (out.error) throw new RelayError(`could not run gh (${out.error.code || out.error.message})`);
  if (out.status !== 0) throw new RelayError(`gh api ${method} ${apiPath} failed: ${(out.stderr || out.stdout || '').trim() || `exit ${out.status}`}`);
  const data = out.stdout.trim() ? JSON.parse(out.stdout) : {};
  return paginate ? data.flat() : data;
}

/** The open PR whose head is `branch`, or null. */
function prForBranch(api, branch) {
  const owner = REPO.split('/')[0];
  const list = api('GET', `repos/${REPO}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=5`);
  return Array.isArray(list) && list.length ? list[0] : null;
}

/** The PR's living comment `{id, body, updatedAt(ms), url}`, or null. The oldest marked one wins. */
function livingComment(api, pr) {
  const comments = api('GET', `repos/${REPO}/issues/${pr}/comments?per_page=100`, { paginate: true });
  const c = comments.find((x) => typeof x.body === 'string' && x.body.includes(MARKER));
  return c ? { id: c.id, body: c.body, updatedAt: Date.parse(c.updated_at), url: c.html_url } : null;
}

/** The real git: fetch the branch and main, then read the newest non-merge commit beyond main. */
function readHead(branch, { fetch }) {
  const { spawnSync } = require('node:child_process');
  const git = (...args) => spawnSync('git', args, { encoding: 'utf8', timeout: 60000 });
  if (git('check-ref-format', '--branch', branch).status !== 0) throw new RelayError(`'${branch}' is not a valid branch name`, 64);
  if (fetch) {
    const ls = git('ls-remote', '--exit-code', '--heads', 'origin', branch);
    if (ls.status === 2) return { exists: false, head: null };
    if (ls.status !== 0) throw new RelayError(`could not ask the remote about origin/${branch} (git ls-remote exit ${ls.status})`);
    const f = git('fetch', '--quiet', 'origin', `+refs/heads/${branch}:refs/remotes/origin/${branch}`, '+refs/heads/main:refs/remotes/origin/main');
    if (f.status !== 0) throw new RelayError(`git fetch origin ${branch} main failed`);
  }
  for (const ref of [`origin/${branch}`, 'origin/main']) {
    if (git('rev-parse', '--verify', '--quiet', ref).status !== 0) throw new RelayError(`no local ref ${ref}: cannot tell; run without --no-fetch`);
  }
  const log = git('log', '--no-merges', '-1', '--format=%H%x1f%ct%x1f%B', `origin/main..origin/${branch}`);
  if (log.status !== 0) throw new RelayError(`git log origin/main..origin/${branch} failed (shallow clone?)`);
  if (!log.stdout.trim()) return { exists: true, head: null };
  const [sha, ct, body] = log.stdout.split('\x1f');
  return { exists: true, head: { sha, time: Number(ct) * 1000, ...parseTrailers(body) } };
}


// ── The living handoff comment (Tension 3) ──────────────────────────────────────────────────────

const FOOTER = '---\n_Generated by [Claude Code](https://claude.ai/code)_';

/** What `next:` says: the card's own first step, else its ask. */
function nextStep(card) {
  if (card.first) return card.first;
  if (Array.isArray(card.priorities) && card.priorities[0]) return `P1: ${card.priorities[0].title}`;
  return card.ask || 'see the card';
}

/**
 * The whole living comment, pure. `extra` is the YAML's optional `relay:` block: `traps`,
 * `unverified` and `claims` lists, for the facts a 🎯 card has no field for (#3410's second section).
 */
function buildLivingBody({ cardText, card, extra = {}, holder, since, checkpoint, head, signatureLine }) {
  const parts = [livingHeader({ baton: 'held', holder, since, checkpoint, head, next: nextStep(card) }), '', cardText];
  const list = (title, items) => {
    if (Array.isArray(items) && items.length) parts.push('', `**${title}**`, ...items.map((t) => `- ${t}`));
  };
  list('TRAPS', extra.traps);
  list('UNVERIFIED', extra.unverified);
  list('CLAIMS', extra.claims);
  parts.push('', ...(signatureLine ? [signatureLine, ''] : []), FOOTER);
  return parts.join('\n');
}

/**
 * Create or edit the PR's living comment for `npm run card -- --living <PR>`. Only the baton holder
 * writes it: the session that pushed the newest commit (so push first; the push takes the baton).
 * Every outside dependency is injected (HARD RULE #32).
 * @returns {{url: string, created: boolean}}
 */
function postLiving({ pr, card, extra, cardText, signatureLine, holderName, env, api = ghApi, git = readHead, now = Date.now() }) {
  const session = sessionId(env);
  if (!session) throw new RelayError('--living needs your session id: set LATTICE_SESSION=session_<id>', 64);
  const pull = api('GET', `repos/${REPO}/pulls/${pr}`);
  if (pull.state !== 'open') throw new RelayError(`PR #${pr} is ${pull.state}; a living comment belongs on an open PR`, 1);
  const { head } = git(pull.head.ref, { fetch: true });
  const comment = livingComment(api, pr);
  const prior = comment ? parseLiving(comment.body) : null;
  const v = batonVerdict({ head, living: comment ? { released: prior.released, updatedAt: comment.updatedAt } : null, me: session, now });
  if (v.state === 'held') throw new RelayError(`the baton on ${pull.head.ref} is ${v.reason}; only the holder writes its handoff`, 1);
  if (head && head.session !== session) {
    throw new RelayError(`the baton on ${pull.head.ref} is free (${v.reason}) but not yours yet: push a commit first, the push takes it`, 1);
  }
  const at = new Date(now).toISOString();
  const body = buildLivingBody({
    cardText,
    card,
    extra,
    holder: `${holderName || 'unsigned (LATTICE_ACTOR not set)'} · ${session}`,
    since: prior && prior.session === session && prior.since ? prior.since : at,
    checkpoint: at,
    head: head ? head.sha.slice(0, 7) : pull.head.sha.slice(0, 7),
    signatureLine,
  });
  if (comment) {
    api('PATCH', `repos/${REPO}/issues/comments/${comment.id}`, { body: { body } });
    return { url: comment.url, created: false };
  }
  const made = api('POST', `repos/${REPO}/issues/${pr}/comments`, { body: { body } });
  return { url: made.html_url, created: true };
}

module.exports = {
  ROSTER_PATH, loadRoster, resolveActor, sessionId, signature, HOW_TO_SET,
  LEASE_MS, MARKER, REPO, RelayError, parseTrailers, parseLiving, batonVerdict, setLivingLine, livingHeader, minutes,
  ghApi, prForBranch, livingComment, readHead, FOOTER, nextStep, buildLivingBody, postLiving,
};

