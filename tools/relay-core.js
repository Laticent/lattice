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
// answers "is it free?" from three records:
//   - the holder: the newest commit on the branch (merges included) that carries a Claude-Session
//     trailer, so a merge of main renews the holder and a person's web commit does not unseat it;
//   - the lease clock: GitHub's own timestamp for the push of the branch tip (the repository
//     activity API), never a commit date, which the committer's clock sets and which can predate the
//     push by hours; and the living comment's updated_at, also stamped by GitHub;
//   - the release: `baton: released` in the living comment, valid only while the branch tip is still
//     the `head:` it names, so any push after a release re-takes the baton.

const LEASE_MS = 60 * 60 * 1000; // D1: 60 minutes, two missed 30-minute checkpoints
const MARKER = '<!-- relay-handoff -->';

/**
 * The `Relay-Actor:` and `Claude-Session:` trailers of a commit message, read from its LAST paragraph
 * only (the trailer block): a session id quoted in the body, or a cherry-pick's copied trailers above
 * the real ones, must not name the author.
 */
function parseTrailers(message) {
  const lines = String(message).trim().split(/\r\n?|\n/);
  const blank = lines.findLastIndex((l) => !l.trim());
  let actor = null;
  let session = null;
  for (const line of lines.slice(blank + 1)) {
    const a = /^Relay-Actor:\s*(\S.*?)\s*$/.exec(line);
    if (a) actor = a[1];
    const s = /^Claude-Session:.*?\b(session_[A-Za-z0-9]+)\b/.exec(line);
    if (s) session = s[1];
  }
  return { actor, session };
}

/**
 * Read the living comment's BATON block: the first fenced block of a body that STARTS with the
 * marker. A comment that merely quotes the marker is not a living comment.
 * @returns {{released: boolean, holder: string|null, session: string|null, since: string|null, head: string|null}|null}
 */
function parseLiving(body) {
  if (typeof body !== 'string' || !body.startsWith(MARKER)) return null;
  const block = /```\n([\s\S]*?)\n```/.exec(body);
  const text = block ? block[1] : '';
  const line = (key) => {
    const m = new RegExp(`^${key}: (.*)$`, 'm').exec(text);
    return m ? m[1].trim() : null;
  };
  const holder = line('holder');
  const sm = holder && /\b(session_[A-Za-z0-9]+)\b/.exec(holder);
  const head = line('head');
  const gate = /^parked at ([0-9a-f]{7,40})$/.exec(line('gate') || '');
  return {
    released: line('baton') === 'released',
    gate: gate ? gate[1] : null,
    holder: holder ? holder.replace(/\s*·\s*session_[A-Za-z0-9]+.*$/, '') || null : null,
    session: sm ? sm[1] : null,
    since: line('since'),
    head: head && /^[0-9a-f]{7,40}$/.test(head) ? head : null,
  };
}

/**
 * Is the baton free?  Pure: every input is passed in, "now" included (HARD RULE #32).
 *
 * @param {object} o
 * @param {{sha: string, session: string|null, actor: string|null, pushedAt: number|null}|null} o.head
 *   the branch tip beyond main, with the holder read from the newest trailer-carrying commit and
 *   GitHub's push time for the tip (null when GitHub does not show it yet: read as "just pushed"),
 *   or null when the branch has no commits beyond main
 * @param {{released: boolean, head: string|null, updatedAt: number}|null} o.living the living
 *   comment, or null when the PR has none (or there is no PR yet)
 * @param {string|null} o.me this session's `session_<id>`
 * @param {number} o.now ms
 * @param {boolean} [o.override] a person typed "take over <branch>" in this session
 * @returns {{state: 'yours'|'free'|'held', reason: string, holder: string|null, actor: string|null, leaseLeftMs: number}}
 */
function batonVerdict({ head, living, me, now, override = false, leaseMs = LEASE_MS }) {
  if (!Number.isFinite(now)) throw new TypeError('batonVerdict needs now (ms)');
  const holder = head ? head.session : null;
  const actor = head ? head.actor : null;
  // An unknown push time is the safe reading: the push just happened, so the lease is fresh.
  const pushed = head ? (Number.isFinite(head.pushedAt) ? head.pushedAt : now) : -Infinity;
  const last = Math.max(pushed, living ? living.updatedAt : -Infinity);
  const leaseLeftMs = Number.isFinite(last) ? Math.max(0, leaseMs - (now - last)) : 0;
  const v = (state, reason) => ({ state, reason, holder, actor, leaseLeftMs });

  if (!head) return v('free', 'no commits beyond main: a new line of work');
  // A release holds only while the tip is still the commit it was written at.
  const released = Boolean(living?.released && living.head && head.sha.startsWith(living.head));
  if (me && holder === me && !released) return v('yours', 'your session holds it (the newest commit with a session trailer)');
  if (released) return v('free', `the living comment says baton: released at ${living.head}, still the tip`);
  if (override) return v('free', 'a person typed "take over" in this session (the override)');
  if (leaseLeftMs === 0) {
    return v('free', `the lease expired: no push and no living-comment edit for ${Math.round(leaseMs / 60000)} minutes`);
  }
  if (!holder) return v('held', 'no commit on the branch carries a Claude-Session trailer (a person\'s work): wait out the lease or ask');
  return v('held', `held by ${actor ? `${actor} · ` : ''}${holder}`);
}

/** Replace one `key: value` line inside the living comment's BATON block. */
function setLivingLine(body, key, value) {
  const block = /```\n([\s\S]*?)\n```/.exec(body);
  if (!block) throw new RelayError('the living comment has no BATON block to edit');
  const re = new RegExp(`^${key}: .*$`, 'm');
  const inner = re.test(block[1]) ? block[1].replace(re, `${key}: ${value}`) : `${block[1]}\n${key}: ${value}`;
  return body.slice(0, block.index) + '```\n' + inner + '\n```' + body.slice(block.index + block[0].length);
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

/** The backup ref a race loser pushes to (owner's D1, 2026-11-22): `relay-rescue/<branch>/<session>`. */
function rescueRef(branch, session) {
  return `relay-rescue/${branch}/${session}`;
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

/** The login GitHub authenticates these calls as: the only author whose living comment counts. */
function authLogin(api) {
  const me = api('GET', 'user');
  if (!me?.login) throw new RelayError('could not read the authenticated GitHub login');
  return me.login;
}

/** The open PR whose head is `branch`, or null. */
function prForBranch(api, branch) {
  const owner = REPO.split('/')[0];
  const list = api('GET', `repos/${REPO}/pulls?state=open&head=${encodeURIComponent(`${owner}:${branch}`)}&per_page=5`);
  return Array.isArray(list) && list.length ? list[0] : null;
}

/**
 * The PR's living comment `{id, body, updatedAt(ms), url}`, or null: the OLDEST comment that starts
 * with the marker and was written by `login`. A stranger's comment, or a card that quotes the marker,
 * never counts (the repository is public).
 */
function livingComment(api, pr, login) {
  const comments = api('GET', `repos/${REPO}/issues/${pr}/comments?per_page=100`, { paginate: true });
  const c = comments.find((x) => typeof x.body === 'string' && x.body.startsWith(MARKER) && x.user?.login === login);
  return c ? { id: c.id, body: c.body, updatedAt: Date.parse(c.updated_at), url: c.html_url } : null;
}

/** GitHub's timestamp (ms) for the push that made `sha` the tip of `branch`, or null if not shown. */
function pushTime(api, branch, sha) {
  const ref = encodeURIComponent(`refs/heads/${branch}`);
  const list = api('GET', `repos/${REPO}/activity?ref=${ref}&activity_type=push&per_page=30`);
  const hit = Array.isArray(list) ? list.find((a) => a.after === sha) : null;
  const t = hit ? Date.parse(hit.timestamp) : Number.NaN;
  return Number.isFinite(t) ? t : null;
}

/** The holder: the newest of `commits` (newest first, `{message}`) whose trailers name a session. */
function holderOf(commits) {
  for (const c of commits) {
    const t = parseTrailers(c.message);
    if (t.session) return t;
  }
  return { actor: null, session: null };
}

/** The real git: fetch the branch and main, then read the tip and the holder beyond main. */
function readHead(branch, { fetch }) {
  const { spawnSync } = require('node:child_process');
  const git = (...args) => spawnSync('git', args, { encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
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
  const log = git('log', '-200', '--format=%H%x1f%B%x1e', `origin/main..origin/${branch}`);
  if (log.status !== 0) throw new RelayError(`git log origin/main..origin/${branch} failed (shallow clone?)`);
  const commits = log.stdout
    .split('\x1e')
    .map((r) => r.replace(/^\n/, ''))
    .filter((r) => r.includes('\x1f'))
    .map((r) => {
      const [sha, message] = r.split('\x1f');
      return { sha, message };
    });
  if (!commits.length) return { exists: true, head: null };
  return { exists: true, head: { sha: commits[0].sha, ...holderOf(commits) } };
}

/**
 * Everything the baton commands need, read once: the tip and holder (git), GitHub's push time for
 * the tip, the PR and its living comment, and the verdict. Shared by `npm run baton` and
 * `npm run card -- --living` so they can never disagree.
 */
function readBaton({ branch, pr = null, me, now, override = false, fetch = true, api = ghApi, git = readHead }) {
  const { exists, head: tip } = git(branch, { fetch });
  const head = tip ? { ...tip, pushedAt: pushTime(api, branch, tip.sha) } : null;
  const pull = pr ? api('GET', `repos/${REPO}/pulls/${pr}`) : exists ? prForBranch(api, branch) : null;
  const number = pull?.number ?? pr ?? null;
  const comment = number ? livingComment(api, number, authLogin(api)) : null;
  const parsed = comment ? parseLiving(comment.body) : null;
  const living = comment ? { released: parsed.released, head: parsed.head, updatedAt: comment.updatedAt } : null;
  const verdict = applyGate(batonVerdict({ head, living, me, now, override }), { gate: parsed?.gate, head, me, override });
  const ready = Boolean(pull && pull.state !== 'closed' && pull.draft === false);
  return { exists, head, pr: number, ready, comment, parsed, verdict };
}

/**
 * A branch parked at the merge gate (its 🚦 card is for this exact tip) is not takeable even with a free
 * baton: any push voids the card the owner is deciding on. Only a person's words reopen it (`override`).
 * The session that parked it is not locked out: it can still release again or refresh its handoff.
 */
function applyGate(verdict, { gate, head, me, override = false }) {
  if (!gate || !head?.sha.startsWith(gate) || verdict.state === 'held' || override) return verdict;
  if (me && verdict.holder === me) return verdict;
  return { ...verdict, state: 'held', reason: `parked at the merge gate at ${gate} (its 🚦 card is for this head); only the owner reopens it` };
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
 * writes it: the session in the newest trailer-carrying commit (so push first; the push takes the
 * baton). Every outside dependency is injected (HARD RULE #32).
 * @returns {{url: string, created: boolean}}
 */
function postLiving({ pr, card, extra, cardText, signatureLine, holderName, env, api = ghApi, git = readHead, now = Date.now() }) {
  const session = sessionId(env);
  if (!session) throw new RelayError('--living needs your session id: set LATTICE_SESSION=session_<id>', 64);
  const pull = api('GET', `repos/${REPO}/pulls/${pr}`);
  if (pull.state !== 'open') throw new RelayError(`PR #${pr} is ${pull.state}; a living comment belongs on an open PR`, 1);
  const branch = pull.head.ref;
  const { head, comment, parsed, verdict: v } = readBaton({ branch, pr, me: session, now, api, git });
  if (v.state === 'held') throw new RelayError(`the baton on ${branch} is ${v.reason}; only the holder writes its handoff`, 1);
  if (head && head.session !== session) {
    throw new RelayError(`the baton on ${branch} is free (${v.reason}) but not yours yet: push a commit first, the push takes it`, 1);
  }
  const at = new Date(now).toISOString();
  const body = buildLivingBody({
    cardText,
    card,
    extra,
    holder: `${holderName || 'unsigned (LATTICE_ACTOR not set)'} · ${session}`,
    since: parsed && parsed.session === session && parsed.since ? parsed.since : at,
    checkpoint: at,
    head: (head ? head.sha : pull.head.sha).slice(0, 7),
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
  LEASE_MS, MARKER, REPO, RelayError, parseTrailers, parseLiving, batonVerdict, setLivingLine, livingHeader, minutes, rescueRef,
  ghApi, authLogin, prForBranch, livingComment, pushTime, holderOf, readHead, readBaton, applyGate,
  FOOTER, nextStep, buildLivingBody, postLiving,
};

