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
// Locks live outside .scratch on purpose: that directory is throwaway, and
// wiping it mid-wait would let a second waiter make a fresh inode and take
// the lock. Logs stay there; correctness state does not.
const LOCK_ROOT = path.join(REPO, '.git', 'lattice-waits');

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

// The lock file records who holds it -- pid, job, ISO timestamp -- purely so
// that a refusal can name them. Mutual exclusion is flock's, not the file's.
const lockPath = (job) => path.join(LOCK_ROOT, `${job}.lock`);

/**
 * Is the job's lock actually HELD?
 *
 * Not "does the file exist" — flock never deletes the lock file; the lock lives
 * on an open descriptor and is released when that closes. Asking the filesystem
 * would report a released lock as still held forever. Ask the kernel instead.
 */
const lockHeld = (job) => {
  const f = lockPath(job);
  if (!fs.existsSync(f)) return false;
  return spawnSync('flock', ['-n', f, 'true'], { timeout: 10_000 }).status !== 0;
};


// The kernel releases a killed holder's lock, but the (now unlocked) file
// remains. Tidy them so the suite does not silt up the lock directory.
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

describe('wait-for — the lock is the kernel\'s, not ours', () => {
  // This is the fourth lock and the first correct one. mkdir, then an atomic
  // hard link, then a reclaim path guarded by pid liveness and age: review
  // defeated all three, six different ways, always the same failure — two live
  // waiters on one job. These cases are the ones that broke the old designs.

  // The whole reason for flock. A SIGKILLed holder runs no trap and cleans up
  // nothing, and every previous version needed stale detection, zombie
  // handling, pid-reuse checks and an age backstop to cope. The kernel simply
  // releases it.
  test('frees the job when its holder is SIGKILLed, with no reclaim logic', () => {
    const job = jobName('kill');
    const holder = spawnHolder(job, 60);
    assert.ok(until(() => lockHeld(job)), 'holder never claimed the lock');
    process.kill(holder.pid, 'SIGKILL');
    until(() => !isLive(holder.pid));
    reap(holder);
    assert.equal(run(['--job', job, '--', 'true']).code, 0, 'the job stayed wedged after a kill');
  });

  // flock lives on an open FILE DESCRIPTOR, and children inherit descriptors.
  // Without an explicit `9>&-` the job's own child kept the lock held after the
  // waiter died — reintroducing the stale lock flock was adopted to delete.
  test('does not let the job it runs inherit and hold the lock', () => {
    const job = jobName('inherit');
    const holder = spawnHolder(job, 60);
    assert.ok(until(() => lockHeld(job)), 'holder never claimed the lock');
    // Kill only the waiter; its `timeout`/`sleep` child outlives it briefly.
    process.kill(holder.pid, 'SIGKILL');
    until(() => !isLive(holder.pid));
    const { code } = run(['--job', job, '--', 'true']);
    reap(holder);
    assert.equal(code, 0, 'a surviving child still held the lock');
  });

  // The race that defeated the hard-link version: two waiters both saw one
  // reclaimable lock, both removed it, and both won — reproduced at 4 of 15
  // trials. There is no reclaim path now, so there is no window.
  test('admits exactly one of five waiters racing for the same job', () => {
    const job = jobName('race');
    // Concurrent, and their exit codes collected — five separate spawnSync calls
    // would serialize and never race at all.
    //
    // The script path and job name are passed as ARGUMENTS rather than
    // interpolated into the command text (CodeQL flagged the interpolation as a
    // shell command built from an uncontrolled path). It is also simply more
    // robust: a checkout directory containing a space or a shell metacharacter
    // would break the interpolated form.
    const script = `
      for i in 1 2 3 4 5; do
        ( "$1" --job "$2" --timeout 10 -- sleep 2 >/dev/null 2>&1; echo $? ) &
      done
      wait
    `;
    const r = spawnSync('bash', ['-c', script, 'wait-for-race', SCRIPT, job],
      { encoding: 'utf8', cwd: REPO, timeout: 90_000 });
    const codes = (r.stdout || '').trim().split('\n').filter(Boolean).map(Number);
    assert.equal(codes.length, 5, `expected 5 results, got ${JSON.stringify(codes)}`);
    assert.equal(
      codes.filter((c) => c === 0).length, 1,
      `exactly one waiter may run the job; codes were ${JSON.stringify(codes)}`);
    assert.equal(
      codes.filter((c) => c === 2).length, 4,
      `the other four must be refused with 2; codes were ${JSON.stringify(codes)}`);
  });

  test('records the holder so a refusal can name it', () => {
    const job = jobName('record');
    const holder = spawnHolder(job, 20);
    assert.ok(until(() => lockHeld(job)), 'holder never claimed the lock');
    const [pid, recordedJob] = fs.readFileSync(lockPath(job), 'utf8').split('\n');
    const { err } = run(['--job', job, '--', 'true']);
    reap(holder);
    assert.equal(pid.trim(), String(holder.pid));
    assert.equal(recordedJob.trim(), job);
    assert.match(err, new RegExp(`pid ${holder.pid}`), 'the refusal should name the live holder');
  });

  // A pid can be reused, and --force signals whatever the lock names. An
  // earlier version matched the job as a SUBSTRING, so `--job int` matched a
  // live `--job integration` waiter and --force TERM+KILLed it.
  test('does not confuse a job with one whose name it prefixes', () => {
    const long = `${jobName('pre')}-extended`;
    const holder = spawnHolder(long, 25);
    assert.ok(until(() => lockHeld(long)), 'holder never claimed its lock');
    const short = long.replace('-extended', '');
    const { code } = run(['--job', short, '--', 'true']);
    const survived = isLive(holder.pid);
    reap(holder);
    assert.equal(code, 0, 'a prefix of another job name was treated as that job');
    assert.ok(survived, "and the other job's waiter must not be signaled");
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
