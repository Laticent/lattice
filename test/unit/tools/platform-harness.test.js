/**
 * Unit: tools/platform-harness.js — the warm harness's pure parts: which comments are commands, which authors may drive
 * the runner, which rebuilds a change needs, and that no token reaches a job's environment.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { parseCommand, authorized, reservedEnv, canWrite, rebuildFor, inlineAssignments, redact, tail, jobEnv, MARK } = require(path.join(__dirname, '..', '..', '..', 'tools', 'platform-harness.js'));

test('a comment that does not start with /harness is not a command', () => {
  assert.equal(parseCommand('looks good'), null);
  assert.equal(parseCommand('please run /harness suite x'), null);
  assert.equal(parseCommand('/harnessing'), null);
  assert.equal(parseCommand(undefined), null);
});

test('suite takes a name and KEY=value pairs', () => {
  assert.deepEqual(parseCommand('/harness suite ios-safari-undo-iphone PROBE=undo DEVICES=iPhone'), {
    verb: 'suite', noBuild: false, suite: 'ios-safari-undo-iphone', env: { PROBE: 'undo', DEVICES: 'iPhone' },
  });
  assert.equal(parseCommand('/harness suite --no-build export-confine').noBuild, true);
  assert.equal(parseCommand('/harness suite').verb, 'invalid');
  assert.equal(parseCommand('/harness suite ../x').verb, 'invalid');
  assert.equal(parseCommand('/harness suite x lower=1').verb, 'invalid');
});

test('a job cannot set the variables that change what runs, or a token', () => {
  // SHELLOPTS=xtrace with PS4=$(…) ran a command in bash before this list was a family (red-team review, 2026-11-21).
  for (const name of ['PATH', 'NODE_OPTIONS', 'BASH_ENV', 'GH_TOKEN', 'DYLD_INSERT_LIBRARIES', 'SHELLOPTS', 'PS4', 'BASHOPTS',
    'GIT_CONFIG_COUNT', 'NPM_CONFIG_SCRIPT_SHELL', 'LD_LIBRARY_PATH', 'PERL5OPT', 'RUBYOPT', 'PYTHONPATH', 'GITHUB_ENV', 'MY_SECRET']) {
    const r = parseCommand(`/harness suite x ${name}=y`);
    assert.equal(r.verb, 'invalid', name);
    assert.match(r.error, /cannot be set/);
  }
  for (const name of ['DEBUG', 'PROBE', 'DEVICES', 'SUITE_DEADLINE', 'GITLAB']) assert.equal(reservedEnv(name), false, name);
});

test('sh runs the first bash fence, CRLF or not', () => {
  assert.deepEqual(parseCommand('/harness sh\nwhy: check the temp dir\n```bash\necho $TMPDIR\nls\n```\n'), {
    verb: 'sh', noBuild: false, script: 'echo $TMPDIR\nls\n',
  });
  assert.equal(parseCommand('/harness sh\r\n```sh\r\nuname -a\r\n```').script, 'uname -a\n');
  assert.equal(parseCommand('/harness sh\n```js\nx\n```').verb, 'invalid');
});

test('the small verbs', () => {
  assert.equal(parseCommand('/harness stop').verb, 'stop');
  assert.equal(parseCommand('/harness status').verb, 'status');
  assert.equal(parseCommand('/harness rerun --no-build').noBuild, true);
  assert.equal(parseCommand('/harness watch off').watch, false);
  assert.equal(parseCommand('/harness watch maybe').verb, 'invalid');
  assert.match(parseCommand('/harness deploy').error, /unknown verb/);
  assert.match(parseCommand('/harness').error, /\(none\)/);
});

test('only the dispatching login, after the session started, drives the runner', () => {
  const since = Date.parse('2026-11-17T18:00:00Z');
  const at = '2026-11-17T18:05:00Z';
  const c = (over) => ({ body: '/harness stop', user: { login: 'owner', id: 7 }, author_association: 'CONTRIBUTOR', created_at: at, updated_at: at, ...over });
  const who = { actorId: 7, since };
  // The job token reads a private org member as CONTRIBUTOR (run 44163967462): the association must not decide.
  assert.equal(authorized(c({}), who), true);
  assert.equal(authorized(c({ user: { login: 'someone', id: 8 }, author_association: 'OWNER' }), who), false, 'another user');
  assert.equal(authorized(c({ user: { login: 'owner', id: 9 } }), who), false, 'the login, claimed by someone else after a rename');
  assert.equal(authorized(c({ updated_at: '2026-11-17T18:06:00Z' }), who), false, 'an edited comment');
  assert.equal(authorized(c({ created_at: '2026-11-17T17:59:59Z', updated_at: '2026-11-17T17:59:59Z' }), who), false, 'before the session');
  assert.equal(authorized(c({ body: `${MARK}\n/harness stop` }), who), false, 'its own reply');
  assert.equal(authorized(c({ user: null }), who), false);
  assert.equal(authorized(c({}), { since }), false, 'no resolved id serves nobody');
});

test('the dispatcher must be able to push', () => {
  for (const permission of ['admin', 'maintain', 'write']) assert.equal(canWrite({ permission }), true, permission);
  for (const permission of ['triage', 'read', 'none']) assert.equal(canWrite({ permission }), false, permission);
  assert.equal(canWrite({ permission: 'read', user: { permissions: { push: true } } }), true, 'a custom role with push');
  assert.equal(canWrite(null), false);
});

test('a change rebuilds unless every path is one no build reads', () => {
  const none = { install: false, docsInstall: false, build: false, docs: false };
  const both = { install: false, docsInstall: false, build: true, docs: true };
  assert.deepEqual(rebuildFor(['docs/scripts/ios-safari/studio-probe.js', 'followups.d/x.md', 'changelog.d/y.fixed.md']), none);
  // These all feed a build: build:e2e runs docs/scripts/*.mjs, .md feeds the site and component docs, decks feed the portal.
  assert.deepEqual(rebuildFor(['docs/scripts/csp.mjs']), both);
  assert.deepEqual(rebuildFor(['docs/src/content/guide.md']), both);
  assert.deepEqual(rebuildFor(['lib/components/statement/quote/quote.docs.md']), both);
  assert.deepEqual(rebuildFor(['test/integration/baseline-decks/gallery.md']), both);
  assert.deepEqual(rebuildFor(['lib/core/pane-css.js']), both);
  assert.deepEqual(rebuildFor(['docs/package-lock.json']), { ...both, docsInstall: true });
  assert.deepEqual(rebuildFor(['package-lock.json']), { install: true, docsInstall: true, build: true, docs: true });
});

test('the variables a registry run sets inline, which a job value cannot beat', () => {
  assert.deepEqual(inlineAssignments('PROBE=undo DEVICES=iPhone bash docs/scripts/ios-safari/run.sh'), ['PROBE', 'DEVICES']);
  assert.deepEqual(inlineAssignments('bash x.sh FOO=1'), []);
  assert.deepEqual(inlineAssignments('node --test a.js'), []);
});

test('a reply never carries the token, raw or in the base64 forms git and checkout write', () => {
  const token = 'ghs_abcDEF123';
  const header = Buffer.from(`x-access-token:${token}`).toString('base64');
  const r = redact(`token ${token}\nextraheader = AUTHORIZATION: basic ${header}\n${Buffer.from(token).toString('base64')}`, token);
  assert.ok(!r.includes(token) && !r.includes(header) && !r.includes(Buffer.from(token).toString('base64')), r);
  assert.equal(redact('plain', ''), 'plain');
});

test('the tail fits a comment and cannot close its code fence', () => {
  const long = Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n');
  const t = tail(long);
  assert.equal(t.split('\n').length, 120);
  assert.match(t, /line 499$/);
  assert.ok(!tail('a\n```\nb').includes('```'));
  assert.ok(!/@[A-Za-z0-9]/.test(tail('ping @someone and @Laticent/team')), 'a log line cannot mention anyone');
  assert.ok(tail('x'.repeat(100000)).length <= 56000);
});

test('no token, and no handle on later steps, reaches a job', () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { GH_TOKEN: 'a', GITHUB_TOKEN: 'b', ACTIONS_RUNTIME_TOKEN: 'c', NPM_TOKEN: 'd', SOME_SECRET: 'e', KEEP: 'f', GITHUB_ENV: '/x', GITHUB_PATH: '/y', GITHUB_OUTPUT: '/z' });
    const env = jobEnv({ PROBE: 'undo' });
    for (const k of ['GH_TOKEN', 'GITHUB_TOKEN', 'ACTIONS_RUNTIME_TOKEN', 'NPM_TOKEN', 'SOME_SECRET', 'GITHUB_ENV', 'GITHUB_PATH', 'GITHUB_OUTPUT']) assert.equal(env[k], undefined, k);
    assert.equal(env.KEEP, 'f');
    assert.equal(env.PROBE, 'undo');
  } finally {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
  }
});
