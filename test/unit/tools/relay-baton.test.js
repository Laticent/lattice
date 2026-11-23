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
    assert.deepEqual(relay.parseLiving(body), { released: false, gate: null, pause: null, holder: 'John Luke Picard', session: ME, since: 'x', head: 'abc1234' });
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

  test('no clock frees a branch: a holder quiet for days still holds it until it releases or the owner says take over', () => {
    const r = v({ head: head(THEM, T0 - 5 * 24 * 60 * MIN), living: { released: false, head: null } });
    assert.equal(r.state, 'held');
    assert.match(r.reason, /James Tiberius Kirk · session_TH02; it frees only when its holder releases it or the owner types "take over"/);
    assert.equal(Object.hasOwn(r, 'leaseLeftMs'), false);
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

  test('no commit carries a session trailer: held until a person says "take over", never free', () => {
    const r = v({ head: head(null, T0 - 5 * MIN, null) });
    assert.equal(r.state, 'held');
    assert.match(r.reason, /no commit on the branch carries a Claude-Session trailer/);
  });

  test('no session id of my own: another session cannot read as yours, nor can an unattributed one', () => {
    assert.equal(relay.batonVerdict({ head: head(THEM), living: null, me: null }).state, 'held');
    assert.equal(relay.batonVerdict({ head: head(null, T0, null), living: null, me: null }).state, 'held');
  });

  test('the override frees a held baton', () => assert.equal(v({ head: head(THEM), override: true }).state, 'free'));

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

  test('merging a rescue ref (another session\'s trailer) in without a trailer does not hand it the baton', () => {
    git('checkout', '-q', '-b', 'side');
    commit(`wip: rescued\n\n${trailer(THEM)}`);
    git('checkout', '-q', 'claude/relay');
    git('merge', '-q', '--no-ff', '-m', "Merge branch 'side'", 'side');
    git('push', '-q', 'origin', 'claude/relay');
    const r = relay.readHead('claude/relay', { fetch: true });
    assert.equal(r.head.session, ME);
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
    const code = run(['rescue', 'claude/relay'], { env: { LATTICE_SESSION: ME }, api: () => [], out: (s) => lines.push(s), err: (s) => lines.push(s) });
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
    const code = run(['rescue', 'claude/relay'], { env: { LATTICE_SESSION: NF }, api: () => [], out: (s) => lines.push(s), err: (s) => lines.push(s) });
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
    const code = run(argv, { env, gitRun, branchNow: () => 'claude/x', api: () => [], out: (s) => lines.push(s), err: (s) => lines.push(s) });
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

  test('after the push, rescue leaves a marked note on the PR (the loser cannot edit the living comment)', () => {
    const posts = [];
    const api = (method, p, opts = {}) => {
      if (p.includes('/pulls?')) return [{ number: 3427 }];
      if (method === 'POST') {
        posts.push({ p, body: opts.body.body });
        return { html_url: 'https://example.test/rescue-note' };
      }
      return [];
    };
    const gitRun = (args) => (args[0] === 'rev-list' ? { status: 0, stdout: '2\n', stderr: '' } : { status: 0, stdout: '', stderr: '' });
    const lines = [];
    const code = run(['rescue'], { env: { LATTICE_SESSION: ME }, api, gitRun, now: T0, branchNow: () => 'claude/x', out: (x) => lines.push(x), err: (x) => lines.push(x) });
    assert.equal(code, 0);
    assert.equal(posts.length, 1);
    assert.equal(posts[0].p, 'repos/Laticent/lattice/issues/3427/comments');
    assert.match(posts[0].body, /^<!-- relay-rescue -->/);
    assert.match(posts[0].body, /relay-rescue\/claude\/x\/session_ME01.*2 commits/s);
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
  const fakeApi = ({ comments = [COMMENT], draft, prs } = {}) => {
    const calls = [];
    const api = (method, p, opts = {}) => {
      calls.push({ method, p, body: opts.body });
      if (p === 'user') return { login: 'saden1' };
      if (p.includes('/pulls?')) return prs ?? [{ number: 3427, draft }];
      if (/\/pulls\/\d+$/.test(p)) return { number: Number(p.split('/').pop()), state: 'closed', draft: false };
      if (p.endsWith('/comments?per_page=100')) return [{ id: 1, user: { login: 'saden1' }, body: 'unrelated' }, ...comments];
      if (method === 'PATCH') return {};
      throw new Error(`unexpected ${method} ${p}`);
    };
    return { api, calls };
  };
  // Every git call these tests make goes to a fake: `take` pushes a claim commit, and the real
  // git must never be reached from a unit test (#32). `push` sets the claim push's result.
  const CLAIM = 'c1a1a0000000000000000000000000000000c1a1';
  const fakeGitRun = ({ push = { status: 0, stdout: '', stderr: '' }, branch = 'main', headAt = TIP } = {}) => {
    const gits = [];
    const gitRun = (args) => {
      gits.push(args);
      if (args[0] === 'rev-parse' && args[1].endsWith('^{tree}')) return { status: 0, stdout: 'tree0001\n' };
      if (args[0] === 'commit-tree') return { status: 0, stdout: `${CLAIM}\n` };
      if (args[0] === 'push') return push;
      if (args[0] === 'branch') return { status: 0, stdout: `${branch}\n` };
      if (args[0] === 'rev-parse' && args[1] === 'HEAD') return { status: 0, stdout: `${headAt}\n` };
      if (args[0] === 'merge') return { status: 0, stdout: '' };
      return { status: 0, stdout: '', stderr: '' };
    };
    return { gitRun, gits };
  };
  const go = (argv, { session = THEM, comments, draft, prs, env = { LATTICE_SESSION: ME }, git, gitOpts } = {}) => {
    const lines = [];
    const { api, calls } = fakeApi({ comments, draft, prs });
    const { gitRun, gits } = fakeGitRun(gitOpts);
    const code = run(argv, {
      env,
      api,
      gitRun,
      now: T0,
      git: git || (() => ({ exists: true, head: { sha: TIP, session, actor: null } })),
      // never the real checkout's branch: CI runs on a detached HEAD (#32)
      branchNow: () => 'claude/x',
      out: (s) => lines.push(s),
      err: (s) => lines.push(s),
    });
    return { code, text: lines.join('\n'), calls, gits };
  };

  test('status on a branch another session holds: exit 1, names the holder, no lease', () => {
    const r = go(['status', 'claude/x']);
    assert.equal(r.code, 1);
    assert.match(r.text, /HELD .*session_TH02/);
    assert.match(r.text, /living comment last edited 2 min ago/);
    assert.doesNotMatch(r.text, /\blease\b/);
  });

  test('take on a held branch: exit 1 and no write', () => {
    const r = go(['take', 'claude/x']);
    assert.equal(r.code, 1);
    assert.equal(r.calls.filter((c) => c.method !== 'GET').length, 0);
  });

  const RELEASED = () => ({ ...COMMENT, body: relay.setLivingLine(relay.setLivingLine(COMMENT.body, 'baton', 'released'), 'holder', `James Tiberius Kirk · ${THEM}`) });

  test('take on a released baton pushes an empty claim commit on the tip, never forced', () => {
    const r = go(['take', 'claude/x'], { comments: [RELEASED()], env: { LATTICE_SESSION: ME, LATTICE_ACTOR: 'picard' } });
    assert.equal(r.code, 0, r.text);
    assert.match(r.text, /FREE .*baton: released/);
    assert.match(r.text, /TAKEN: c1a1a00 is the tip of claude\/x/);
    // same tree as the tip, the tip as its only parent: it changes no file
    const ct = r.gits.find((a) => a[0] === 'commit-tree');
    assert.deepEqual(ct.slice(0, 4), ['commit-tree', 'tree0001', '-p', TIP]);
    const msg = ct[ct.indexOf('-m') + 1];
    assert.deepEqual(relay.parseTrailers(msg), relay.parseTrailers(`x\n\nRelay-Actor: John Luke Picard\nClaude-Session: https://claude.ai/code/${ME}`));
    assert.match(msg, /^chore\(relay\): take the baton\n/);
    assert.deepEqual(r.gits.filter((a) => a[0] === 'push'), [['push', 'origin', `${CLAIM}:refs/heads/claude/x`]]);
    assert.ok(!r.gits.flat().some((a) => /^(-f|--force|\+)/.test(a)));
  });

  test('two takers race: the one whose claim git rejects is told before it does any work (exit 1)', () => {
    const lost = go(['take', 'claude/x'], {
      comments: [RELEASED()],
      gitOpts: { push: { status: 1, stdout: '', stderr: ' ! [rejected]        c1a1a00 -> claude/x (fetch first)\nerror: failed to push some refs' } },
    });
    assert.equal(lost.code, 1, lost.text);
    assert.match(lost.text, /Not taken: another session's push landed on claude\/x first\. Do no work here/);
    assert.doesNotMatch(lost.text, /TAKEN/);
  });

  test('a loser at the same instant gets GitHub\'s ref-lock refusal: still exit 1, not 3 (the live race on #3482)', () => {
    // verbatim from the real race, 2026-11-23: the winner's claim landed while this push was in flight
    const stderr =
      " ! [remote rejected]     be04ac3030d5a487953cccc1a480ae46be0e6573 -> claude/relay-sim-handover (cannot lock ref 'refs/heads/claude/relay-sim-handover': is at 4436dfb3231d437af057afc9374ca4969bbe69f3 but expected b4675b4cf2d77a5412b4ab63af97e692783a281c)\nerror: failed to push some refs to 'https://github.com/Laticent/lattice'";
    const lost = go(['take', 'claude/x'], { comments: [RELEASED()], gitOpts: { push: { status: 1, stdout: '', stderr } } });
    assert.equal(lost.code, 1, lost.text);
    assert.match(lost.text, /Not taken: another session's push landed/);
  });

  test('a claim push that fails for another reason (a hook, the network): exit 3, never "taken"', () => {
    const r = go(['take', 'claude/x'], { comments: [RELEASED()], gitOpts: { push: { status: 1, stdout: 'build-check failed', stderr: 'error: failed to push some refs' } } });
    assert.equal(r.code, 3, r.text);
    assert.match(r.text, /NOT yours/);
    assert.match(r.text, /build-check failed/);
  });

  test('a checked-out branch at the old tip is fast-forwarded to the claim; anywhere else, told to merge', () => {
    const here = go(['take', 'claude/x'], { comments: [RELEASED()], gitOpts: { branch: 'claude/x', headAt: TIP } });
    assert.deepEqual(here.gits.find((a) => a[0] === 'merge'), ['merge', '--ff-only', '--quiet', CLAIM]);
    assert.match(here.text, /fast-forwarded/);
    const ahead = go(['take', 'claude/x'], { comments: [RELEASED()], gitOpts: { branch: 'claude/x', headAt: 'f00f00' } });
    assert.equal(ahead.gits.find((a) => a[0] === 'merge'), undefined);
    assert.match(ahead.text, /merge origin\/claude\/x into your local branch \(never rebase\)/);
  });

  test('take when you already hold it, or on a branch that does not exist yet: no claim push', () => {
    const mine = go(['take', 'claude/x'], { session: ME });
    assert.equal(mine.code, 0);
    assert.match(mine.text, /already hold it/);
    assert.equal(mine.gits.filter((a) => a[0] === 'push').length, 0);
    const fresh = go(['take', 'claude/new'], { git: () => ({ exists: false, head: null }) });
    assert.equal(fresh.code, 0, fresh.text);
    assert.match(fresh.text, /first push creates the branch/);
    assert.equal(fresh.gits.filter((a) => a[0] === 'push').length, 0);
  });

  test('take on a held branch makes no claim push', () => {
    assert.equal(go(['take', 'claude/x']).gits.filter((a) => a[0] === 'push' || a[0] === 'commit-tree').length, 0);
  });

  test('a branch that exists with no open PR is not takeable: open a draft first (rule 6)', () => {
    const r = go(['take', 'claude/x'], { session: ME, prs: [] });
    assert.equal(r.code, 1);
    assert.match(r.text, /Open a draft PR for claude\/x first/);
    assert.match(go(['status', 'claude/x'], { prs: [] }).text, /no open PR for claude\/x/);
  });

  test('a PR named with --pr that is closed: not open, so the line is not takeable and status says so', () => {
    const st = go(['status', 'claude/x', '--pr', '99'], { session: ME, comments: [] });
    assert.match(st.text, /no open PR for claude\/x \(#99 is closed\)/);
    assert.equal(go(['take', 'claude/x', '--pr', '99'], { session: ME, comments: [] }).code, 1);
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
    const released = { ...COMMENT, body: relay.setLivingLine(relay.setLivingLine(COMMENT.body, 'baton', 'released'), 'holder', `James Tiberius Kirk · ${THEM}`) };
    const ready = go(['take', 'claude/x'], { comments: [released], draft: false });
    assert.equal(ready.code, 1);
    assert.match(ready.text, /PR #3427 is ready, not a draft: .*npm run pr:park -- 3427/);
    const draft = go(['take', 'claude/x'], { comments: [released], draft: true });
    assert.equal(draft.code, 0, draft.text);
  });

  test('a branch parked at the merge gate is not takeable, even with a free baton; a person can reopen it', () => {
    // the parker (ME) holds the tip and wrote the gate; another session (OT) looks
    const parked = { ...COMMENT, body: relay.setLivingLine(relay.setLivingLine(COMMENT.body, 'baton', 'released'), 'gate', `parked at ${TIP.slice(0, 7)}`) };
    const other = { session: ME, env: { LATTICE_SESSION: 'session_OT03' } };
    const st = go(['status', 'claude/x'], { ...other, comments: [parked] });
    assert.equal(st.code, 1);
    assert.match(st.text, /parked at the merge gate at abc1234/);
    assert.equal(go(['take', 'claude/x'], { ...other, comments: [parked], draft: false }).code, 1);
    // A gate-parked PR is READY in real life. "take over" still owes the park first (rule 7):
    // --override passes the gate but never the ready-PR refusal, since a push voids the card.
    const readyOver = go(['take', 'claude/x', '--override'], { ...other, comments: [parked], draft: false });
    assert.equal(readyOver.code, 1, readyOver.text);
    assert.match(readyOver.text, /is ready, not a draft: .*pr:park/);
    // after npm run pr:park (now a draft), the override reopens it
    assert.equal(go(['take', 'claude/x', '--override'], { ...other, comments: [parked], draft: true }).code, 0);
    // without the override, the gate holds even on a draft
    assert.equal(go(['take', 'claude/x'], { ...other, comments: [parked], draft: true }).code, 1);
    // a gate for an OLDER head does not block: a push after parking re-opened the line
    const stale = { ...COMMENT, body: relay.setLivingLine(relay.setLivingLine(COMMENT.body, 'baton', 'released'), 'gate', 'parked at fff0000') };
    assert.doesNotMatch(go(['status', 'claude/x'], { ...other, comments: [stale] }).text, /merge gate/);
  });

  test('a release or gate written under a holder line that is not the tip holder is ignored (shared login)', () => {
    // the tip is THEM's, but the comment's BATON block names ME: a forgery or a stale edit
    const forged = { ...COMMENT, body: relay.setLivingLine(relay.setLivingLine(COMMENT.body, 'baton', 'released'), 'head', TIP.slice(0, 7)) };
    const r = go(['take', 'claude/x'], { env: { LATTICE_SESSION: 'session_OT03' }, comments: [forged] });
    assert.equal(r.code, 1);
    assert.match(r.text, /HELD .*session_TH02/);
    const gated = { ...forged, body: relay.setLivingLine(forged.body, 'gate', `parked at ${TIP.slice(0, 7)}`) };
    assert.doesNotMatch(go(['status', 'claude/x'], { env: { LATTICE_SESSION: 'session_OT03' }, comments: [gated] }).text, /merge gate/);
  });

  test('the session that parked it is not locked out: it can release again and its status is not "held"', () => {
    const parked = { ...COMMENT, body: relay.setLivingLine(relay.setLivingLine(COMMENT.body, 'baton', 'released'), 'gate', `parked at ${TIP.slice(0, 7)}`) };
    const again = go(['release', 'claude/x'], { session: ME, comments: [parked] });
    assert.equal(again.code, 0, again.text);
    assert.match(again.text, /already released/);
    const st = go(['status', 'claude/x'], { session: ME, comments: [parked] });
    assert.doesNotMatch(st.text, /HELD/);
  });

  test('release --gate on a baton already released adds the gate line', () => {
    const released = { ...COMMENT, body: relay.setLivingLine(COMMENT.body, 'baton', 'released') };
    const r = go(['release', 'claude/x', '--gate'], { session: ME, comments: [released] });
    assert.equal(r.code, 0, r.text);
    assert.match(r.text, /now parked at the merge gate/);
    assert.equal(relay.parseLiving(r.calls.find((c) => c.method === 'PATCH').body.body).gate, TIP.slice(0, 7));
  });

  test('release --gate writes released, the tip, and the gate line', () => {
    const r = go(['release', 'claude/x', '--gate'], { session: ME });
    assert.equal(r.code, 0, r.text);
    const parsed = relay.parseLiving(r.calls.find((c) => c.method === 'PATCH').body.body);
    assert.equal(parsed.released, true);
    assert.equal(parsed.gate, TIP.slice(0, 7));
  });

  test('release --pause marks a usage stop; status says paused', () => {
    const r = go(['release', 'claude/x', '--pause'], { session: ME });
    assert.equal(r.code, 0, r.text);
    const body = r.calls.find((c) => c.method === 'PATCH').body.body;
    assert.match(relay.parseLiving(body).pause, /^usage stop at \d{4}-\d\d-\d\dT/);
    const st = go(['status', 'claude/x'], { session: ME, comments: [{ ...COMMENT, body }] });
    assert.match(st.text, /paused: usage stop at/);
    assert.equal(go(['take', '--pause']).code, 64);
  });

  test('release by a holder the living comment does not name yet: it names this session, so others see the release', () => {
    // THEM wrote the comment; ME pushed since (ME holds the tip) but never ran card --living
    const stale = { ...COMMENT, body: relay.livingHeader({ baton: 'held', holder: `John Luke Picard · ${THEM}`, since: 's', checkpoint: 'c', head: 'fff0000', next: 'n' }) };
    const r = go(['release', 'claude/x'], { session: ME, comments: [stale], env: { LATTICE_SESSION: ME, LATTICE_ACTOR: 'kirk' } });
    assert.equal(r.code, 0, r.text);
    assert.match(r.text, /now names you/);
    const body = r.calls.find((c) => c.method === 'PATCH').body.body;
    const p = relay.parseLiving(body);
    assert.equal(p.session, ME);
    assert.equal(p.holder, 'James Tiberius Kirk');
    assert.equal(p.released, true);
    // the point: a third session now reads it free, not HELD by ME
    const t = go(['take', 'claude/x'], { session: ME, comments: [{ ...COMMENT, body }], draft: true, env: { LATTICE_SESSION: 'session_OT03' } });
    assert.equal(t.code, 0, t.text);
  });

  test('release --pause on an already-released baton still writes the pause line', () => {
    const released = { ...COMMENT, body: relay.setLivingLine(relay.setLivingLine(COMMENT.body, 'baton', 'released'), 'head', TIP.slice(0, 7)) };
    const r = go(['release', 'claude/x', '--pause'], { session: ME, comments: [released] });
    assert.equal(r.code, 0, r.text);
    assert.match(r.text, /already released .*stopped for usage/);
    const body = r.calls.find((c) => c.method === 'PATCH').body.body;
    assert.match(relay.parseLiving(body).pause, /^usage stop at /);
  });

  test('status shows paused only for a release it trusts', () => {
    // the comment names ME but THEM holds the tip: its release and pause are not trusted
    const forged = { ...COMMENT, body: relay.setLivingLine(relay.setLivingLine(relay.setLivingLine(COMMENT.body, 'baton', 'released'), 'head', TIP.slice(0, 7)), 'pause', 'usage stop at x') };
    assert.doesNotMatch(go(['status', 'claude/x'], { session: THEM, comments: [forged], env: { LATTICE_SESSION: 'session_OT03' } }).text, /paused/);
  });

  test('status lists rescue refs waiting on the branch', () => {
    const lines = [];
    const { api } = fakeApi();
    const gitRun = (args) =>
      args[0] === 'ls-remote' ? { status: 0, stdout: `0315cfbe\trefs/heads/relay-rescue/claude/x/session_RACEcccc\n`, stderr: '' } : { status: 0, stdout: '', stderr: '' };
    run(['status', 'claude/x'], { env: { LATTICE_SESSION: ME }, api, gitRun, now: T0, git: () => ({ exists: true, head: { sha: TIP, session: THEM, actor: null } }), out: (x) => lines.push(x), err: (x) => lines.push(x) });
    assert.match(lines.join('\n'), /rescue waiting: relay-rescue\/claude\/x\/session_RACEcccc \(0315cfb\)/);
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

  test('bad arguments: exit 64 (--now is gone with the lease)', () => {
    assert.equal(go(['grab']).code, 64);
    assert.equal(go(['status', '--pr', 'x']).code, 64);
    assert.equal(go(['status', '--override']).code, 64);
    assert.equal(go(['take', '--gate']).code, 64);
    assert.equal(go(['status', '--now', '2026-11-22T12:00:00Z']).code, 64);
  });
});
