/**
 * Unit: the bounded wait helper (tools/wait-for.sh).
 *
 * The helper exists because a hand-rolled `until <cond>; do sleep N; done` in a
 * background Bash call has no deadline and no identity. One session left fifteen
 * of them resident, six on the same integration run, still polling after five
 * hours. Idle they cost nothing; the expense is a late fire, which wakes the
 * session past the prompt-cache TTL and re-sends the whole conversation at full
 * input price — once per duplicate.
 *
 * So the two properties worth pinning are the two that stop that: every wait
 * DIES at its deadline, and a second wait on a live job REFUSES instead of
 * adding a duplicate. The rest of the cases here are the failure paths that
 * would quietly turn either property off — a lock that outlives a killed shell
 * would make the tool refuse forever, which is the failure that gets a guard
 * deleted rather than fixed.
 *
 * Driven through the real script, not a re-implementation: the whole subject is
 * process lifetime and lock atomicity, neither of which survives being modeled.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');

const REPO = path.join(__dirname, '..', '..', '..');
const SCRIPT = path.join(REPO, 'tools', 'wait-for.sh');
const LOCK_ROOT = path.join(REPO, '.scratch', 'waits');

/** Run the helper to completion and hand back its exit code plus streams. */
const run = (args, opts = {}) => {
  const r = spawnSync(SCRIPT, args, { encoding: 'utf8', cwd: REPO, timeout: 60_000, ...opts });
  return { code: r.status, out: r.stdout || '', err: r.stderr || '' };
};

/** A job name unique to one test, so cases never collide over a lock. */
let n = 0;
const jobName = (label) => `test-${label}-${process.pid}-${++n}`;

const USAGE_ERROR = 64;

describe('wait-for — run mode', () => {
  test('exits 0 and reports the job when the command succeeds', () => {
    const job = jobName('ok');
    const { code, out } = run(['--job', job, '--', 'true']);
    assert.equal(code, 0);
    assert.match(out, new RegExp(`${job} finished OK`));
  });

  test("propagates the command's own exit code", () => {
    const { code } = run(['--job', jobName('fail'), '--', 'sh', '-c', 'exit 7']);
    assert.equal(code, 7);
  });

  test('echoes the tail of the log when the command fails', () => {
    const { err } = run(['--job', jobName('tail'), '--', 'sh', '-c', 'echo distinctive-failure-line >&2; exit 1']);
    assert.match(err, /distinctive-failure-line/);
  });

  // The core property: a wait cannot outlive its deadline.
  test('kills a command that overruns the deadline, with timeout\'s 124', () => {
    const started = Date.now();
    const { code } = run(['--job', jobName('slow'), '--timeout', '2', '--', 'sleep', '60']);
    assert.equal(code, 124);
    assert.ok(Date.now() - started < 30_000, 'must die at its deadline, not run to completion');
  });
});

describe('wait-for — poll mode', () => {
  test('exits 0 as soon as the predicate holds', () => {
    const { code, out } = run(['--job', jobName('poll'), '--timeout', '10', '--interval', '1', '--until', 'true']);
    assert.equal(code, 0);
    assert.match(out, /became true/);
  });

  // The deadline must bound a predicate that BLOCKS, not just one that keeps
  // returning false. Before each probe was individually bounded, an `--until
  // 'sleep 300'` against a 3s deadline ran for a full 2 minutes -- the very
  // unbounded wait this tool exists to prevent, reintroduced inside it.
  test('kills a predicate that blocks, instead of sailing past the deadline', () => {
    const started = Date.now();
    const { code } = run(['--job', jobName('block'), '--timeout', '3', '--interval', '1', '--until', 'sleep 300']);
    const elapsed = Date.now() - started;
    assert.equal(code, 1);
    assert.ok(elapsed < 20_000, `must stop near its 3s deadline, took ${elapsed}ms`);
  });

  test('gives up at the deadline and blames the predicate, not the job', () => {
    const { code, err } = run(['--job', jobName('never'), '--timeout', '3', '--interval', '1', '--until', 'false']);
    assert.equal(code, 1);
    assert.match(err, /predicate is probably wrong/);
  });
});

describe('wait-for — one waiter per job', () => {
  let job;
  let holder;

  before(() => {
    job = jobName('dupe');
    // A live wait holding the lock for the duration of this block.
    holder = require('node:child_process').spawn(
      SCRIPT, ['--job', job, '--timeout', '30', '--', 'sleep', '30'],
      { cwd: REPO, stdio: 'ignore', detached: false },
    );
    // Give it long enough to claim the lock before the duplicate races it.
    spawnSync('sleep', ['1']);
  });

  after(() => {
    try { holder.kill('SIGKILL'); } catch { /* already gone */ }
  });

  // This is the defect the tool exists for: five waiters on one integration run.
  test('refuses a second wait on a live job, and names the holder', () => {
    const { code, err } = run(['--job', job, '--', 'true']);
    assert.equal(code, 2);
    assert.match(err, /already being waited on/);
    assert.match(err, /pid \d+/);
  });

  test('leaves a different job name alone', () => {
    assert.equal(run(['--job', jobName('other'), '--', 'true']).code, 0);
  });

  test('--force takes a held lock', () => {
    assert.equal(run(['--job', job, '--force', '--', 'true']).code, 0);
  });
});

describe('wait-for — lock hygiene', () => {
  test('removes its lock on a normal exit', () => {
    const job = jobName('clean');
    run(['--job', job, '--', 'true']);
    assert.equal(fs.existsSync(path.join(LOCK_ROOT, `${job}.lock`)), false);
  });

  // A lock that outlives its owner would make the tool refuse forever — the
  // failure mode that gets a guard switched off instead of fixed.
  test('reclaims a lock whose recorded process is gone', () => {
    const job = jobName('stale');
    const lock = path.join(LOCK_ROOT, `${job}.lock`);
    fs.mkdirSync(lock, { recursive: true });
    fs.writeFileSync(path.join(lock, 'pid'), '999999');
    assert.equal(run(['--job', job, '--', 'true']).code, 0);
  });

  // A zombie answers `kill -0` successfully, so an existence check alone would
  // read a killed-but-unreaped holder as live and wedge the lock permanently.
  test('reclaims after the holder is SIGKILLed, so no trap runs', () => {
    const job = jobName('k9');
    const victim = require('node:child_process').spawn(
      SCRIPT, ['--job', job, '--timeout', '30', '--', 'sleep', '30'],
      { cwd: REPO, stdio: 'ignore' },
    );
    spawnSync('sleep', ['1']);
    victim.kill('SIGKILL');
    spawnSync('sleep', ['1']);
    assert.equal(run(['--job', job, '--', 'true']).code, 0);
  });

  test('reclaims a lock left by a live process but older than the ceiling', () => {
    const job = jobName('ancient');
    const lock = path.join(LOCK_ROOT, `${job}.lock`);
    fs.mkdirSync(lock, { recursive: true });
    // A PID that is unambiguously alive (this test process), so only the age
    // rule can free this lock. Without it, one missed liveness case is enough
    // to make a job name permanently unusable.
    fs.writeFileSync(path.join(lock, 'pid'), String(process.pid));
    fs.writeFileSync(path.join(lock, 'epoch'), String(Math.floor(Date.now() / 1000) - 99_999));
    assert.equal(run(['--job', job, '--', 'true']).code, 0);
  });
});

describe('wait-for — help', () => {
  // A hardcoded line range truncated the help once the header grew a section,
  // dropping an exit code and every example. The help now reads the whole
  // header comment, so this pins the far end of it.
  test('prints the whole header, examples included', () => {
    const { code, out } = run(['--help']);
    assert.equal(code, 0);
    assert.match(out, /Exit codes:/);
    assert.match(out, /Examples:/);
    assert.match(out, /--job integration/);
  });
});

describe('wait-for — argument validation', () => {
  const rejected = {
    'a missing --job': [],
    'a job name with a path separator': ['--job', 'ev/il', '--', 'true'],
    'a job name climbing out of the lock directory': ['--job', '../escape', '--', 'true'],
    'a timeout past the cache-TTL ceiling': ['--job', 'j', '--timeout', '99999', '--', 'true'],
    'a non-numeric timeout': ['--job', 'j', '--timeout', 'abc', '--', 'true'],
    'a zero interval': ['--job', 'j', '--interval', '0', '--until', 'true'],
    'both a predicate and a command': ['--job', 'j', '--until', 'true', '--', 'true'],
    'neither a predicate nor a command': ['--job', 'j'],
    'an unknown flag': ['--job', 'j', '--bogus'],
  };

  for (const [label, args] of Object.entries(rejected)) {
    test(`rejects ${label}`, () => {
      assert.equal(run(args).code, USAGE_ERROR);
    });
  }
});
