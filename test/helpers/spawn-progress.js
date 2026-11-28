/**
 * Spawn a child and fail it only when it HANGS, not when a loaded machine runs it slowly (HARD RULE #32, F4 in
 * engineering/decisions/2026-11-06-flaky-tests.md).
 *
 * A fixed wall-clock total ("kill it after 10 s") measures the machine's load as much as the child. A fast-exit CLI
 * path that needs 0.3 s on an idle box passed 10 s under load: 64 busy processes on 4 cores starve it, and it is
 * still making progress the whole time.
 *
 * So on Linux this helper watches the CPU time of the child's whole process TREE in `/proc` (user plus system, every
 * thread of the child and of every process it started, Chromium included) and calls it hung in exactly two cases:
 *   - it SPINS: the tree has used `cpuBudgetMs` of CPU and the child has not exited (an infinite loop, a quadratic
 *     scan, a page script that never returns);
 *   - it is STUCK: the tree used no more than `stallCpuMs` of CPU over the last `stallMs` of wall time (waiting on a
 *     socket, a pipe, a lock or a page that never answers).
 * A starved child is neither. The scheduler gives a runnable process a share of every second, so its CPU time keeps
 * rising, slowly, and it is never killed for the machine's load.
 *
 * The tree count only goes up. Each process's own CPU is kept at the highest value seen, and a process that exits
 * keeps its last reading, so a Chromium that quits mid-run (or is reparented to init) does not take its work out of
 * the total. A process that starts and exits between two polls (250 ms apart) is not counted; that only under-counts.
 *
 * The defaults suit a CLI child that starts no processes (test/unit/cli/cli.test.js): each limit is 10 s, and the CPU
 * budget is twelve times the worst idle CPU cost of the four paths cli.test.js once timed out on (0.56 s wall, 0.82 s
 * CPU, 20 runs each, 2026-11-28). A child that runs Chromium needs a stall floor above zero, because an idle Chromium
 * still ticks: a tree waiting on a page that never loads used at most 70 ms in any 10 s window, while a working
 * export under 64 CPU burners on 4 cores used at least 590 ms (2026-11-28). `EXPORT_WATCH` below sits between them.
 *
 * Two more ways out, so that no child can keep a test waiting forever:
 *   - a CEILING, `ceilingMs`, on every platform: a wall-clock total sized for the slowest runner, not the median.
 *     Where `/proc` is missing (macOS, Windows) it is the only check, so a hang there takes the ceiling to report.
 *     No CI job runs these tests off Linux (.github/platform-suites.json), so that cost falls only on an author's
 *     laptop. On Linux it catches a child the two checks above miss: one that polls, using a little CPU every half
 *     second forever, so its CPU never stalls and takes minutes to reach the budget;
 *   - an ORPHANED PIPE: the child has exited but its output never closes, because a grandchild it started still holds
 *     stdout. After `stallMs` it is reported as such.
 * A hung child is killed with its whole tree, so a stuck Chromium does not outlive the test.
 *
 * `runNodeSync` is the same watch for a test that runs synchronously (`spawnSync`): it spawns this file as a small
 * watcher process that runs the child under `runNode` and relays its output and exit status.
 */
const fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');

/** Clock ticks per second for `/proc/<pid>/stat`. USER_HZ is 100 on every Linux ABI Node ships for. */
const USER_HZ = 100;
/** Whether this machine has `/proc` to watch a child by. `watchProc: false` turns the watch off, so a test can show the
 * ceiling alone still catches a hang, as it must on macOS and Windows. */
const HAS_PROC = fs.existsSync('/proc/self/stat');

/** The fields of `/proc/<pid>/stat` after the command name, or null when the process has gone. */
function statFields(pid) {
  let stat;
  try {
    stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
  } catch {
    return null;
  }
  // The command name sits in parentheses and may hold spaces; the fields after the LAST `)` are fixed. ppid is field
  // 4 of the whole line, utime and stime fields 14 and 15: so 1, 11 and 12 of the part after the name.
  return stat.slice(stat.lastIndexOf(')') + 2).split(' ');
}

/** The child's own CPU time in ms, or null when `/proc` cannot say (not Linux, or the child has already gone). */
function cpuMs(pid) {
  const f = statFields(pid);
  if (!f) return null;
  const ticks = Number(f[11]) + Number(f[12]);
  return Number.isFinite(ticks) ? (ticks * 1000) / USER_HZ : null;
}

/** Whether `pid` is still running: present in `/proc` and not a zombie (state Z: dead, waiting to be reaped). */
function running(pid) {
  const f = statFields(pid);
  return f !== null && f[0] !== 'Z';
}

/**
 * A reader of the CPU time of `root` and every process under it, in ms. Each call walks `/proc` once. The total only
 * goes up: a process keeps its highest reading after it exits. `live()` lists the tree's processes still running at
 * the last read, so a hung tree can be killed whole.
 * @param {number} root
 * @returns {{ read: () => number | null, live: () => number[] }}
 */
function treeCpu(root) {
  const best = new Map(); // pid -> highest own CPU ticks seen
  let alive = [];
  const read = () => {
    const kids = new Map();
    const own = new Map();
    let names;
    try {
      names = fs.readdirSync('/proc');
    } catch {
      return null;
    }
    for (const name of names) {
      const c = name.charCodeAt(0);
      if (c < 48 || c > 57) continue; // not a pid
      const f = statFields(name);
      if (!f) continue;
      const pid = Number(name);
      const ppid = Number(f[1]);
      own.set(pid, Number(f[11]) + Number(f[12]));
      if (!kids.has(ppid)) kids.set(ppid, []);
      kids.get(ppid).push(pid);
    }
    if (!own.has(root)) return null;
    alive = [];
    for (const todo = [root]; todo.length; ) {
      const pid = todo.pop();
      alive.push(pid);
      best.set(pid, Math.max(best.get(pid) ?? 0, own.get(pid)));
      for (const k of kids.get(pid) ?? []) todo.push(k);
    }
    let ticks = 0;
    for (const t of best.values()) ticks += t;
    return (ticks * 1000) / USER_HZ;
  };
  return { read, live: () => alive };
}

/**
 * Run `node <script> <args>` and resolve `{ status, stdout, stderr }` (plus `signal` when a signal ended it), or reject
 * when it hangs.
 * @param {string} script
 * @param {string[]} [args]
 * @param {{ cwd?: string, env?: object, cpuBudgetMs?: number, stallMs?: number, stallCpuMs?: number, ceilingMs?: number, pollMs?: number, watchProc?: boolean }} [opts]
 * @returns {Promise<{ status: number | null, signal?: string, stdout: string, stderr: string }>} rejects with an Error
 *   that carries the child's `stdout` and `stderr` so far
 */
function runNode(script, args = [], opts = {}) {
  const { cwd, env = process.env, cpuBudgetMs = 10_000, stallMs = 10_000, stallCpuMs = 0, ceilingMs = 120_000, pollMs = 250, watchProc = HAS_PROC } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], { cwd, env });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
    child.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
    const what = `${script} ${args.join(' ')}`;
    const tree = watchProc ? treeCpu(child.pid) : null;
    const done = () => {
      clearInterval(poll);
      clearTimeout(ceiling);
      clearTimeout(orphaned);
    };
    let isHung = false; // once called hung, the child's own close or error must not settle the promise first
    const hung = (why) => {
      if (isHung) return;
      isHung = true;
      done();
      const pids = tree?.live() ?? [];
      for (const pid of pids) {
        try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      }
      child.kill('SIGKILL');
      const fail = (also = '') => reject(Object.assign(new Error(`test child hung: ${why}: ${what}${also}`), { stdout, stderr }));
      if (!pids.length) return fail();
      // SIGKILL is sent, not done: reject only once every process of the tree has died, so a hung Chromium never
      // outlives the test that started it. A process that survives 5 s of SIGKILL is named in the error.
      const killedBy = Date.now() + 5000;
      const reaped = setInterval(() => {
        const left = pids.filter(running);
        if (left.length && Date.now() < killedBy) return;
        clearInterval(reaped);
        fail(left.length ? ` (and pid ${left.join(', ')} survived SIGKILL)` : '');
      }, 20);
    };
    const ceiling = setTimeout(() => hung(`still running after ${ceilingMs / 1000} s`), ceilingMs);
    let orphaned = null;
    child.on('exit', () => {
      clearInterval(poll);
      if (isHung) return; // killed for a hang: nothing is left to wait on
      orphaned = setTimeout(() => hung(`exited, but its output was still open ${stallMs / 1000} s later (a process it started holds the pipe)`), stallMs);
    });
    const seen = []; // [wall ms, tree CPU ms], oldest first, trimmed to one stall window
    const poll = setInterval(() => {
      if (!tree) return clearInterval(poll); // no /proc: the ceiling is the only check
      const used = tree.read();
      if (used === null) return; // it exited between the poll and the read; `exit` handles the rest
      const now = Date.now();
      seen.push([now, used]);
      while (seen.length > 1 && seen[1][0] <= now - stallMs) seen.shift();
      if (used >= cpuBudgetMs) return hung(`spun ${Math.round(used / 1000)} s of CPU without exiting`);
      const [then, before] = seen[0];
      if (now - then < stallMs || used - before > stallCpuMs) return;
      const s = Math.round((now - then) / 1000);
      hung(stallCpuMs === 0 ? `used no CPU for ${s} s` : `used ${Math.round(used - before)} ms of CPU in ${s} s, no more than an idle process`);
    }, pollMs);
    child.on('close', (status, signal) => {
      if (isHung) return;
      done();
      // `signal` only when a signal ended it, so a plain exit reads `{ status, stdout, stderr }`, as before.
      resolve(signal ? { status, signal, stdout, stderr } : { status, stdout, stderr });
    });
    child.on('error', (err) => {
      if (isHung) return;
      done();
      reject(err);
    });
  });
}

/** The line the watcher prints to stderr, last, when the child hung; `runNodeSync` turns it into a thrown Error. */
const HUNG_MARK = '\n[spawn-progress] ';

/**
 * `runNode` for a synchronous test: returns `{ status, stdout, stderr }` like `spawnSync`, and throws when the child
 * hangs. There is no `timeout` option on purpose: a wall-clock total is the F4 shape this helper replaces.
 * @param {string} script
 * @param {string[]} [args]
 * @param {{ cwd?: string, env?: object, cpuBudgetMs?: number, stallMs?: number, stallCpuMs?: number, ceilingMs?: number, pollMs?: number, watchProc?: boolean }} [opts]
 * @returns {{ status: number | null, stdout: string, stderr: string }}
 */
function runNodeSync(script, args = [], opts = {}) {
  const { cwd, env = process.env, timeout, encoding, ...watch } = opts;
  if (timeout !== undefined) throw new TypeError('runNodeSync takes no `timeout`: it fails a child on a hang, never on a wall-clock total');
  const r = spawnSync(process.execPath, [__filename, JSON.stringify(watch), script, ...args], { cwd, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw r.error;
  const at = r.stderr.lastIndexOf(HUNG_MARK);
  if (at >= 0) throw new Error(`${r.stderr.slice(at + HUNG_MARK.length).trim()}\n--- its stderr ---\n${r.stderr.slice(0, at)}`);
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// The watcher `runNodeSync` spawns: run the child under `runNode`, relay its output, exit as it exited.
if (require.main === module) {
  const [watch, script, ...args] = process.argv.slice(2);
  runNode(script, args, JSON.parse(watch)).then(
    ({ status, signal, stdout, stderr }) => {
      process.stdout.write(stdout);
      process.stderr.write(stderr);
      if (signal) process.kill(process.pid, signal);
      else process.exitCode = status;
    },
    (err) => {
      process.stdout.write(err.stdout ?? '');
      process.stderr.write(`${err.stderr ?? ''}${HUNG_MARK}${err.message}\n`);
      process.exitCode = 124;
    },
  );
}

/**
 * The watch for a child that runs Chromium (lattice.js exports), sized from test/integration/export/export-formats.test.js
 * (85 exports, 2026-11-28):
 *   - stall floor: 200 ms of tree CPU per 10 s, about three times what a waiting Chromium uses (70 ms) and a third of
 *     the least a working export got under 64 CPU burners on 4 cores (590 ms);
 *   - CPU budget: 180 s, twelve times the costliest export's tree CPU (a three-slide `--player` render: 14.8 s idle,
 *     15.3 s under load);
 *   - ceiling: 600 s, four times the slowest export's wall time under that load (143 s, against 10.5 s idle).
 */
const EXPORT_WATCH = Object.freeze({ stallMs: 10_000, stallCpuMs: 200, cpuBudgetMs: 180_000, ceilingMs: 600_000 });

module.exports = { runNode, runNodeSync, cpuMs, treeCpu, EXPORT_WATCH };
