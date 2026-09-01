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
const { spawn, spawnSync } = require('node:child_process');

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

/**
 * Start a long wait in ITS OWN PROCESS GROUP, so killing it reaps the grandchild
 * (`timeout`/`sleep`) too. Killing only the shell left orphaned sleeps and stale
 * lock dirs behind after every `npm test` — leaked waiters inside the suite that
 * pins "no leaked waiters".
 */
const spawnHolder = (job, seconds = 30) =>
  spawn(SCRIPT, ['--job', job, '--timeout', String(seconds), '--', 'sleep', String(seconds)],
    { cwd: REPO, stdio: 'ignore', detached: true });

/** Kill a holder and everything it started. */
const reap = (child) => {
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* group already gone */ }
  try { child.kill('SIGKILL'); } catch { /* already gone */ }
};

/** Wait for a condition instead of sleeping a guessed interval (flaky on a loaded runner). */
const until = (fn, budgetMs = 10_000) => {
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (fn()) return true;
    spawnSync('sleep', ['0.05']);
  }
  return false;
};

const lockDir = (job) => path.join(LOCK_ROOT, `${job}.lock`);
const lockHeld = (job) => fs.existsSync(lockDir(job));

// A SIGKILLed holder cannot run its trap, so cases that kill one leave a lock
// behind. That is correct for the tool (the stale reclaim handles it) and untidy
// for the suite, which should not silt up .scratch/waits across runs.
after(() => {
  for (const entry of fs.readdirSync(LOCK_ROOT, { withFileTypes: true })) {
    if (entry.name.startsWith(`test-`) && entry.name.includes(`-${process.pid}-`)) {
      fs.rmSync(path.join(LOCK_ROOT, entry.name), { recursive: true, force: true });
    }
  }
});

/**
 * Is this pid a live process — treating a ZOMBIE as dead, exactly as the script
 * does. `process.kill(pid, 0)` succeeds on a killed-but-unreaped child, so the
 * naive check reports a TERMed holder as still running and fails a passing fix.
 * This is the same trap the helper itself had; it bites the test too.
 */
const isLive = (pid) => {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
    return stat.slice(stat.lastIndexOf(')') + 1).trim().split(/\s+/)[0] !== 'Z';
  } catch {
    return false;
  }
};

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
    holder = spawnHolder(job);
    // Poll for the lock rather than sleeping a guessed interval.
    assert.ok(until(() => lockHeld(job)), 'holder never claimed the lock');
  });

  after(() => reap(holder));

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
});

describe('wait-for — a signal actually stops the wait', () => {
  // A canceled wait that runs to its deadline anyway and still fires is the
  // failure this tool exists to prevent. Before the fix, bash deferred the trap
  // until the FOREGROUND child finished: TERM at t=1s on a 12s job exited at
  // t=11s reporting "hit the deadline".
  test('SIGTERM stops it promptly and releases the lock', () => {
    const job = jobName('term');
    const holder = spawnHolder(job, 20);
    assert.ok(until(() => lockHeld(job)), 'holder never claimed the lock');

    const started = Date.now();
    process.kill(holder.pid, 'SIGTERM');
    const stopped = until(() => !lockHeld(job), 10_000);
    const elapsed = Date.now() - started;
    reap(holder);

    assert.ok(stopped, 'lock was never released after SIGTERM');
    assert.ok(elapsed < 8_000, `should stop on the signal, took ${elapsed}ms`);
  });
});

describe('wait-for — --force replaces the holder', () => {
  test('stops the waiter it forces out, rather than running two at once', () => {
    const job = jobName('force');
    const victim = spawnHolder(job, 30);
    assert.ok(until(() => lockHeld(job)), 'victim never claimed the lock');

    const { code } = run(['--job', job, '--force', '--', 'true']);
    assert.equal(code, 0);
    // Two live waiters on one job is exactly what this tool forbids.
    const gone = until(() => !isLive(victim.pid));
    reap(victim);
    assert.ok(gone, '--force stole the lock but left the old waiter running');
  });

  // The EXIT trap used to `rm -rf` unconditionally, so a forced-out waiter
  // deleted the CURRENT holder's lock on its way out and a third wait was let
  // straight through while the holder was still live.
  test('a forced-out waiter does not delete the new holder\'s lock', () => {
    const job = jobName('steal');
    const first = spawnHolder(job, 4);
    assert.ok(until(() => lockHeld(job)), 'first never claimed the lock');

    const second = spawnHolder(job, 30);
    // The forced path is what the second one needs; start it explicitly.
    reap(second);
    const forced = spawn(SCRIPT, ['--job', job, '--force', '--timeout', '30', '--', 'sleep', '30'],
      { cwd: REPO, stdio: 'ignore', detached: true });
    assert.ok(until(() => lockHeld(job)), 'forced waiter never claimed the lock');

    // Let the first one reach its own exit and run its trap.
    until(() => !isLive(first.pid), 15_000);
    spawnSync('sleep', ['1']);

    const stillHeld = lockHeld(job);
    const third = run(['--job', job, '--', 'true']);
    reap(forced);
    reap(first);

    assert.ok(stillHeld, "the exiting waiter deleted the live holder's lock");
    assert.equal(third.code, 2, 'a duplicate was admitted while a holder was live');
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

  // Metadata lands after `mkdir`, so a reader can see a lock with a pid and no
  // epoch yet. Defaulting that missing epoch to 0 made the age ~1.8e9s and the
  // backstop robbed a LIVE holder. Unknown age must mean "leave it alone".
  test('does not rob a live holder whose epoch has not landed yet', () => {
    const job = jobName('noepoch');
    const lock = lockDir(job);
    fs.mkdirSync(lock, { recursive: true });
    fs.writeFileSync(path.join(lock, 'pid'), String(process.pid)); // unambiguously live
    const { code } = run(['--job', job, '--', 'true']);
    fs.rmSync(lock, { recursive: true, force: true });
    assert.equal(code, 2, 'stole the lock from a live holder mid-write');
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

  // `${2:?...}` exited 1 here, colliding with the documented "predicate never
  // became true" code and bypassing the script's own 64-for-usage convention.
  for (const flag of ['--job', '--timeout', '--interval', '--until']) {
    rejected[`${flag} with no value`] = ['--job', 'j', flag];
  }

  for (const [label, args] of Object.entries(rejected)) {
    test(`rejects ${label}`, () => {
      assert.equal(run(args).code, USAGE_ERROR);
    });
  }
});
