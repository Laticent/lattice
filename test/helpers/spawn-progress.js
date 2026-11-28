/**
 * Spawn a child and fail it only when it HANGS, not when a loaded machine runs it slowly (HARD RULE #32, F4 in
 * engineering/decisions/2026-11-06-flaky-tests.md).
 *
 * A fixed wall-clock total ("kill it after 10 s") measures the machine's load as much as the child. A fast-exit CLI
 * path that needs 0.3 s on an idle box passed 10 s under load: 64 busy processes on 4 cores starve it, and it is
 * still making progress the whole time.
 *
 * So on Linux this helper watches the child's CPU time in `/proc/<pid>/stat` (user plus system, every thread) and
 * calls it hung in exactly two cases:
 *   - it SPINS: it has used `cpuBudgetMs` of CPU and not exited (an infinite loop, a quadratic scan);
 *   - it is STUCK: its CPU time has not moved for `stallMs` of wall time (waiting on a socket, a pipe or a lock that
 *     never answers).
 * A starved child is neither. The scheduler gives a runnable process a share of every second, so its CPU time keeps
 * rising, slowly, and it is never killed for the machine's load. Each limit is the old 10 s, so a real hang is
 * reported as fast as before on an idle machine; the CPU budget is twelve times the worst idle CPU cost measured below.
 *
 * Two more ways out, so that no child can keep a test waiting forever:
 *   - a CEILING, `ceilingMs`, on every platform: a wall-clock total sized for the slowest runner, not the median.
 *     120 s is twelve times the old deadline, and more than two hundred times the worst idle run of the four paths
 *     cli.test.js once timed out on (0.56 s wall, 0.82 s CPU, 20 runs each, 2026-11-28). Where `/proc` is missing
 *     (macOS, Windows) it is the only check, so a hang there takes 120 s to report, not 10. No CI job runs these tests
 *     off Linux (.github/platform-suites.json), so that cost falls only on an author's laptop. On Linux it catches a child the two checks above
 *     miss: one that polls, using a little CPU every half second forever, so its CPU time never stalls and takes
 *     minutes to reach the budget (the checker's finding);
 *   - an ORPHANED PIPE: the child has exited but its output never closes, because a grandchild it started still holds
 *     stdout. After `stallMs` it is reported as such.
 *
 * Known limit: the CPU time read is the child's own (utime + stime), not its children's while they run, so a child that
 * waits 10 s on a busy subprocess reads as stuck. No path cli.test.js runs starts one.
 */
const fs = require('node:fs');
const { spawn } = require('node:child_process');

/** Clock ticks per second for `/proc/<pid>/stat`. USER_HZ is 100 on every Linux ABI Node ships for. */
const USER_HZ = 100;
/** Whether this machine has `/proc` to watch a child by. `watchProc: false` turns the watch off, so a test can show the
 * ceiling alone still catches a hang, as it must on macOS and Windows. */
const HAS_PROC = fs.existsSync('/proc/self/stat');

/** The child's CPU time in ms, or null when `/proc` cannot say (not Linux, or the child has already gone). */
function cpuMs(pid) {
  let stat;
  try {
    stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  } catch {
    return null;
  }
  // The command name sits in parentheses and may hold spaces; the fields after the LAST `)` are fixed. utime and
  // stime are fields 14 and 15 of the whole line, so 12 and 13 of the part after the name.
  const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
  const ticks = Number(rest[11]) + Number(rest[12]);
  return Number.isFinite(ticks) ? (ticks * 1000) / USER_HZ : null;
}

/**
 * Run `node <script> <args>` and resolve `{ status, stdout, stderr }`, or reject when it hangs.
 * @param {string} script
 * @param {string[]} [args]
 * @param {{ cwd?: string, env?: object, cpuBudgetMs?: number, stallMs?: number, ceilingMs?: number, pollMs?: number, watchProc?: boolean }} [opts]
 * @returns {Promise<{ status: number | null, stdout: string, stderr: string }>}
 */
function runNode(script, args = [], opts = {}) {
  const { cwd, env = process.env, cpuBudgetMs = 10_000, stallMs = 10_000, ceilingMs = 120_000, pollMs = 250, watchProc = HAS_PROC } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    const what = `${script} ${args.join(' ')}`;
    const done = () => {
      clearInterval(poll);
      clearTimeout(ceiling);
      clearTimeout(orphaned);
    };
    const hung = (why) => {
      done();
      child.kill('SIGKILL');
      reject(new Error(`cli test hung: ${why}: ${what}`));
    };
    const ceiling = setTimeout(() => hung(`still running after ${ceilingMs / 1000} s`), ceilingMs);
    let orphaned = null;
    child.on('exit', () => {
      clearInterval(poll);
      orphaned = setTimeout(() => hung(`exited, but its output was still open ${stallMs / 1000} s later (a process it started holds the pipe)`), stallMs);
    });
    let lastCpu = -1;
    let lastMove = Date.now();
    const poll = setInterval(() => {
      if (!watchProc) return clearInterval(poll); // no /proc: the ceiling is the only check
      const used = cpuMs(child.pid);
      if (used === null) return; // it exited between the poll and the read; `exit` handles the rest
      const now = Date.now();
      if (used !== lastCpu) { lastCpu = used; lastMove = now; }
      if (used >= cpuBudgetMs) hung(`spun ${Math.round(used / 1000)} s of CPU without exiting`);
      else if (now - lastMove >= stallMs) hung(`used no CPU for ${Math.round((now - lastMove) / 1000)} s`);
    }, pollMs);
    child.on('close', (status) => {
      done();
      resolve({ status, stdout, stderr });
    });
    child.on('error', (err) => {
      done();
      reject(err);
    });
  });
}

module.exports = { runNode, cpuMs };
