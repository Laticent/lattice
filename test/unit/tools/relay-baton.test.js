/**
 * Unit: the relay baton (tools/baton.js + tools/relay-core.js; decision D1, HARD RULE #31).
 *
 * The dangerous direction is a false "free" while another session holds the branch, so most cases
 * are ways the verdict could wrongly free it. Every input is injected, "now" included (HARD RULE
 * #32): no clock, no network, no git.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const relay = require('../../../tools/relay-core');
const { run } = require('../../../tools/baton');

const MIN = 60 * 1000;
const T0 = Date.parse('2026-11-22T12:00:00Z');
const ME = 'session_ME01';
const THEM = 'session_TH02';
const head = (session, at = T0, actor = 'James Tiberius Kirk') => ({ sha: 'abc1234', session, actor, time: at });

describe('parseTrailers', () => {
  test('reads the LAST Relay-Actor and Claude-Session trailer lines', () => {
    const msg = 'feat(x): y\n\nmentions session_QUOTED in the body\n\nRelay-Actor: John Luke Picard\nClaude-Session: https://claude.ai/code/session_01AB\n';
    assert.deepEqual(relay.parseTrailers(msg), { actor: 'John Luke Picard', session: 'session_01AB' });
    assert.deepEqual(relay.parseTrailers('fix: no trailers'), { actor: null, session: null });
  });
});

describe('parseLiving', () => {
  const body = relay.livingHeader({ baton: 'held', holder: `John Luke Picard · ${ME}`, since: 'x', checkpoint: 'y', head: 'abc', next: 'z' });
  test('reads baton and holder from the header it writes', () => {
    assert.deepEqual(relay.parseLiving(body), { released: false, holder: 'John Luke Picard', session: ME, since: 'x' });
    assert.equal(relay.parseLiving(relay.setLivingLine(body, 'baton', 'released')).released, true);
  });
  test('a comment without the marker is not a living comment', () => {
    assert.equal(relay.parseLiving('baton: released'), null);
  });
});

describe('batonVerdict', () => {
  const v = (o) => relay.batonVerdict({ me: ME, living: null, now: T0, ...o });

  test('no commits beyond main: free', () => assert.equal(v({ head: null }).state, 'free'));
  test('my session pushed the newest commit: yours', () => assert.equal(v({ head: head(ME) }).state, 'yours'));

  test('another session pushed 59 minutes ago: held, 1 minute left', () => {
    const r = v({ head: head(THEM, T0 - 59 * MIN) });
    assert.equal(r.state, 'held');
    assert.equal(r.leaseLeftMs, MIN);
    assert.match(r.reason, /James Tiberius Kirk · session_TH02/);
  });

  test('exactly 60 quiet minutes: free (the lease is 60, not 61)', () => {
    assert.equal(v({ head: head(THEM, T0 - 60 * MIN) }).state, 'free');
  });

  test('a living-comment edit renews the lease like a push', () => {
    const r = v({ head: head(THEM, T0 - 90 * MIN), living: { released: false, updatedAt: T0 - 10 * MIN } });
    assert.equal(r.state, 'held');
    assert.equal(r.leaseLeftMs, 50 * MIN);
  });

  test('released and nothing pushed since: free, even seconds later', () => {
    assert.equal(v({ head: head(THEM, T0 - 5 * MIN), living: { released: true, updatedAt: T0 - 1 * MIN } }).state, 'free');
  });

  test('a push AFTER the release re-took the baton: held', () => {
    assert.equal(v({ head: head(THEM, T0 - 1 * MIN), living: { released: true, updatedAt: T0 - 5 * MIN } }).state, 'held');
  });

  test('my own released baton reads free, not yours', () => {
    assert.equal(v({ head: head(ME, T0 - 5 * MIN), living: { released: true, updatedAt: T0 - 1 * MIN } }).state, 'free');
  });

  test('a commit with no session trailer is held for the lease, never free', () => {
    const r = v({ head: head(null, T0 - 5 * MIN, null) });
    assert.equal(r.state, 'held');
    assert.match(r.reason, /no Claude-Session trailer/);
  });

  test('no session id of my own: another session cannot read as yours', () => {
    assert.equal(relay.batonVerdict({ head: head(THEM), living: null, me: null, now: T0 }).state, 'held');
    // null === null must not make an unattributed commit "yours"
    assert.equal(relay.batonVerdict({ head: head(null, T0, null), living: null, me: null, now: T0 }).state, 'held');
  });

  test('the override frees a held baton', () => {
    assert.equal(v({ head: head(THEM), override: true }).state, 'free');
  });

  test('no clock: refuses to guess', () => {
    assert.throws(() => relay.batonVerdict({ head: null, living: null, me: ME }), /now/);
  });
});

describe('npm run baton', () => {
  const COMMENT = {
    id: 99,
    html_url: 'https://example.test/c/99',
    updated_at: new Date(T0 - 2 * MIN).toISOString(),
    body: relay.livingHeader({ baton: 'held', holder: `John Luke Picard · ${ME}`, since: 's', checkpoint: 'c', head: 'abc', next: 'n' }),
  };
  const fakeApi = (comments = [COMMENT]) => {
    const calls = [];
    const api = (method, p, opts = {}) => {
      calls.push({ method, p, body: opts.body });
      if (p.includes('/pulls?')) return [{ number: 3427 }];
      if (p.endsWith('/comments?per_page=100')) return [{ id: 1, body: 'unrelated' }, ...comments];
      if (method === 'PATCH') return {};
      throw new Error(`unexpected ${method} ${p}`);
    };
    return { api, calls };
  };
  const go = (argv, { h = head(THEM, T0 - 5 * MIN), comments, env = { LATTICE_SESSION: ME }, git } = {}) => {
    const lines = [];
    const { api, calls } = fakeApi(comments);
    const code = run(argv, {
      env,
      api,
      now: T0,
      git: git || (() => ({ exists: true, head: h })),
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
    const r = go(['take', 'claude/x'], { h: head(THEM, T0 - 120 * MIN), comments: [old] });
    assert.equal(r.code, 0);
    assert.match(r.text, /FREE .*lease expired/);
    assert.match(r.text, /next push takes it/);
  });

  test('release when I hold it: one PATCH that says baton: released', () => {
    const r = go(['release', 'claude/x'], { h: head(ME, T0 - 5 * MIN) });
    assert.equal(r.code, 0, r.text);
    const patch = r.calls.filter((c) => c.method === 'PATCH');
    assert.equal(patch.length, 1);
    assert.equal(patch[0].p, 'repos/Laticent/lattice/issues/comments/99');
    assert.match(patch[0].body.body, /^baton: released$/m);
    assert.equal(relay.parseLiving(patch[0].body.body).released, true);
  });

  test('release when another session holds it: exit 1 and no write', () => {
    const r = go(['release', 'claude/x']);
    assert.equal(r.code, 1);
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
    const lines = [];
    const code = run(['status', 'claude/x'], {
      env: { LATTICE_SESSION: ME },
      now: T0,
      git: () => ({ exists: true, head: head(THEM) }),
      api: () => {
        throw new relay.RelayError('gh api GET … failed');
      },
      out: (s) => lines.push(s),
      err: (s) => lines.push(s),
    });
    assert.equal(code, 3);
  });

  test('bad arguments: exit 64', () => {
    assert.equal(go(['grab']).code, 64);
    assert.equal(go(['status', '--pr', 'x']).code, 64);
    assert.equal(go(['status', '--override']).code, 64);
  });
});
