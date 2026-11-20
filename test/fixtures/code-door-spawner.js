/**
 * A stand-in for a browser that keeps starting helpers, for os-sandbox-measure's `REAPED, SPAWNING` arm (#3333's
 * windows-2025 run 44789928753). Chromium can start a helper while `reap()` sweeps; a sweep that lists once and stops
 * once leaves that helper running. This parent makes the race certain instead of rare: it starts a child, waits for
 * it to start, ends its oldest child once it has KEEP of them, and starts the next, until it is killed. Every command
 * line names the profile folder (argv[2]), as Chromium's helpers do with `--user-data-dir`.
 *
 *   node code-door-spawner.js <profile dir>          the parent; prints `ready` once KEEP children are running
 *   node code-door-spawner.js <profile dir> child    a helper: it only waits
 *
 * On Windows each child is started DETACHED, which breaks it away from the parent's libuv job object: otherwise the
 * job would end every child when the parent dies, and the arm would pass against the one-pass sweep it exists to
 * catch. Off Windows the children stay in the parent's process group, as a browser's helpers do, and `reap()` ends
 * the group. A child the test fails to end exits on its own after LIFETIME_MS, so a red run leaks nothing for long;
 * that bound is a leak guard, not a wait, and it is longer than the test's own check.
 */
const { spawn } = require('node:child_process');

const [dir, role] = process.argv.slice(2);
const LIFETIME_MS = 240000;
const KEEP = 6;

if (role === 'child') {
  // `up` from inside the child's own code: the process is running and its command line is final. A child that starts
  // as its parent is killed writes into a closed pipe; it must survive that (EPIPE), because a survivor of the sweep is
  // exactly what the test looks for.
  process.stdout.on('error', () => {});
  process.stdout.write('up\n');
  setTimeout(() => process.exit(0), LIFETIME_MS);
} else {
  setTimeout(() => process.exit(0), LIFETIME_MS);
  const children = [];
  const ended = new WeakSet();
  let announced = false;
  let died = 0;
  // One child at a time: the next starts only once the last says `up`, so the race runs without a spawn storm on a
  // loaded runner, and a child counts only once it is really running (runs 44807739301 and 44812915927 read 1 process
  // where 7 were expected, with children counted at `spawn`).
  const next = () => {
    const child = spawn(process.execPath, [__filename, dir, 'child'], { stdio: ['ignore', 'pipe', 'inherit'], detached: process.platform === 'win32', windowsHide: true });
    let up = false;
    let moved = false;
    // Start the next child once per child, whichever of `up`, `error` or an early `exit` comes first.
    const onward = () => {
      if (!moved) {
        moved = true;
        setImmediate(next);
      }
    };
    child.once('error', (e) => {
      process.stderr.write(`code-door-spawner: a child failed to start: ${e.message}\n`);
      onward();
    });
    child.once('exit', (code, signal) => {
      if (!ended.has(child)) {
        process.stderr.write(`code-door-spawner: a child exited by itself (code ${code}, signal ${signal})\n`);
        // A child that cannot stay up is a broken fixture, not a race: say so and stop, rather than loop until the
        // test's timeout with nothing to read.
        if (++died >= 5) {
          process.stdout.write(`fatal: ${died} children exited by themselves\n`);
          process.exit(1);
        }
      }
      if (!up) onward();
    });
    child.stdout.once('data', () => {
      up = true;
      children.push(child);
      if (children.length > KEEP) {
        const oldest = children.shift();
        ended.add(oldest);
        try {
          oldest.kill('SIGKILL');
        } catch {
          /* already gone */
        }
      }
      if (!announced && children.length >= KEEP) {
        announced = true;
        process.stdout.write('ready\n');
      }
      onward();
    });
  };
  next();
}
