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

// The lock is a FILE now: pid on line 1, claim epoch on line 2, both written
// before it exists. See the script's claim_lock.
const lockPath = (job) => path.join(LOCK_ROOT, `${job}.lock`);
const lockHeld = (job) => fs.existsSync(lockPath(job));
const seedLock = (job, pid, epoch) => {
  fs.mkdirSync(LOCK_ROOT, { recursive: true });
  fs.writeFileSync(lockPath(job), `${pid}\n${epoch}\n`);
};

// A SIGKILLed holder cannot run its trap, so cases that kill one leave a lock
// behind. That is correct for the tool (the stale reclaim handles it) and untidy
// for the suite, which should not silt up .scratch/waits across runs.
after(() => {
  // Guarded: the validation cases die before the script's `mkdir -p`, so on a
  // clean tree this directory may never exist and an unguarded read throws.
  if (!fs.existsSync(LOCK_ROOT)) return;
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
  // Fixing only run mode left POLL mode deaf: its probe also ran in the
  // foreground, so a TERM sat behind it. Measured before the fix -- TERM at
  // t=2s on `--until 'sleep 300'` left the process alive and the lock held 30s
  // later, and a large --timeout stretches that to the full deadline.
  test('SIGTERM stops a POLL-mode wait too, not just run mode', () => {
    const job = jobName('pollterm');
    const holder = spawn(SCRIPT,
      ['--job', job, '--timeout', '120', '--interval', '1', '--until', 'sleep 300'],
      { cwd: REPO, stdio: 'ignore', detached: true });
    assert.ok(until(() => lockHeld(job)), 'poll waiter never claimed the lock');

    const started = Date.now();
    process.kill(holder.pid, 'SIGTERM');
    const stopped = until(() => !lockHeld(job), 15_000);
    const elapsed = Date.now() - started;
    reap(holder);

    assert.ok(stopped, 'poll-mode wait ignored SIGTERM and kept its lock');
    assert.ok(elapsed < 12_000, `should stop on the signal, took ${elapsed}ms`);
  });

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
    seedLock(job, 999999, Math.floor(Date.now() / 1000));
    assert.equal(run(['--job', job, '--', 'true']).code, 0);
  });

  test('reclaims after the holder is SIGKILLed, so no trap runs', () => {
    const job = jobName('k9');
    // Detached, so reaping kills the `timeout`/`sleep` grandchild too. Spawned
    // undetached, it outlived the test by ~29s — the very leak spawnHolder exists
    // to prevent.
    const victim = spawnHolder(job, 30);
    assert.ok(until(() => lockHeld(job)), 'victim never claimed the lock');
    process.kill(victim.pid, 'SIGKILL');
    until(() => !isLive(victim.pid));
    reap(victim);
    assert.equal(run(['--job', job, '--', 'true']).code, 0);
  });

  // A lock is created by hard-linking a file whose contents are already written,
  // so a reader can never see one with a pid and no epoch. That window is what
  // let a second waiter steal a lock from a holder that was still mid-claim.
  test('never publishes a lock without both fields', () => {
    const job = jobName('atomic');
    const holder = spawnHolder(job, 20);
    assert.ok(until(() => lockHeld(job)), 'holder never claimed the lock');
    const lines = fs.readFileSync(lockPath(job), 'utf8').split('\n');
    reap(holder);
    assert.match(lines[0], /^\d+$/, 'line 1 must be the pid');
    assert.match(lines[1], /^\d+$/, 'line 2 must be the claim epoch');
  });
});

describe('wait-for — reclaiming a lock', () => {
  // A pid left by a SIGKILLed holder can be reused by something unrelated, so a
  // lock must not be believed on the number alone: --force sends TERM then KILL
  // to whatever it names. Matching "wait-for.sh" alone is not enough either —
  // after reuse that can be a DIFFERENT job's waiter.
  test('ignores a lock naming a live process that is not this job\'s waiter', () => {
    const job = jobName('notours');
    seedLock(job, process.pid, Math.floor(Date.now() / 1000)); // node, not a waiter
    const { code } = run(['--job', job, '--', 'true']);
    assert.equal(code, 0, 'a foreign pid should not hold a wait-for lock');
    assert.ok(isLive(process.pid), 'and it must certainly not be signalled');
  });

  // Scoping to THIS job is the part a "is it a wait-for.sh process" check misses.
  // After pid reuse the lock can name a live waiter on a DIFFERENT job, and then
  // the plain path refuses a job nobody is waiting on while --force TERM+KILLs
  // that unrelated waiter. Seeding a foreign non-waiter pid cannot catch this —
  // it fails the wait-for.sh test either way — so the pid here is a real waiter
  // on another job. Mutation-checked: dropping the --job match leaves this red.
  test('ignores a lock naming a live waiter that belongs to another job', () => {
    const other = jobName('otherjob');
    const holder = spawnHolder(other, 40);
    assert.ok(until(() => lockHeld(other)), 'the other job never claimed its lock');

    const job = jobName('crossjob');
    seedLock(job, holder.pid, Math.floor(Date.now() / 1000));
    const { code } = run(['--job', job, '--', 'true']);
    const survived = isLive(holder.pid);
    reap(holder);

    assert.equal(code, 0, "another job's waiter should not hold this job's lock");
    assert.ok(survived, "took the lock but signalled another job's waiter");
  });

  // The age backstop must actually FIRE, and proving that needs care. An earlier
  // fix defaulted a missing epoch to "now", pinning age at 0 and leaving the
  // backstop inert while a comment beside it claimed wedging was "structurally
  // impossible". The obvious test — seed a foreign live pid — does NOT cover
  // this: a foreign pid fails is_wait_process, so the lock frees down the "not
  // ours" path and the age branch never runs. Mutation-checked, and that version
  // stayed green with the age condition deleted.
  //
  // So the holder here is a REAL waiter on this job and only its timestamp is
  // aged. Nothing but the age rule can free this lock.
  test('reclaims a lock older than any legal deadline, and stops its holder', () => {
    const job = jobName('ancient');
    const holder = spawnHolder(job, 40);
    assert.ok(until(() => lockHeld(job)), 'holder never claimed the lock');

    const pid = fs.readFileSync(lockPath(job), 'utf8').split('\n')[0].trim();
    assert.equal(pid, String(holder.pid), 'the lock should name the real waiter');
    fs.writeFileSync(lockPath(job), `${pid}\n${Math.floor(Date.now() / 1000) - 99_999}\n`);

    const { code } = run(['--job', job, '--', 'true']);
    const holderStopped = until(() => !isLive(holder.pid));
    reap(holder);

    assert.equal(code, 0, 'age backstop is inert — an ancient lock wedged the job name');
    // Reclaiming without stopping the holder is just the two-waiters case again.
    assert.ok(holderStopped, 'reclaimed the lock but left the old holder running');
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

  // Bash reads a leading zero as OCTAL, so `--timeout 08` cleared the regex and
  // then died in the arithmetic with "value too great for base", exiting 1 --
  // straight into the documented "predicate never became true" code.
  test('accepts a zero-padded timeout instead of dying in octal', () => {
    assert.equal(run(['--job', jobName('octal'), '--timeout', '08', '--', 'true']).code, 0);
  });

  test('accepts a zero-padded interval', () => {
    assert.equal(
      run(['--job', jobName('octal-i'), '--timeout', '10', '--interval', '09', '--until', 'true']).code, 0);
  });

  for (const [label, args] of Object.entries(rejected)) {
    test(`rejects ${label}`, () => {
      assert.equal(run(args).code, USAGE_ERROR);
    });
  }
});
