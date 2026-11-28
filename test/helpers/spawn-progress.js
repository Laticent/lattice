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
 * A hung child is killed with its whole tree, and under `runNodeSync` with its process group too, so a stuck Chromium
 * does not outlive the test. Known limit: a grandchild that the walk never saw (it started and its parent exited
 * between two polls) is killed only by the group, so it escapes under plain `runNode`, or when it left the group. It is
 * not killed then, but it cannot keep the test waiting: the child's pipes are let go on a hang.
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

/** Whether `pid` is still running: present in `/proc` and not a zombie (state Z: dead, waiting to be reaped). With
 * `start`, only while it is still that process: a pid the kernel has reused reads as not running. */
function running(pid, start) {
  const f = statFields(pid);
  return f !== null && f[0] !== 'Z' && (start === undefined || f[19] === start);
}

/** Clock ticks since boot, the unit of a process's start time in `/proc/<pid>/stat`; null when `/proc` cannot say. */
function bootTicks() {
  try {
    return Math.ceil(Number(fs.readFileSync('/proc/uptime', 'utf8').split(' ')[0]) * USER_HZ);
  } catch {
    return null;
  }
}

/**
 * A reader of the CPU time of `root` and every process under it, in ms. Each call walks `/proc` once. The total only
 * goes up: a process keeps its highest reading after it exits. `live()` lists the tree's processes still running at
 * the last read, each with its start time, so a hung tree can be killed whole without hitting a pid the kernel has
 * since given to another process.
 * @param {number} root
 * @returns {{ read: () => number | null, live: () => { pid: number, start: string }[] }}
 */
function treeCpu(root) {
  const best = new Map(); // `${pid}:${start time}` -> highest own CPU ticks seen; the start time tells a reused pid apart
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
      own.set(pid, { ticks: Number(f[11]) + Number(f[12]), start: f[19] }); // f[19]: start time, field 22
      if (!kids.has(ppid)) kids.set(ppid, []);
      kids.get(ppid).push(pid);
    }
    if (!own.has(root)) return null;
    alive = [];
    for (const todo = [root]; todo.length; ) {
      const pid = todo.pop();
      const { ticks, start } = own.get(pid);
      alive.push({ pid, start });
      const key = `${pid}:${start}`;
      best.set(key, Math.max(best.get(key) ?? 0, ticks));
      for (const k of kids.get(pid) ?? []) todo.push(k);
    }
    let ticks = 0;
    for (const t of best.values()) ticks += t;
    return (ticks * 1000) / USER_HZ;
  };
  return { read, live: () => alive };
}

/** Whether this platform has process groups to put a child in (Windows has none). */
const OWN_GROUP = process.platform !== 'win32';
/**
 * Whether this process gives each child a group of its own, so a hang can kill every process in it with one signal.
 * Only the watcher `runNodeSync` spawns does. A child in its own group no longer gets the terminal's Ctrl-C, so
 * something must pass the signal on: the watcher can (its handlers below never wait, and it shares the terminal's
 * group), but a test process cannot, because a handler there waits out a blocking `runNodeSync`. So a child of
 * `runNode` called from a test stays in the test's group, and Ctrl-C reaches it directly, as before.
 */
let childGroups = false;
/** The process groups of children still running (a child leaves the set when it exits: after that its pid, and so
 * the group id, may be reused). The watcher kills them when it exits or is signaled. */
const liveGroups = new Set();
function killLiveGroups() {
  for (const pgid of liveGroups) {
    try { process.kill(-pgid, 'SIGKILL'); } catch { /* already gone */ }
  }
  liveGroups.clear();
}
let groupCleanupArmed = false;
function armGroupCleanup() {
  if (groupCleanupArmed) return;
  groupCleanupArmed = true;
  process.on('exit', killLiveGroups);
}
/**
 * Kill the live groups on SIGINT, SIGTERM and SIGHUP too, then end the way the signal would have. Only the watcher
 * process arms this. In a test process a JavaScript handler would hold the signal back while `runNodeSync` blocks the
 * event loop (up to the ceiling), where the default action ends the process at once. The watcher's loop never blocks,
 * and it shares the terminal's group, so Ctrl-C reaches it and it takes the child's group down with it.
 */
function armSignalCleanup() {
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
    process.once(sig, () => { killLiveGroups(); process.kill(process.pid, sig); });
  }
}

/** The processes still running in process group `pgid`, each with its start time. Field 5 of `stat` is the group. */
function groupMembers(pgid) {
  const out = [];
  let names;
  try {
    names = fs.readdirSync('/proc');
  } catch {
    return out;
  }
  for (const name of names) {
    const c = name.charCodeAt(0);
    if (c < 48 || c > 57) continue;
    const f = statFields(name);
    if (f && Number(f[2]) === pgid && f[0] !== 'Z') out.push({ pid: Number(name), start: f[19] });
  }
  return out;
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
    // In the watcher, its own process group (`detached`), so a hang kills everything it started that stayed in the
    // group, including a grandchild the tree walk cannot see: one started after the last poll, or one reparented to
    // init once its parent exited (the orphaned-pipe case). Chromium, which puppeteer starts in a group of its own, is
    // found by the walk. A test's direct child stays in the test's group (see `childGroups`).
    const group = OWN_GROUP && childGroups;
    const child = spawn(process.execPath, [script, ...args], { cwd, env, detached: group });
    if (group && child.pid) {
      armGroupCleanup();
      liveGroups.add(child.pid);
    }
    let stdout = '';
    let stderr = '';
    // setEncoding, not toString per chunk: a character split across two chunks would decode as two U+FFFD.
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
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
      tree?.read(); // a fresh walk, while the child still runs; once it has exited the walk finds nothing new
      // Kill a pid only while it is still the process we saw: same start time. A pid freed and handed to an unrelated
      // process (possible on the orphaned-pipe path, where the last walk can be `stallMs` old) is left alone. The
      // child's process group is killed whole as well, which reaches what the walk missed.
      // The group: while the child runs, its pid is in use, so the group id is ours and is killed whole. Once the child
      // has exited (the orphaned-pipe path) its pid may already belong to a new group, so only members that started
      // before the child exited are ours, and each is killed by pid.
      const members = group && tree ? groupMembers(child.pid) : [];
      const ours = exitedAt === null ? members : members.filter(({ start }) => Number(start) <= exitedAt);
      const seenLive = [...(tree?.live() ?? []), ...ours];
      const procs = [...new Map(seenLive.filter(({ pid, start }) => running(pid, start)).map((p) => [p.pid, p])).values()];
      if (group && exitedAt === null) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* the group is already gone */ }
      }
      liveGroups.delete(child.pid);
      for (const { pid } of procs) {
        try { process.kill(pid, 'SIGKILL'); } catch { /* already gone */ }
      }
      child.kill('SIGKILL');
      // Let go of the child's pipes: a process outside the tree that still holds one must not keep this process open.
      child.stdout.destroy();
      child.stderr.destroy();
      const fail = (also = '') => reject(Object.assign(new Error(`test child hung: ${why}: ${what}${also}`), { stdout, stderr }));
      if (!procs.length) return fail();
      // SIGKILL is sent, not done: reject only once every process of the tree has died, so a hung Chromium never
      // outlives the test that started it. A process that survives 5 s of SIGKILL is named in the error.
      const killedBy = Date.now() + 5000;
      const reaped = setInterval(() => {
        const left = procs.filter(({ pid, start }) => running(pid, start));
        if (left.length && Date.now() < killedBy) return;
        clearInterval(reaped);
        fail(left.length ? ` (and pid ${left.map(({ pid }) => pid).join(', ')} survived SIGKILL)` : '');
      }, 20);
    };
    const ceiling = setTimeout(() => hung(`still running after ${ceilingMs / 1000} s`), ceilingMs);
    let orphaned = null;
    let exitedAt = null; // boot ticks when the child exited; a group member that started later is not ours
    child.on('exit', () => {
      exitedAt = bootTicks() ?? 0;
      liveGroups.delete(child.pid); // its pid, and so its group id, may now be reused
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
      liveGroups.delete(child.pid);
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

/** The options `runNodeSync` passes on to the watch; anything else is refused, not silently dropped. */
const WATCH_KEYS = new Set(['cpuBudgetMs', 'stallMs', 'stallCpuMs', 'ceilingMs', 'pollMs', 'watchProc']);
/** The watcher's verdict goes out on fd 3, a pipe its child is never given, so nothing the child prints can fake one. */
const VERDICT_FD = 3;

/**
 * `runNode` for a synchronous test: returns `{ status, stdout, stderr }` like `spawnSync` (plus `signal` when a signal
 * ended it), and throws when the child hangs. There is no `timeout` option on purpose: a wall-clock total is the F4
 * shape this helper replaces. `encoding` is accepted and ignored: output is always UTF-8 text.
 * @param {string} script
 * @param {string[]} [args]
 * @param {{ cwd?: string, env?: object, cpuBudgetMs?: number, stallMs?: number, stallCpuMs?: number, ceilingMs?: number, pollMs?: number, watchProc?: boolean }} [opts]
 * @returns {{ status: number | null, signal?: string, stdout: string, stderr: string }}
 */
function runNodeSync(script, args = [], opts = {}) {
  const { cwd, env = process.env, timeout, encoding, ...watch } = opts;
  if (timeout !== undefined) throw new TypeError('runNodeSync takes no `timeout`: it fails a child on a hang, never on a wall-clock total');
  const unknown = Object.keys(watch).filter((k) => !WATCH_KEYS.has(k));
  if (unknown.length) throw new TypeError(`runNodeSync does not take ${unknown.map((k) => `\`${k}\``).join(', ')}`);
  const r = spawnSync(process.execPath, [__filename, JSON.stringify(watch), script, ...args], {
    cwd, env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
  });
  if (r.error) throw r.error;
  // The watcher always writes a verdict ("{}" for a plain exit). None means the watcher itself died, so its status and
  // stderr say nothing about the child: report that, not a result.
  let verdict = null;
  try {
    verdict = JSON.parse(r.output[VERDICT_FD]);
  } catch { /* no verdict */ }
  if (!verdict) throw new Error(`runNodeSync's watcher died (status ${r.status}, signal ${r.signal}) before it reported\n--- its stderr ---\n${r.stderr}`);
  if (verdict.hung) throw new Error(`${verdict.hung}\n--- its stderr ---\n${r.stderr}`);
  return verdict.signal ? { status: null, signal: verdict.signal, stdout: r.stdout, stderr: r.stderr } : { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

// The watcher `runNodeSync` spawns: run the child under `runNode`, relay its output, exit as it exited, and say on
// fd 3 whether it hung or a signal ended it. (It reports the signal rather than raising it on itself: SIGUSR1 would
// open Node's debugger, and an ignored signal would leave the watcher exiting 0.)
if (require.main === module) {
  childGroups = true;
  armSignalCleanup();
  // If the test process dies (killed, or its job cancelled), nobody is left to read the verdict: take the child down
  // at once rather than letting it run on to its own ceiling. A dead parent shows as a new ppid (init, or a subreaper).
  const parent = process.ppid;
  setInterval(() => {
    if (process.ppid !== parent) {
      killLiveGroups();
      process.exit(1);
    }
  }, 250).unref();
  const [watch, script, ...args] = process.argv.slice(2);
  const say = (verdict) => fs.writeSync(VERDICT_FD, JSON.stringify(verdict));
  runNode(script, args, JSON.parse(watch)).then(
    ({ status, signal, stdout, stderr }) => {
      process.stdout.write(stdout);
      process.stderr.write(stderr);
      say(signal ? { signal } : {});
      process.exitCode = signal ? 1 : status; // not process.exit: that would cut off output still draining to the pipe
    },
    (err) => {
      process.stdout.write(err.stdout ?? '');
      process.stderr.write(err.stderr ?? '');
      say({ hung: err.message });
      process.exitCode = 124; // runNode let go of the child's pipes, so nothing it left behind keeps this process open
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
 *   - ceiling: 300 s, twice the slowest export's wall time under that load (143 s, against 10.5 s idle). It is held
 *     under twice that on purpose: a hang only the ceiling catches (a child that polls, never stalling) must still be
 *     reported inside a CI integration leg's 25-minute cap, where the slowest leg already runs about 16 minutes.
 */
const EXPORT_WATCH = Object.freeze({ stallMs: 10_000, stallCpuMs: 200, cpuBudgetMs: 180_000, ceilingMs: 300_000 });

module.exports = { runNode, runNodeSync, cpuMs, treeCpu, EXPORT_WATCH };
