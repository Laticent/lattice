/**
 * Unit: the relay baton (tools/baton.js + tools/relay-core.js; decision D1, HARD RULE #31).
 *
 * The dangerous direction is a false "free" while another session holds the branch, so most cases
 * are ways the verdict could wrongly free it. Every input is injected, "now" included (HARD RULE
 * #32); the readHead cases run git against a throwaway bare "origin" in a temp directory, never this
 * repo or the network.
 */
const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// A git hook exports GIT_DIR and friends; strip them so the scratch repos below never touch the real
// one (the leak #2404 found). `node --test` runs each file in its own process.
for (const k of Object.keys(process.env)) if (k.startsWith('GIT_')) delete process.env[k];

const relay = require('../../../tools/relay-core');
const { run } = require('../../../tools/baton');

const MIN = 60 * 1000;
const T0 = Date.parse('2026-11-22T12:00:00Z');
const ME = 'session_ME01';
const THEM = 'session_TH02';
const TIP = 'abc1234def567890';
const head = (session, pushedAt = T0, actor = 'James Tiberius Kirk', sha = TIP) => ({ sha, session, actor, pushedAt });
const trailer = (id, actor) => `${actor ? `Relay-Actor: ${actor}\n` : ''}Claude-Session: https://claude.ai/code/${id}`;

describe('parseTrailers', () => {
  test('reads the trailer block (the last paragraph) only', () => {
    const msg = `feat(x): y\n\nmentions session_QUOTED in the body\n\n${trailer('session_01AB', 'John Luke Picard')}\n`;
    assert.deepEqual(relay.parseTrailers(msg), { actor: 'John Luke Picard', session: 'session_01AB' });
    assert.deepEqual(relay.parseTrailers('fix: no trailers'), { actor: null, session: null });
  });

  test("a cherry-pick's copied trailers above the real block do not name the author", () => {
    const msg = `fix: z\n\n(cherry picked)\n${trailer('session_ORIG')}\n\nCo-Authored-By: someone\n`;
    assert.equal(relay.parseTrailers(msg).session, null);
  });
});

describe('holderOf', () => {
  test('a merge commit with a trailer at the tip names the holder (merging main renews it)', () => {
    const commits = [{ message: `Merge origin/main\n\n${trailer(ME)}` }, { message: `feat: a\n\n${trailer(THEM)}` }];
    assert.equal(relay.holderOf(commits).session, ME);
  });

  test("a person's web commit at the tip does not unseat the holder below it", () => {
    const commits = [{ message: 'Apply suggestion from review' }, { message: `feat: a\n\n${trailer(ME)}` }];
    assert.equal(relay.holderOf(commits).session, ME);
  });
});

describe('parseLiving', () => {
  const body = relay.livingHeader({ baton: 'held', holder: `John Luke Picard · ${ME}`, since: 'x', checkpoint: 'y', head: 'abc1234', next: 'z' });
  test('reads baton, holder and head from the header it writes', () => {
    assert.deepEqual(relay.parseLiving(body), { released: false, gate: null, holder: 'John Luke Picard', session: ME, since: 'x', head: 'abc1234' });
    assert.equal(relay.parseLiving(relay.setLivingLine(body, 'baton', 'released')).released, true);
  });

  test('a body that only quotes the marker is not a living comment', () => {
    assert.equal(relay.parseLiving('see `<!-- relay-handoff -->`\n\n```\nbaton: released\n```'), null);
    assert.equal(relay.parseLiving('baton: released'), null);
  });

  test('released means exactly "baton: released" inside the BATON block', () => {
    assert.equal(relay.parseLiving(relay.setLivingLine(body, 'baton', 'Released-not')).released, false);
    assert.equal(relay.parseLiving(relay.setLivingLine(body, 'baton', 'released-not')).released, false);
    const outside = `${body}\n\nbaton: released`;
    assert.equal(relay.parseLiving(outside).released, false);
  });
});

describe('batonVerdict', () => {
  const v = (o) => relay.batonVerdict({ me: ME, living: null, now: T0, ...o });

  test('no commits beyond main: free', () => assert.equal(v({ head: null }).state, 'free'));
  test('my session holds it: yours', () => assert.equal(v({ head: head(ME) }).state, 'yours'));

  test('another session pushed 59 minutes ago: held, 1 minute left', () => {
    const r = v({ head: head(THEM, T0 - 59 * MIN) });
    assert.equal(r.state, 'held');
    assert.equal(r.leaseLeftMs, MIN);
    assert.match(r.reason, /James Tiberius Kirk · session_TH02/);
  });

  test('exactly 60 quiet minutes: free (the lease is 60, not 61)', () => {
    assert.equal(v({ head: head(THEM, T0 - 60 * MIN) }).state, 'free');
    assert.equal(v({ head: head(THEM, T0 - 60 * MIN + 1000) }).state, 'held');
  });

  test('GitHub has not shown the push yet: read as just pushed, never as expired', () => {
    const r = v({ head: head(THEM, null) });
    assert.equal(r.state, 'held');
    assert.equal(r.leaseLeftMs, 60 * MIN);
  });

  test('a living-comment edit renews the lease like a push', () => {
    const r = v({ head: head(THEM, T0 - 90 * MIN), living: { released: false, head: null, updatedAt: T0 - 10 * MIN } });
    assert.equal(r.state, 'held');
    assert.equal(r.leaseLeftMs, 50 * MIN);
  });

  test('released at the current tip: free, even seconds later', () => {
    const living = { released: true, head: TIP.slice(0, 7), updatedAt: T0 - MIN };
    assert.equal(v({ head: head(THEM, T0 - 5 * MIN), living }).state, 'free');
  });

  test('a push after the release (a new tip) re-took the baton, whatever the clocks say', () => {
    const living = { released: true, head: 'fff0000', updatedAt: T0 - MIN };
    assert.equal(v({ head: head(THEM, T0 - 5 * MIN), living }).state, 'held');
  });

  test('a release with no head line does not free anything', () => {
    assert.equal(v({ head: head(THEM), living: { released: true, head: null, updatedAt: T0 } }).state, 'held');
  });

  test('my own released baton reads free, not yours', () => {
    const living = { released: true, head: TIP.slice(0, 7), updatedAt: T0 - MIN };
    assert.equal(v({ head: head(ME, T0 - 5 * MIN), living }).state, 'free');
  });

  test('no commit carries a session trailer: held for the lease, never free', () => {
    const r = v({ head: head(null, T0 - 5 * MIN, null) });
    assert.equal(r.state, 'held');
    assert.match(r.reason, /no commit on the branch carries a Claude-Session trailer/);
  });

  test('no session id of my own: another session cannot read as yours, nor can an unattributed one', () => {
    assert.equal(relay.batonVerdict({ head: head(THEM), living: null, me: null, now: T0 }).state, 'held');
    assert.equal(relay.batonVerdict({ head: head(null, T0, null), living: null, me: null, now: T0 }).state, 'held');
  });

  test('the override frees a held baton', () => assert.equal(v({ head: head(THEM), override: true }).state, 'free'));

  test('no clock: refuses to guess', () => {
    assert.throws(() => relay.batonVerdict({ head: null, living: null, me: ME }), /now/);
  });
});

describe('livingComment', () => {
  const marked = (id, login, at) => ({ id, user: { login }, body: `${relay.MARKER}\n\n\`\`\`\nbaton: held\n\`\`\``, updated_at: new Date(at).toISOString(), html_url: `u${id}` });
  const api = (comments) => () => comments;

  test('the OLDEST marker-first comment by our own login wins', () => {
    const c = relay.livingComment(api([{ id: 1, user: { login: 'saden1' }, body: 'hello' }, marked(2, 'saden1', T0), marked(3, 'saden1', T0 + MIN)]), 1, 'saden1');
    assert.equal(c.id, 2);
  });

  test("a stranger's comment, or a card quoting the marker, never counts", () => {
    const stranger = marked(4, 'someone-else', T0);
    const quoted = { id: 5, user: { login: 'saden1' }, body: `a card that says \`${relay.MARKER}\`\n\nbaton: released`, updated_at: new Date(T0).toISOString() };
    assert.equal(relay.livingComment(api([stranger, quoted]), 1, 'saden1'), null);
  });
});

describe('pushTime', () => {
  test("GitHub's timestamp for the push whose `after` is the tip; null when it is not listed", () => {
    const api = () => [
      { after: 'zzz', timestamp: '2026-11-22T11:00:00Z' },
      { after: TIP, timestamp: '2026-11-22T11:30:00Z' },
    ];
    assert.equal(relay.pushTime(api, 'claude/x', TIP), Date.parse('2026-11-22T11:30:00Z'));
    assert.equal(relay.pushTime(api, 'claude/x', 'nope'), null);
  });
});

describe('readHead (real git, throwaway origin)', () => {
  let root;
  let work;
  let cwd;
  const git = (...args) => execFileSync('git', args, { cwd: work, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const commit = (msg) => git('commit', '-q', '--allow-empty', '-m', msg);

  before(() => {
    cwd = process.cwd();
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-head-'));
    execFileSync('git', ['init', '-q', '--bare', '-b', 'main', path.join(root, 'origin.git')]);
    work = path.join(root, 'work');
    execFileSync('git', ['clone', '-q', path.join(root, 'origin.git'), work], { stdio: 'ignore' });
    git('config', 'user.name', 't');
    git('config', 'user.email', 't@example.test');
    git('checkout', '-q', '-b', 'main');
    commit('base');
    git('push', '-q', 'origin', 'main');
    git('checkout', '-q', '-b', 'claude/relay');
    commit(`feat: mine\n\n${trailer(ME, 'John Luke Picard')}`);
    commit('Apply suggestion from review');
    git('push', '-q', 'origin', 'claude/relay');
    process.chdir(work);
  });
  after(() => {
    process.chdir(cwd);
    fs.rmSync(root, { recursive: true, force: true });
  });

  test('the tip is the newest commit; the holder is the newest one with a trailer', () => {
    const r = relay.readHead('claude/relay', { fetch: true });
    assert.equal(r.exists, true);
    assert.equal(r.head.sha, git('rev-parse', 'HEAD').trim());
    assert.equal(r.head.session, ME);
    assert.equal(r.head.actor, 'John Luke Picard');
  });

  test('a branch the remote does not have reads as not existing, never as yours', () => {
    assert.deepEqual(relay.readHead('claude/nowhere', { fetch: true }), { exists: false, head: null });
  });

  test('--no-fetch with no local ref: could not check (exit code 3)', () => {
    assert.throws(() => relay.readHead('claude/also-nowhere', { fetch: false }), (e) => e.code === 3);
  });

  test('an invalid branch name: bad argument (64)', () => {
    assert.throws(() => relay.readHead('bad..name', { fetch: false }), (e) => e.code === 64);
  });

  test('rescue pushes commits the remote does not have to relay-rescue/<branch>/<session>, without force', () => {
    commit(`wip: rejected work\n\n${trailer(ME)}`);
    const lines = [];
    const code = run(['rescue', 'claude/relay'], { env: { LATTICE_SESSION: ME }, out: (s) => lines.push(s), err: (s) => lines.push(s) });
    assert.equal(code, 0, lines.join('\n'));
    assert.match(lines.join('\n'), /pushed HEAD \(1 commit beyond origin\/claude\/relay\) to relay-rescue\/claude\/relay\/session_ME01/);
    const remote = execFileSync('git', ['ls-remote', 'origin', `refs/heads/relay-rescue/claude/relay/${ME}`], { cwd: work, encoding: 'utf8' });
    assert.equal(remote.split('\t')[0], git('rev-parse', 'HEAD').trim());
    // the line of work itself is untouched
    assert.notEqual(git('rev-parse', 'origin/claude/relay').trim(), git('rev-parse', 'HEAD').trim());
  });

  test('a rescue ref that already holds other commits: exit 3 with how to keep both, never forced', () => {
    // its own session id and its own earlier rescue, so it never depends on another test (#32)
    const NF = 'session_NF01';
    const ref = `refs/heads/relay-rescue/claude/relay/${NF}`;
    git('reset', '-q', '--hard', 'origin/claude/relay');
    commit(`wip: first try\n\n${trailer(NF)}`);
    git('push', '-q', 'origin', `HEAD:${ref}`);
    git('reset', '-q', '--hard', 'origin/claude/relay');
    commit(`wip: different work\n\n${trailer(NF)}`);
    const before = execFileSync('git', ['ls-remote', 'origin', ref], { cwd: work, encoding: 'utf8' });
    const lines = [];
    const code = run(['rescue', 'claude/relay'], { env: { LATTICE_SESSION: NF }, out: (s) => lines.push(s), err: (s) => lines.push(s) });
    assert.equal(code, 3);
    assert.match(lines.join('\n'), /already holds other commits.*git merge FETCH_HEAD/s);
    const after = execFileSync('git', ['ls-remote', 'origin', ref], { cwd: work, encoding: 'utf8' });
    assert.equal(after, before, 'the earlier rescue is never overwritten');
  });
});

describe('npm run baton -- rescue', () => {
  const fakeGit = ({ ahead = '2', push = 0 } = {}) => {
    const calls = [];
    const gitRun = (args) => {
      calls.push(args);
      if (args[0] === 'rev-list') return { status: 0, stdout: `${ahead}\n`, stderr: '' };
      if (args[0] === 'push') return { status: push, stdout: '', stderr: push ? 'error: failed to push some refs' : '' };
      return { status: 0, stdout: '', stderr: '' };
    };
    return { gitRun, calls };
  };
  const go = (argv, { env = { LATTICE_SESSION: ME }, ...g } = {}) => {
    const { gitRun, calls } = fakeGit(g);
    const lines = [];
    const code = run(argv, { env, gitRun, branchNow: () => 'claude/x', api: () => { throw new Error('rescue must not call GitHub'); }, out: (s) => lines.push(s), err: (s) => lines.push(s) });
    return { code, calls, text: lines.join('\n') };
  };

  test('commits ahead: one push of HEAD to the rescue ref, never forced', () => {
    const r = go(['rescue']);
    assert.equal(r.code, 0, r.text);
    const pushes = r.calls.filter((c) => c[0] === 'push');
    assert.deepEqual(pushes, [['push', 'origin', 'HEAD:refs/heads/relay-rescue/claude/x/session_ME01']]);
    assert.ok(!r.calls.flat().some((a) => /^(-f|--force)/.test(a)));
  });

  test('fetches the line before counting; --no-fetch skips the fetch', () => {
    const fetched = go(['rescue']).calls.filter((c) => c[0] === 'fetch');
    assert.equal(fetched.length, 1);
    assert.match(fetched[0].join(' '), /refs\/heads\/claude\/x:refs\/remotes\/origin\/claude\/x/);
    assert.equal(go(['rescue', '--no-fetch']).calls.filter((c) => c[0] === 'fetch').length, 0);
  });

  test('nothing ahead of the remote: no push, exit 0', () => {
    const r = go(['rescue'], { ahead: '0' });
    assert.equal(r.code, 0);
    assert.equal(r.calls.filter((c) => c[0] === 'push').length, 0);
    assert.match(r.text, /nothing to rescue/);
  });

  test('the push fails: exit 3, never a false success', () => {
    const r = go(['rescue'], { push: 1 });
    assert.equal(r.code, 3);
    assert.doesNotMatch(r.text, /pushed/);
  });

  test('a pre-push hook that refuses on stdout: its reason reaches the session', () => {
    const lines = [];
    const gitRun = (args) =>
      args[0] === 'rev-list'
        ? { status: 0, stdout: '1\n', stderr: '' }
        : args[0] === 'push'
          ? { status: 1, stdout: 'LINT: 3 errors in tools/x.js\n', stderr: 'error: failed to push some refs\n' }
          : { status: 0, stdout: '', stderr: '' };
    const code = run(['rescue'], { env: { LATTICE_SESSION: ME }, gitRun, branchNow: () => 'claude/x', out: (x) => lines.push(x), err: (x) => lines.push(x) });
    assert.equal(code, 3);
    assert.match(lines.join('\n'), /LINT: 3 errors in tools\/x\.js/);
    assert.match(lines.join('\n'), /never --no-verify/);
  });

  test('no session id: exit 64', () => assert.equal(go(['rescue'], { env: {} }).code, 64));
});

describe('npm run baton', () => {
  const COMMENT = {
    id: 99,
    user: { login: 'saden1' },
    html_url: 'https://example.test/c/99',
    updated_at: new Date(T0 - 2 * MIN).toISOString(),
    body: relay.livingHeader({ baton: 'held', holder: `John Luke Picard · ${ME}`, since: 's', checkpoint: 'c', head: 'abc1234', next: 'n' }),
  };
  const fakeApi = ({ comments = [COMMENT], pushedAt = T0 - 5 * MIN, draft } = {}) => {
    const calls = [];
    const api = (method, p, opts = {}) => {
      calls.push({ method, p, body: opts.body });
      if (p === 'user') return { login: 'saden1' };
      if (p.includes('/pulls?')) return [{ number: 3427, draft }];
      if (p.includes('/activity?')) return [{ after: TIP, timestamp: new Date(pushedAt).toISOString() }];
      if (p.endsWith('/comments?per_page=100')) return [{ id: 1, user: { login: 'saden1' }, body: 'unrelated' }, ...comments];
      if (method === 'PATCH') return {};
      throw new Error(`unexpected ${method} ${p}`);
    };
    return { api, calls };
  };
  const go = (argv, { session = THEM, comments, pushedAt, draft, env = { LATTICE_SESSION: ME }, git } = {}) => {
    const lines = [];
    const { api, calls } = fakeApi({ comments, pushedAt, draft });
    const code = run(argv, {
      env,
      api,
      now: T0,
      git: git || (() => ({ exists: true, head: { sha: TIP, session, actor: null } })),
      // never the real checkout's branch: CI runs on a detached HEAD (#32)
      branchNow: () => 'claude/x',
      out: (s) => lines.push(s),
      err: (s) => lines.push(s),
    });
    return { code, text: lines.join('\n'), calls };
  };

  test('status on a branch another session holds: exit 1, names the holder and lease', () => {
    const r = go(['status', 'claude/x']);
    assert.equal(r.code, 1);
    assert.match(r.text, /HELD .*session_TH02/);
    assert.match(r.text, /lease left: 58 min/);
  });

  test('take on a held branch: exit 1 and no write', () => {
    const r = go(['take', 'claude/x']);
    assert.equal(r.code, 1);
    assert.equal(r.calls.filter((c) => c.method !== 'GET').length, 0);
  });

  test('take after the lease ran out: exit 0, tells you the push takes it', () => {
    const old = { ...COMMENT, updated_at: new Date(T0 - 120 * MIN).toISOString() };
    const r = go(['take', 'claude/x'], { comments: [old], pushedAt: T0 - 120 * MIN });
    assert.equal(r.code, 0);
    assert.match(r.text, /FREE .*lease expired/);
    assert.match(r.text, /next push takes it/);
  });

  test('release when I hold it: one PATCH that says released AND pins the tip', () => {
    const r = go(['release', 'claude/x'], { session: ME });
    assert.equal(r.code, 0, r.text);
    const patch = r.calls.filter((c) => c.method === 'PATCH');
    assert.equal(patch.length, 1);
    assert.equal(patch[0].p, 'repos/Laticent/lattice/issues/comments/99');
    const parsed = relay.parseLiving(patch[0].body.body);
    assert.equal(parsed.released, true);
    assert.equal(parsed.head, TIP.slice(0, 7));
  });

  test('release when another session holds it: exit 1 and no write', () => {
    const r = go(['release', 'claude/x']);
    assert.equal(r.code, 1);
    assert.equal(r.calls.filter((c) => c.method === 'PATCH').length, 0);
  });

  test('take on a free baton of a READY PR: exit 1, says to park it first (rule 7)', () => {
    const old = { ...COMMENT, updated_at: new Date(T0 - 120 * MIN).toISOString() };
    const ready = go(['take', 'claude/x'], { comments: [old], pushedAt: T0 - 120 * MIN, draft: false });
    assert.equal(ready.code, 1);
    assert.match(ready.text, /PR #3427 is ready, not a draft: .*npm run pr:park -- 3427/);
    const draft = go(['take', 'claude/x'], { comments: [old], pushedAt: T0 - 120 * MIN, draft: true });
    assert.equal(draft.code, 0, draft.text);
  });

  test('a branch parked at the merge gate is not takeable, even with a free baton; a person can reopen it', () => {
    const parked = { ...COMMENT, body: relay.setLivingLine(relay.setLivingLine(COMMENT.body, 'baton', 'released'), 'gate', `parked at ${TIP.slice(0, 7)}`) };
    const st = go(['status', 'claude/x'], { comments: [parked] });
    assert.equal(st.code, 1);
    assert.match(st.text, /parked at the merge gate at abc1234/);
    assert.equal(go(['take', 'claude/x'], { comments: [parked] }).code, 1);
    assert.equal(go(['take', 'claude/x', '--override'], { comments: [parked] }).code, 0);
    // a gate for an OLDER head does not block: a push after parking re-opened the line
    const stale = { ...COMMENT, body: relay.setLivingLine(relay.setLivingLine(COMMENT.body, 'baton', 'released'), 'gate', 'parked at fff0000') };
    assert.doesNotMatch(go(['status', 'claude/x'], { comments: [stale] }).text, /merge gate/);
  });

  test('release --gate writes released, the tip, and the gate line', () => {
    const r = go(['release', 'claude/x', '--gate'], { session: ME });
    assert.equal(r.code, 0, r.text);
    const parsed = relay.parseLiving(r.calls.find((c) => c.method === 'PATCH').body.body);
    assert.equal(parsed.released, true);
    assert.equal(parsed.gate, TIP.slice(0, 7));
  });

  test('release twice: the second is a no-op success', () => {
    const released = { ...COMMENT, body: relay.setLivingLine(COMMENT.body, 'baton', 'released') };
    const r = go(['release', 'claude/x'], { session: ME, comments: [released] });
    assert.equal(r.code, 0);
    assert.match(r.text, /already released/);
    assert.equal(r.calls.filter((c) => c.method === 'PATCH').length, 0);
  });

  test('take or release without a session id: exit 64', () => {
    assert.equal(go(['take', 'claude/x'], { env: {} }).code, 64);
    assert.equal(go(['release', 'claude/x'], { env: {} }).code, 64);
  });

  test('git could not check: exit 3, never "free"', () => {
    const r = go(['take', 'claude/x'], {
      git: () => {
        throw new relay.RelayError('git fetch origin claude/x main failed');
      },
    });
    assert.equal(r.code, 3);
    assert.doesNotMatch(r.text, /FREE/);
  });

  test('GitHub could not be read: exit 3', () => {
    const code = run(['status', 'claude/x'], {
      env: { LATTICE_SESSION: ME },
      now: T0,
      git: () => ({ exists: true, head: { sha: TIP, session: THEM, actor: null } }),
      branchNow: () => 'claude/x',
      api: () => {
        throw new relay.RelayError('gh api GET … failed');
      },
      out: () => {},
      err: () => {},
    });
    assert.equal(code, 3);
  });

  test('no branch given: the current branch is used; a detached HEAD is a bad argument', () => {
    assert.equal(go(['status']).code, 1);
    const code = run(['status'], { env: { LATTICE_SESSION: ME }, now: T0, git: () => ({ exists: false, head: null }), api: () => [], branchNow: () => '', out: () => {}, err: () => {} });
    assert.equal(code, 64);
  });

  test('bad arguments: exit 64, including a --now with no zone', () => {
    assert.equal(go(['grab']).code, 64);
    assert.equal(go(['status', '--pr', 'x']).code, 64);
    assert.equal(go(['status', '--override']).code, 64);
    assert.equal(go(['take', '--gate']).code, 64);
    assert.equal(go(['status', '--now', '2026-11-22T12:00:00']).code, 64);
    assert.equal(go(['status', '--now', '2026-11-22T12:00:00Z']).code, 1);
  });
});
